import { inventoryFirmwareFiles } from "./aptioIvExtractor";
import { FirmwareError } from "./errors";
import type { FirmwareBufferNode, FirmwareFileReference } from "./firmwareProvenance";

function fail(message: string): never {
  throw new FirmwareError("INTEGRITY_MISMATCH", message);
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  return (
    left.length === right.length && left.every((byte, index) => byte === right[index])
  );
}

/**
 * Independent read-back guard for mixed identity trees. Module bodies are
 * checked against requested edits by the caller. Here every other decoded byte,
 * child payload, FFS allocation and repaired checksum is verified, including
 * ancestors without HII and nested FV headers/padding not covered by any module.
 */
export function verifyUefiHiiIdentityBuffers(
  before: FirmwareBufferNode[],
  after: FirmwareBufferNode[],
  changedFiles: FirmwareFileReference[],
) {
  const originals = new Map(before.map((node) => [node.id, node]));
  const actuals = new Map(after.map((node) => [node.id, node]));
  if (
    originals.size !== before.length ||
    actuals.size !== after.length ||
    before.length !== after.length
  )
    fail("Mixed HII decoded-buffer inventory changed after re-opening.");
  const allowed = new Map<number, { start: number; end: number }[]>();
  const repairs = new Map<string, FirmwareFileReference>();
  const propagated = new Set<number>();
  const allow = (id: number, start: number, end: number) => {
    const ranges = allowed.get(id) ?? [];
    ranges.push({ start, end });
    allowed.set(id, ranges);
  };
  const repair = (file: FirmwareFileReference) => {
    repairs.set(`${String(file.bufferId)}:${String(file.fileStart)}`, file);
    allow(file.bufferId, file.fileStart + 16, file.fileStart + 18);
  };
  for (const file of changedFiles) {
    allow(file.bufferId, file.bodyStart, file.end);
    repair(file);
    let node = originals.get(file.bufferId);
    const visited = new Set<number>();
    while (node?.parent) {
      if (visited.has(node.id)) fail("Mixed HII identity provenance contains a cycle.");
      visited.add(node.id);
      const edge = node.parent;
      if (
        edge.compression !== "none" ||
        !edge.ownerFile ||
        node.bytes.length !== edge.payloadEnd - edge.payloadStart
      )
        fail("Mixed HII output requires complete identity-only ancestry.");
      allow(edge.parentBufferId, edge.payloadStart, edge.payloadEnd);
      repair(edge.ownerFile);
      propagated.add(node.id);
      node = originals.get(edge.parentBufferId);
    }
    if (node?.id !== 0) fail("Mixed HII identity ancestry does not reach the source.");
  }
  for (const original of before) {
    const actual = actuals.get(original.id);
    if (
      actual?.depth !== original.depth ||
      actual.bytes.length !== original.bytes.length ||
      JSON.stringify(actual.parent) !== JSON.stringify(original.parent)
    )
      fail("Mixed HII decoded-buffer provenance changed after re-opening.");
    const ranges = allowed.get(original.id) ?? [];
    for (let offset = 0; offset < original.bytes.length; offset++) {
      if (actual.bytes[offset] === original.bytes[offset]) continue;
      if (!ranges.some((range) => offset >= range.start && offset < range.end))
        fail("Mixed HII output changed an unowned decoded byte.");
    }
    if (propagated.has(original.id) && original.parent) {
      const edge = original.parent;
      const parent = actuals.get(edge.parentBufferId);
      if (
        !parent ||
        !equalBytes(
          parent.bytes.subarray(edge.payloadStart, edge.payloadEnd),
          actual.bytes,
        )
      )
        fail(
          "Mixed HII parent payload does not match its independently decoded child.",
        );
    }
  }
  for (const file of repairs.values()) {
    const node = actuals.get(file.bufferId);
    const actual =
      node &&
      inventoryFirmwareFiles(node).find(
        (candidate) =>
          candidate.guid === file.guid &&
          candidate.fileStart === file.fileStart &&
          candidate.bodyStart === file.bodyStart &&
          candidate.end === file.end &&
          candidate.volumeStart === file.volumeStart &&
          candidate.volumeEnd === file.volumeEnd,
      );
    if (!node || !actual) fail("Mixed HII repaired FFS allocation changed.");
    const bytes = node.bytes;
    let headerSum = 0;
    for (let offset = file.fileStart; offset < file.bodyStart; offset++) {
      if (offset !== file.fileStart + 17 && offset !== file.fileStart + 23)
        headerSum = (headerSum + bytes[offset]) & 255;
    }
    let bodySum = bytes[file.fileStart + 17];
    if ((bytes[file.fileStart + 19] & 0x40) !== 0) {
      for (let offset = file.bodyStart; offset < file.end; offset++)
        bodySum = (bodySum + bytes[offset]) & 255;
    } else {
      bodySum = bodySum === 0xaa ? 0 : 1;
    }
    if (headerSum !== 0 || bodySum !== 0)
      fail("Mixed HII repaired FFS checksum is invalid.");
  }
}
