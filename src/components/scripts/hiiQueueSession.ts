import { sha256Hex } from "./checksum";
import { hexToBytes } from "./hex";
import {
  moveMenuReference,
  toggleTopLevelTabVisibility,
  type MenuReferenceMoveRequest,
} from "./menuEditing";
import { toggleUefiHiiMenuVisibility } from "./uefiHiiEditing";
import type { Data } from "./types";
import type { ChangeQueueEntry } from "./changeQueue";
import {
  createDataChangeEntry,
  diffData,
  projectDataChangeQueue,
  type DataChangePayload,
} from "../ChangeQueue/dataChangeQueue";
import { queueSessionTextLimit } from "./phoenixQueueSession";

export interface HiiQueueSessionContext {
  sourceBytes: Uint8Array;
  originalSetupSct: string;
  base: Data;
  // Trusted opened module locations/ownership, hashed but never exported.
  ownershipKey: string;
}
interface MoveOperation extends MenuReferenceMoveRequest {
  action: "move-ref";
  enabled: boolean;
}
interface VisibilityOperation {
  action: "visibility";
  sourceFormIndex: number;
  referenceChildIndex: number;
  visible: boolean;
  enabled: boolean;
}
type Operation = MoveOperation | VisibilityOperation;
interface Session {
  format: "uefi-editor-queue-session";
  version: 1;
  kind: "hii-ref-moves" | "hii-menu-actions";
  source: { sha256: string; size: number; contextSha256: string };
  operations: Operation[];
}
function invalid(message: string): never {
  throw new Error(`Queue session ${message}.`);
}
function record(value: unknown, keys: string[]): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}
function index(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function hash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}
function parse(text: string): Session {
  if (text.length > queueSessionTextLimit) invalid("exceeds the 1 MiB text limit");
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    invalid("is not valid JSON");
  }
  if (
    !record(value, ["format", "version", "kind", "source", "operations"]) ||
    value.format !== "uefi-editor-queue-session" ||
    value.version !== 1 ||
    (value.kind !== "hii-ref-moves" && value.kind !== "hii-menu-actions")
  )
    invalid("has an unsupported format, version or editor kind");
  const source = value.source;
  if (
    !record(source, ["sha256", "size", "contextSha256"]) ||
    !hash(source.sha256) ||
    !hash(source.contextSha256) ||
    !index(source.size) ||
    source.size === 0
  )
    invalid("has an invalid source identity");
  if (!Array.isArray(value.operations) || value.operations.length > 1000)
    invalid("has too many or invalid operations");
  const operations = value.operations.map((op: unknown): Operation => {
    if (value.kind === "hii-menu-actions") {
      if (
        record(op, [
          "action",
          "sourceFormIndex",
          "referenceChildIndex",
          "visible",
          "enabled",
        ]) &&
        op.action === "visibility" &&
        index(op.sourceFormIndex) &&
        index(op.referenceChildIndex) &&
        typeof op.visible === "boolean" &&
        typeof op.enabled === "boolean"
      ) {
        return {
          action: "visibility",
          sourceFormIndex: op.sourceFormIndex,
          referenceChildIndex: op.referenceChildIndex,
          visible: op.visible,
          enabled: op.enabled,
        };
      }
      if (
        !record(op, [
          "action",
          "sourceFormIndex",
          "referenceChildIndex",
          "destinationFormIndex",
          "enabled",
        ]) ||
        op.action !== "move-ref"
      )
        invalid("has an invalid menu action");
    }
    if (
      !record(op, [
        ...(value.kind === "hii-menu-actions" ? ["action"] : []),
        "sourceFormIndex",
        "referenceChildIndex",
        "destinationFormIndex",
        "enabled",
      ]) ||
      !index(op.sourceFormIndex) ||
      !index(op.referenceChildIndex) ||
      !index(op.destinationFormIndex) ||
      typeof op.enabled !== "boolean"
    )
      invalid("has an invalid Ref move");
    return {
      action: "move-ref",
      sourceFormIndex: op.sourceFormIndex,
      referenceChildIndex: op.referenceChildIndex,
      destinationFormIndex: op.destinationFormIndex,
      enabled: op.enabled,
    };
  });
  return {
    format: "uefi-editor-queue-session",
    version: 1,
    kind: value.kind,
    source: {
      sha256: source.sha256,
      size: source.size,
      contextSha256: source.contextSha256,
    },
    operations,
  };
}
async function identity(context: HiiQueueSessionContext) {
  if (!context.sourceBytes.length) invalid("requires an opened firmware image");
  const [sha256, setupSha256] = await Promise.all([
    sha256Hex(new Uint8Array(context.sourceBytes)),
    sha256Hex(hexToBytes(context.originalSetupSct)),
  ]);
  // Bind family, complete base state, module ownership and isolated editing
  // stream. Equal firmware bytes alone do not identify an opened Setup context.
  const contextSha256 = await sha256Hex(
    new TextEncoder().encode(
      JSON.stringify({
        setupSha256,
        base: context.base,
        ownershipKey: context.ownershipKey,
      }),
    ),
  );
  return { sha256, size: context.sourceBytes.length, contextSha256 };
}
async function regenerate(
  before: Data,
  context: HiiQueueSessionContext,
  operation: Operation,
  id: string,
) {
  // Select only existing Forms/Ref children; the normal editor proves opcodes,
  // scope, ownership, graph compatibility and fresh expected source bytes.
  const after =
    operation.action === "move-ref"
      ? await moveMenuReference(before, context.originalSetupSct, operation)
      : before.firmwareFamily === "uefi-hii"
        ? await toggleUefiHiiMenuVisibility(
            before,
            context.originalSetupSct,
            operation.sourceFormIndex,
            operation.referenceChildIndex,
            operation.visible,
          )
        : await toggleTopLevelTabVisibility(
            before,
            context.originalSetupSct,
            operation,
          );
  const entry = createDataChangeEntry(before, after, id);
  if (!entry) invalid("contains a menu action with no change");
  return { after, entry: { ...entry, enabled: operation.enabled } };
}
export async function saveHiiQueueSession(
  context: HiiQueueSessionContext,
  entries: ChangeQueueEntry<DataChangePayload>[],
) {
  if (entries.length > 1000) invalid("has too many operations");
  let before = context.base;
  const operations: Operation[] = [];
  for (const entry of entries) {
    // Paused entries are validated against the selected prefix too. Never
    // silently reinterpret stale/dependent or compound logical operations.
    const projected = projectDataChangeQueue(before, [{ ...entry, enabled: true }]);
    if (projected.analysis.issues.some((issue) => issue.severity === "error"))
      invalid("contains a stale operation");
    const after = projected.data;
    const priorCount = before.ifrEdits?.length ?? 0;
    const move = after.ifrEdits?.[priorCount];
    if (!move || after.ifrEdits?.length !== priorCount + 1)
      invalid(
        "supports individual Ref moves and menu visibility only; this queue contains another operation",
      );
    const sources = before.forms.flatMap((form, sourceFormIndex) =>
      form.children.flatMap((child, referenceChildIndex) =>
        child.type === "Ref" &&
        child.ifrOffset &&
        Number.parseInt(child.ifrOffset, 16) === move.sourceOffset
          ? [{ sourceFormIndex, referenceChildIndex }]
          : [],
      ),
    );
    const destinations = before.forms.flatMap((form, destinationFormIndex) =>
      after.forms[destinationFormIndex]?.children.length === form.children.length + 1
        ? [destinationFormIndex]
        : [],
    );
    if (sources.length !== 1)
      invalid(
        "supports individual Ref moves and menu visibility only; the operation is ambiguous or unsupported",
      );
    // Local descriptions are only a routing hint. The complete regenerated
    // state must match below, so changing a label cannot promote an operation.
    const visibility = /^(Hide|Show) top-level tab /.exec(move.description);
    if (!visibility && destinations.length !== 1)
      invalid("contains an ambiguous or unsupported Ref move");
    const operation: Operation = visibility
      ? {
          action: "visibility",
          ...sources[0],
          visible: visibility[1] === "Show",
          enabled: entry.enabled,
        }
      : {
          action: "move-ref",
          ...sources[0],
          destinationFormIndex: destinations[0],
          enabled: entry.enabled,
        };
    const regenerated = await regenerate(before, context, operation, entry.id);
    if (diffData(after, regenerated.after).length)
      invalid(
        "supports individual Ref moves and menu visibility only; the operation includes other changes",
      );
    operations.push(operation);
    if (entry.enabled) before = regenerated.after;
  }
  const legacy = operations.every((operation) => operation.action === "move-ref");
  const session = {
    format: "uefi-editor-queue-session",
    version: 1,
    kind: legacy ? "hii-ref-moves" : "hii-menu-actions",
    source: await identity(context),
    operations: legacy
      ? operations.map((operation) => {
          if (operation.action !== "move-ref")
            invalid("contains an unsupported operation");
          return {
            sourceFormIndex: operation.sourceFormIndex,
            referenceChildIndex: operation.referenceChildIndex,
            destinationFormIndex: operation.destinationFormIndex,
            enabled: operation.enabled,
          };
        })
      : operations,
  };
  const text = JSON.stringify(session, null, 2);
  parse(text);
  return text;
}
export async function loadHiiQueueSession(
  text: string,
  context: HiiQueueSessionContext,
) {
  const session = parse(text);
  const current = await identity(context);
  if (
    current.sha256 !== session.source.sha256 ||
    current.size !== session.source.size ||
    current.contextSha256 !== session.source.contextSha256
  )
    invalid("belongs to a different firmware image or opened HII context");
  let before = context.base;
  const entries: ChangeQueueEntry<DataChangePayload>[] = [];
  for (const [index, operation] of session.operations.entries()) {
    const regenerated = await regenerate(
      before,
      context,
      operation,
      `session-ref:${String(index + 1)}`,
    );
    entries.push(regenerated.entry);
    if (operation.enabled) before = regenerated.after;
  }
  return entries;
}
