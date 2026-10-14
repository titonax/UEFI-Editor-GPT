import { sha256Hex } from "./checksum";
import { analyzeChangeQueue, type ChangeQueueEntry } from "./changeQueue";
import {
  phoenixShowChange,
  phoenixTemplatBufferId,
  type PhoenixVisibilityPayload,
} from "./phoenixChangeQueue";
import type { PhoenixSetupInventory } from "./phoenixSetupMenu";

export const queueSessionTextLimit = 1024 * 1024;
const operationLimit = 1000;
interface Operation {
  action: "show";
  itemOffset: number;
  enabled: boolean;
}
interface PhoenixQueueSession {
  format: "uefi-editor-queue-session";
  version: 2;
  kind: "phoenix-visibility";
  source: { sha256: string; size: number; templatSha256: string };
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
function isOffset(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function isHash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}
function parse(text: string): PhoenixQueueSession {
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
    value.kind !== "phoenix-visibility"
  )
    invalid("has an unsupported format, version or editor kind");
  const source = value.source;
  if (
    !record(source, ["sha256", "size", "templatSha256"]) ||
    !isHash(source.sha256) ||
    !isHash(source.templatSha256) ||
    !isOffset(source.size) ||
    source.size === 0
  )
    invalid("has an invalid source identity");
  if (!Array.isArray(value.operations) || value.operations.length > operationLimit)
    invalid("has too many or invalid operations");
  const offsets = new Set<number>();
  const operations: Operation[] = value.operations.map((operation: unknown) => {
    const keys =
      value.version === 1
        ? ["itemOffset", "enabled"]
        : ["action", "itemOffset", "enabled"];
    if (
      !record(operation, keys) ||
      (value.version === 2 && operation.action !== "show") ||
      !isOffset(operation.itemOffset) ||
      typeof operation.enabled !== "boolean"
    )
      invalid("has an invalid operation");
    if (offsets.has(operation.itemOffset)) invalid("contains a duplicate item");
    offsets.add(operation.itemOffset);
    return {
      action: "show",
      itemOffset: operation.itemOffset,
      enabled: operation.enabled,
    };
  });
  return {
    format: "uefi-editor-queue-session",
    version: 2,
    kind: "phoenix-visibility",
    source: {
      sha256: source.sha256,
      size: source.size,
      templatSha256: source.templatSha256,
    },
    operations,
  };
}
async function identity(sourceBytes: Uint8Array, inventory: PhoenixSetupInventory) {
  if (sourceBytes.length === 0) invalid("requires an opened firmware image");
  const [sha256, templatSha256] = await Promise.all([
    sha256Hex(new Uint8Array(sourceBytes)),
    sha256Hex(new Uint8Array(inventory.templat)),
  ]);
  return { sha256, size: sourceBytes.length, templatSha256 };
}
function regenerate(operations: Operation[], inventory: PhoenixSetupInventory) {
  const items = inventory.menu.sections.flatMap((section) => section.items);
  const entries = operations.map((operation) => {
    const matches = items.filter((item) => item.offset === operation.itemOffset);
    if (matches.length !== 1) invalid("targets a missing or ambiguous item");
    return { ...phoenixShowChange(matches[0]), enabled: operation.enabled };
  });
  // Validate paused operations too: enabling them later must not introduce an
  // imported stale, overlapping or out-of-bounds patch.
  const analysis = analyzeChangeQueue(
    entries.map((entry) => ({ ...entry, enabled: true })),
    { [phoenixTemplatBufferId]: inventory.templat },
  );
  if (analysis.issues.some((issue) => issue.severity === "error"))
    invalid("does not match the opened template patch preconditions");
  return entries;
}
export async function savePhoenixQueueSession(
  sourceBytes: Uint8Array,
  inventory: PhoenixSetupInventory,
  entries: ChangeQueueEntry<PhoenixVisibilityPayload>[],
) {
  const operations = entries.map((entry) => ({
    action: "show" as const,
    itemOffset: entry.payload.itemOffset,
    enabled: entry.enabled,
  }));
  const session: PhoenixQueueSession = {
    format: "uefi-editor-queue-session",
    version: 2,
    kind: "phoenix-visibility",
    source: await identity(sourceBytes, inventory),
    operations,
  };
  const text = JSON.stringify(session, null, 2);
  const checked = parse(text);
  regenerate(checked.operations, inventory);
  return text;
}
export async function loadPhoenixQueueSession(
  text: string,
  sourceBytes: Uint8Array,
  inventory: PhoenixSetupInventory,
) {
  const session = parse(text);
  const current = await identity(sourceBytes, inventory);
  if (
    session.source.sha256 !== current.sha256 ||
    session.source.size !== current.size ||
    session.source.templatSha256 !== current.templatSha256
  )
    invalid("belongs to a different firmware image or template");
  return regenerate(session.operations, inventory);
}
