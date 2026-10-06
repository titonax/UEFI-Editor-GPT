import { FirmwareError } from "./errors";
import { assertAmiRootVisibilityEditsMatch } from "./amiRootVisibilityEditing";
import type { FirmwareProvenanceGraph } from "./firmwareProvenance";
import type { AmiRootVisibilityEdit, AmiRootVisibilityReport } from "./types";
import type { FirmwareBufferPatch } from "./uefiImageRebuilder";

/** The caller supplies a report recomputed from the immutable opened source. */
export function planAmiRootVisibilityPatches(
  edits: AmiRootVisibilityEdit[],
  report: AmiRootVisibilityReport | undefined,
  graph: FirmwareProvenanceGraph,
): FirmwareBufferPatch[] {
  assertAmiRootVisibilityEditsMatch(edits, report);
  if (!report?.vector || report.status !== "detected") {
    throw new FirmwareError("INTEGRITY_MISMATCH", "A fresh root vector is required.");
  }
  const vector = report.vector;
  const node = graph.buffers.find((candidate) => candidate.id === vector.bufferId);
  if (
    !node ||
    report.entries.length !== vector.length ||
    report.entries.some(
      (entry, index) =>
        entry.rootIndex !== index ||
        entry.bufferOffset !== vector.offset + index ||
        node.bytes[entry.bufferOffset] !== entry.value,
    )
  ) {
    throw new FirmwareError("INTEGRITY_MISMATCH", "Root vector source bytes changed.");
  }
  if (edits.some((edit) => edit.replacement !== 0 && edit.replacement !== 1)) {
    throw new FirmwareError("INVALID_INPUT", "Root visibility must be zero or one.");
  }
  if (
    !report.entries.some(
      (entry) =>
        (edits.find((edit) => edit.rootIndex === entry.rootIndex)?.replacement ??
          entry.value) === 1,
    )
  ) {
    throw new FirmwareError(
      "PATCH_FAILED",
      "At least one root FormSet must remain enabled.",
    );
  }
  return edits.map((edit) => ({
    artifactKind: "setup-hii",
    bufferId: edit.bufferId,
    offset: edit.bufferOffset,
    expected: Uint8Array.of(edit.expected),
    replacement: Uint8Array.of(edit.replacement),
  }));
}
