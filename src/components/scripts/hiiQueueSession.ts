import { sha256Hex } from "./checksum";
import { hexToBytes } from "./hex";
import { moveMenuReference, type MenuReferenceMoveRequest } from "./menuEditing";
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
interface Operation extends MenuReferenceMoveRequest {
  enabled: boolean;
}
interface Session {
  format: "uefi-editor-queue-session";
  version: 1;
  kind: "hii-ref-moves";
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
    value.kind !== "hii-ref-moves"
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
    if (
      !record(op, [
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
      sourceFormIndex: op.sourceFormIndex,
      referenceChildIndex: op.referenceChildIndex,
      destinationFormIndex: op.destinationFormIndex,
      enabled: op.enabled,
    };
  });
  return {
    format: "uefi-editor-queue-session",
    version: 1,
    kind: "hii-ref-moves",
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
  const after = await moveMenuReference(before, context.originalSetupSct, operation);
  const entry = createDataChangeEntry(before, after, id);
  if (!entry) invalid("contains a Ref move with no change");
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
        "supports individual Ref moves only; this queue contains another operation",
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
    if (sources.length !== 1 || destinations.length !== 1)
      invalid(
        "supports individual Ref moves only; the operation is ambiguous or unsupported",
      );
    const operation = {
      ...sources[0],
      destinationFormIndex: destinations[0],
      enabled: entry.enabled,
    };
    const regenerated = await regenerate(before, context, operation, entry.id);
    if (diffData(after, regenerated.after).length)
      invalid(
        "supports individual Ref moves only; the operation includes other changes",
      );
    operations.push(operation);
    if (entry.enabled) before = regenerated.after;
  }
  const session: Session = {
    format: "uefi-editor-queue-session",
    version: 1,
    kind: "hii-ref-moves",
    source: await identity(context),
    operations,
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
