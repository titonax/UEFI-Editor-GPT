import type { FirmwareArtifactKind } from "./firmwareProvenance";
import { FirmwareError } from "./errors";

/** Exact real-image acceptance for Setup HII edits in a compressed AMI path. */
export const acceptedLzmaSetupImage = {
  sha256: "fcd0a7d9f42934b92783bc569ad3f48dea8e6b9775d0fafdd7b2dee9af587b03",
  size: 16 * 1024 * 1024,
} as const;

/** Exact nested-FV LZMA acceptance for Setup HII in a complete Intel SPI. */
export const acceptedNestedLzmaSetupImage = {
  sha256: "cd22f87daee0d50bf82520aaa6669a6731bdaaf3692690649533790c8e027f9a",
  size: 4 * 1024 * 1024,
} as const;

export function hasAcceptedNestedLzmaSetupSource(
  hash: string | undefined,
  size: number,
) {
  return (
    hash?.toLowerCase() === acceptedNestedLzmaSetupImage.sha256 &&
    size === acceptedNestedLzmaSetupImage.size
  );
}

export function hasAcceptedLzmaSetupSource(hash: string | undefined, size: number) {
  return [acceptedLzmaSetupImage, acceptedNestedLzmaSetupImage].some(
    (source) => hash?.toLowerCase() === source.sha256 && size === source.size,
  );
}

/** Exact Tiano-compressed Setup HII acceptance for a complete Intel SPI input. */
export const acceptedTianoSetupImage = {
  sha256: "297390ca838c455791a5bf3a3f0001fbf36a8cb31be362ea2123b8df84dfffe8",
  size: 8 * 1024 * 1024,
} as const;

export function hasAcceptedStandardSetupSource(hash: string | undefined, size: number) {
  return (
    hash?.toLowerCase() === acceptedTianoSetupImage.sha256 &&
    size === acceptedTianoSetupImage.size
  );
}

/** Source-specific artifact scope backed by independent real-image re-extraction. */
export function acceptedCompressedArtifactKinds(
  hash: string | undefined,
  size: number,
): readonly FirmwareArtifactKind[] {
  if (
    hasAcceptedStandardSetupSource(hash, size) ||
    hasAcceptedNestedLzmaSetupSource(hash, size)
  )
    return ["setup-hii", "setupdata"];
  if (hasAcceptedLzmaSetupSource(hash, size)) return ["setup-hii"];
  return [];
}

export function assertAcceptedCompressedArtifactEdits(
  hash: string | undefined,
  size: number,
  kinds: readonly FirmwareArtifactKind[],
) {
  const accepted = acceptedCompressedArtifactKinds(hash, size);
  const blocked = kinds.filter((kind) => !accepted.includes(kind));
  if (blocked.length) {
    throw new FirmwareError(
      "PATCH_FAILED",
      `No real-image acceptance for compressed ${blocked.join(", ")} edits on this source.`,
    );
  }
}

/** Real root-vector reconstruction acceptance is separate from HII acceptance. */
export function hasAcceptedRootVisibilitySource(
  hash: string | undefined,
  size: number,
) {
  return (
    (hash?.toLowerCase() === acceptedTianoSetupImage.sha256 &&
      size === acceptedTianoSetupImage.size) ||
    hasAcceptedNestedLzmaSetupSource(hash, size)
  );
}
