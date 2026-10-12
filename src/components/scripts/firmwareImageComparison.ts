export interface FirmwareImageChangedRange {
  start: number;
  end: number;
  original: number[];
  rebuilt: number[];
}
export interface FirmwareImageComparison {
  imageSize: number;
  changedByteCount: number;
  unchangedByteCount: number;
  changedRangeCount: number;
  ranges: FirmwareImageChangedRange[];
}
export const imageComparisonRangeLimit = 64;
export const imageComparisonSampleLimit = 16;

/** Scan the complete physical image once; retain only bounded display samples. */
export function compareFirmwareImages(
  original: Uint8Array,
  rebuilt: Uint8Array,
): FirmwareImageComparison {
  if (original.length !== rebuilt.length)
    throw new Error(
      "Complete-image comparison requires equal original and rebuilt sizes.",
    );
  const ranges: FirmwareImageChangedRange[] = [];
  let changedByteCount = 0;
  let changedRangeCount = 0;
  let active: FirmwareImageChangedRange | undefined;
  let inRange = false;
  for (let offset = 0; offset < original.length; offset++) {
    if (original[offset] === rebuilt[offset]) {
      inRange = false;
      active = undefined;
      continue;
    }
    changedByteCount++;
    if (!inRange) {
      changedRangeCount++;
      inRange = true;
      if (ranges.length < imageComparisonRangeLimit) {
        active = { start: offset, end: offset, original: [], rebuilt: [] };
        ranges.push(active);
      }
    }
    if (active) {
      active.end = offset + 1;
      if (active.original.length < imageComparisonSampleLimit) {
        active.original.push(original[offset]);
        active.rebuilt.push(rebuilt[offset]);
      }
    }
  }
  return {
    imageSize: original.length,
    changedByteCount,
    unchangedByteCount: original.length - changedByteCount,
    changedRangeCount,
    ranges,
  };
}
