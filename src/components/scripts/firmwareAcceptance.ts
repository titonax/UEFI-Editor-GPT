/** Exact real-image acceptance for Setup HII edits in a compressed AMI path. */
export const acceptedLzmaSetupImage = {
  sha256: "fcd0a7d9f42934b92783bc569ad3f48dea8e6b9775d0fafdd7b2dee9af587b03",
  size: 16 * 1024 * 1024,
} as const;

export function hasAcceptedLzmaSetupSource(hash: string | undefined, size: number) {
  return (
    hash?.toLowerCase() === acceptedLzmaSetupImage.sha256 &&
    size === acceptedLzmaSetupImage.size
  );
}
