import {
  regenerateSessionAmiMenu,
  type AmiMenuSessionChange,
} from "./amiMenuSessionEditing";
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
import type { FirmwareProvenanceGraph } from "./firmwareProvenance";
import {
  regenerateSessionAmiRoots,
  type AmiRootSessionChange,
} from "./amiRootSessionEditing";
import { desiredAmiRootVisibility } from "./amiRootVisibilityEditing";
import {
  regenerateSessionSuppressions,
  type SuppressionSessionChange,
} from "./suppressionSessionEditing";

export interface HiiQueueSessionContext {
  sourceBytes: Uint8Array;
  originalSetupSct: string;
  base: Data;
  // Trusted opened module locations/ownership, hashed but never exported.
  ownershipKey: string;
  originalSetupData?: string;
  originalAmitse?: string;
  provenance?: FirmwareProvenanceGraph;
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
const amiValueFields = ["accessLevel", "failsafe", "optimal"] as const;
type AmiValueField = (typeof amiValueFields)[number];
interface AmiValueChange {
  formIndex: number;
  childIndex: number;
  field: AmiValueField;
  value: string;
}
interface AmiValuesOperation {
  action: "ami-values";
  changes: AmiValueChange[];
  enabled: boolean;
}
interface SuppressionsOperation {
  action: "suppressions";
  changes: SuppressionSessionChange[];
  enabled: boolean;
}
interface AmiRootsOperation {
  action: "ami-roots";
  changes: AmiRootSessionChange[];
  enabled: boolean;
}
interface AmiMenuOperation {
  action: "ami-menu";
  changes: AmiMenuSessionChange[];
  enabled: boolean;
}
type Operation =
  | AmiMenuOperation
  | AmiRootsOperation
  | MoveOperation
  | VisibilityOperation
  | AmiValuesOperation
  | SuppressionsOperation;
interface Session {
  format: "uefi-editor-queue-session";
  version: 2;
  kind: "hii-menu-actions";
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
function valueField(value: unknown): value is AmiValueField {
  return amiValueFields.some((field) => field === value);
}
function byteValue(value: unknown): value is string {
  return typeof value === "string" && /^[0-9A-F]{1,2}$/.test(value);
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
    (value.version !== 1 && value.version !== 2) ||
    (value.version === 1 &&
      value.kind !== "hii-ref-moves" &&
      value.kind !== "hii-menu-actions") ||
    (value.version === 2 && value.kind !== "hii-menu-actions")
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
  const explicitActions = value.kind === "hii-menu-actions";
  const operations = value.operations.map((op: unknown): Operation => {
    if (explicitActions) {
      if (record(op, ["action", "changes", "enabled"]) && op.action === "ami-menu") {
        if (
          !Array.isArray(op.changes) ||
          !op.changes.length ||
          op.changes.length > 1000 ||
          typeof op.enabled !== "boolean"
        )
          invalid("has an invalid AMI menu batch");
        const targets = new Set<number>();
        const changes = op.changes.map((change: unknown): AmiMenuSessionChange => {
          if (
            !record(change, ["menuIndex", "targetFormIndex"]) ||
            !index(change.menuIndex) ||
            !index(change.targetFormIndex)
          )
            invalid("has an invalid AMI menu selector");
          if (targets.has(change.menuIndex))
            invalid("contains a duplicate menu target");
          targets.add(change.menuIndex);
          return {
            menuIndex: change.menuIndex,
            targetFormIndex: change.targetFormIndex,
          };
        });
        return { action: "ami-menu", changes, enabled: op.enabled };
      }

      if (record(op, ["action", "changes", "enabled"]) && op.action === "ami-roots") {
        if (
          !Array.isArray(op.changes) ||
          !op.changes.length ||
          op.changes.length > 1000 ||
          typeof op.enabled !== "boolean"
        )
          invalid("has an invalid AMI root batch");
        const targets = new Set<number>();
        const changes = op.changes.map((change: unknown): AmiRootSessionChange => {
          if (
            !record(change, ["rootIndex", "visible"]) ||
            !index(change.rootIndex) ||
            typeof change.visible !== "boolean"
          )
            invalid("has an invalid AMI root selector");
          if (targets.has(change.rootIndex))
            invalid("contains a duplicate root target");
          targets.add(change.rootIndex);
          return { rootIndex: change.rootIndex, visible: change.visible };
        });
        return { action: "ami-roots", changes, enabled: op.enabled };
      }
      if (
        record(op, ["action", "changes", "enabled"]) &&
        op.action === "suppressions"
      ) {
        if (
          !Array.isArray(op.changes) ||
          !op.changes.length ||
          op.changes.length > 1000 ||
          typeof op.enabled !== "boolean"
        )
          invalid("has an invalid suppression batch");
        const targets = new Set<number>();
        const changes = op.changes.map((change: unknown): SuppressionSessionChange => {
          if (
            !record(change, ["conditionIndex", "active"]) ||
            !index(change.conditionIndex) ||
            typeof change.active !== "boolean"
          )
            invalid("has an invalid suppression change");
          if (targets.has(change.conditionIndex))
            invalid("contains a duplicate condition target");
          targets.add(change.conditionIndex);
          return { conditionIndex: change.conditionIndex, active: change.active };
        });
        return { action: "suppressions", changes, enabled: op.enabled };
      }
      if (record(op, ["action", "changes", "enabled"]) && op.action === "ami-values") {
        if (
          !Array.isArray(op.changes) ||
          !op.changes.length ||
          op.changes.length > 1000 ||
          typeof op.enabled !== "boolean"
        )
          invalid("has an invalid AMI value batch");
        const targets = new Set<string>();
        const changes = op.changes.map((change: unknown): AmiValueChange => {
          if (
            !record(change, ["formIndex", "childIndex", "field", "value"]) ||
            !index(change.formIndex) ||
            !index(change.childIndex) ||
            !valueField(change.field) ||
            !byteValue(change.value)
          )
            invalid("has an invalid AMI value change");
          const key = `${String(change.formIndex)}:${String(change.childIndex)}:${change.field}`;
          if (targets.has(key)) invalid("contains a duplicate AMI value target");
          targets.add(key);
          return {
            formIndex: change.formIndex,
            childIndex: change.childIndex,
            field: change.field,
            value: change.value,
          };
        });
        return { action: "ami-values", changes, enabled: op.enabled };
      }
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
        ...(explicitActions ? ["action"] : []),
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
    version: 2,
    kind: "hii-menu-actions",
    source: {
      sha256: source.sha256,
      size: source.size,
      contextSha256: source.contextSha256,
    },
    operations,
  };
}
async function regenerateAmiValues(
  before: Data,
  context: HiiQueueSessionContext,
  operation: AmiValuesOperation,
) {
  if (
    !["aptio-v", "aptio-iv", "ami-aptio"].includes(before.firmwareFamily ?? "") ||
    !context.originalSetupData
  )
    invalid("requires an AMI workspace with opened SetupData");
  const source = hexToBytes(context.originalSetupData);
  if ((await sha256Hex(source)) !== context.base.hashes.setupdataBin)
    invalid("does not match the opened SetupData source hash");
  const next = structuredClone(before);
  for (const change of operation.changes) {
    const child = next.forms[change.formIndex]?.children[change.childIndex];
    if (
      !child?.offsets ||
      amiValueFields.some((field) => child[field] === null || !byteValue(child[field]))
    )
      invalid("targets an unavailable or incomplete AMI value field");
    const offsetText = child.offsets[change.field];
    if (!/^0x[0-9a-f]+$/i.test(offsetText))
      invalid("targets an invalid SetupData mapping");
    const offset = Number.parseInt(offsetText, 16);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset >= source.length)
      invalid("targets a SetupData mapping outside its source");
    // SetupData offsets are not IFR offsets: structural Ref moves do not remap
    // these records. Match a unique original byte owner, then stage only the
    // same scalar assignment already exposed by the AMI controls.
    const owners = context.base.forms.flatMap((form) =>
      form.children.flatMap((original) =>
        amiValueFields.flatMap((field) =>
          original.offsets && Number.parseInt(original.offsets[field], 16) === offset
            ? [{ original, field }]
            : [],
        ),
      ),
    );
    if (
      owners.length !== 1 ||
      owners[0].original[owners[0].field] === null ||
      Number.parseInt(owners[0].original[owners[0].field] ?? "", 16) !== source[offset]
    )
      invalid("targets an ambiguous or stale original SetupData byte");
    child[change.field] = change.value;
  }
  return next;
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
    operation.action === "ami-menu"
      ? await regenerateSessionAmiMenu(
          before,
          context.base,
          context.originalAmitse,
          operation.changes,
        )
      : operation.action === "ami-roots"
        ? regenerateSessionAmiRoots(
            before,
            context.base,
            context.sourceBytes,
            context.provenance,
            operation.changes,
          )
        : operation.action === "suppressions"
          ? await regenerateSessionSuppressions(
              before,
              context.originalSetupSct,
              operation.changes,
            )
          : operation.action === "ami-values"
            ? await regenerateAmiValues(before, context, operation)
            : operation.action === "move-ref"
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
    if (entry.payload.patches.some((patch) => patch.path[0] === "menu")) {
      const changes = before.menu.flatMap((menu, menuIndex): AmiMenuSessionChange[] => {
        const target = after.menu[menuIndex];
        if (!target || menu.formId === target.formId) return [];
        const candidates = before.forms.flatMap((form, targetFormIndex) =>
          form.formSetGuid === menu.formSetGuid && form.formId === target.formId
            ? [targetFormIndex]
            : [],
        );
        if (candidates.length !== 1) invalid("contains an ambiguous menu destination");
        return [{ menuIndex, targetFormIndex: candidates[0] }];
      });
      if (!changes.length) invalid("contains an invalid menu reassignment");
      const operation: AmiMenuOperation = {
        action: "ami-menu",
        changes,
        enabled: entry.enabled,
      };
      const regenerated = await regenerate(before, context, operation, entry.id);
      if (diffData(after, regenerated.after).length)
        invalid("contains other changes in a menu batch");
      operations.push(operation);
      if (entry.enabled) before = regenerated.after;
      continue;
    }

    if (
      entry.payload.patches.some((patch) => patch.path[0] === "rootVisibilityEdits")
    ) {
      const changes = (before.rootVisibility?.entries ?? []).flatMap(
        (root): AmiRootSessionChange[] =>
          desiredAmiRootVisibility(before, root) !==
          desiredAmiRootVisibility(after, root)
            ? [
                {
                  rootIndex: root.rootIndex,
                  visible: desiredAmiRootVisibility(after, root) === 1,
                },
              ]
            : [],
      );
      if (!changes.length) invalid("contains an invalid root operation");
      const operation: AmiRootsOperation = {
        action: "ami-roots",
        changes,
        enabled: entry.enabled,
      };
      const regenerated = await regenerate(before, context, operation, entry.id);
      if (diffData(after, regenerated.after).length)
        invalid("contains other changes in a root batch");
      operations.push(operation);
      if (entry.enabled) before = regenerated.after;
      continue;
    }
    const suppressionChanges = entry.payload.patches.flatMap(
      (patch): SuppressionSessionChange[] => {
        const [root, conditionIndex, field] = patch.path;
        return patch.path.length === 3 &&
          root === "suppressions" &&
          index(conditionIndex) &&
          field === "active" &&
          patch.expectedExists &&
          patch.replacementExists &&
          typeof patch.replacement === "boolean"
          ? [{ conditionIndex, active: patch.replacement }]
          : [];
      },
    );
    if (suppressionChanges.length) {
      const operation: SuppressionsOperation = {
        action: "suppressions",
        changes: suppressionChanges,
        enabled: entry.enabled,
      };
      const regenerated = await regenerate(before, context, operation, entry.id);
      if (diffData(after, regenerated.after).length)
        invalid("contains other changes in a suppression batch");
      operations.push(operation);
      if (entry.enabled) before = regenerated.after;
      continue;
    }
    const scalarChanges = entry.payload.patches.map((patch): AmiValueChange | null => {
      const [root, formIndex, children, childIndex, field] = patch.path;
      return patch.path.length === 5 &&
        root === "forms" &&
        index(formIndex) &&
        children === "children" &&
        index(childIndex) &&
        valueField(field) &&
        patch.expectedExists &&
        patch.replacementExists &&
        byteValue(patch.replacement)
        ? { formIndex, childIndex, field, value: patch.replacement }
        : null;
    });
    if (scalarChanges.length && scalarChanges.every((change) => change !== null)) {
      const operation: AmiValuesOperation = {
        action: "ami-values",
        changes: scalarChanges,
        enabled: entry.enabled,
      };
      const regenerated = await regenerate(before, context, operation, entry.id);
      if (diffData(after, regenerated.after).length)
        invalid("contains other changes in an AMI value batch");
      operations.push(operation);
      if (entry.enabled) before = regenerated.after;
      continue;
    }
    const priorCount = before.ifrEdits?.length ?? 0;
    const move = after.ifrEdits?.[priorCount];
    if (!move || after.ifrEdits?.length !== priorCount + 1)
      invalid(
        "supports individual Ref moves, menu visibility, suppression overrides, mapped AMI values, proven AMI roots and AMITSE menu reassignment only; this queue contains another operation",
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
        "supports individual Ref moves, menu visibility, suppression overrides, mapped AMI values, proven AMI roots and AMITSE menu reassignment only; the operation is ambiguous or unsupported",
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
        "supports individual Ref moves, menu visibility, suppression overrides, mapped AMI values, proven AMI roots and AMITSE menu reassignment only; the operation includes other changes",
      );
    operations.push(operation);
    if (entry.enabled) before = regenerated.after;
  }
  const session = {
    format: "uefi-editor-queue-session",
    version: 2,
    kind: "hii-menu-actions",
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
