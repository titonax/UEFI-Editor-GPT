import { describe, expect, it } from "vitest";
import {
  compareFirmwareImages,
  imageComparisonRangeLimit,
  imageComparisonSampleLimit,
} from "./firmwareImageComparison";

describe("complete physical image comparison (synthetic)", () => {
  it.each([0, 1, 128])("reports byte-identical %i-byte images", (size) => {
    expect(compareFirmwareImages(new Uint8Array(size), new Uint8Array(size))).toEqual({
      imageSize: size,
      changedByteCount: 0,
      unchangedByteCount: size,
      changedRangeCount: 0,
      ranges: [],
    });
  });
  it("counts exact contiguous runs, including both image boundaries", () => {
    const source = Uint8Array.of(0, 0, 0, 0, 0, 0, 0);
    const rebuilt = Uint8Array.of(1, 2, 0, 3, 0, 4, 5);
    expect(compareFirmwareImages(source, rebuilt)).toEqual({
      imageSize: 7,
      changedByteCount: 5,
      unchangedByteCount: 2,
      changedRangeCount: 3,
      ranges: [
        { start: 0, end: 2, original: [0, 0], rebuilt: [1, 2] },
        { start: 3, end: 4, original: [0], rebuilt: [3] },
        { start: 5, end: 7, original: [0, 0], rebuilt: [4, 5] },
      ],
    });
    expect(source).toEqual(new Uint8Array(7));
    expect(rebuilt).toEqual(Uint8Array.of(1, 2, 0, 3, 0, 4, 5));
  });
  it("retains exact totals and exclusive ends beyond display/sample limits", () => {
    const size = (imageComparisonRangeLimit + 10) * 2 + 50;
    const source = new Uint8Array(size);
    const rebuilt = Uint8Array.from(source, (_, index) =>
      index < 50 || index % 2 === 0 ? 1 : 0,
    );
    const result = compareFirmwareImages(source, rebuilt);
    expect(result.changedRangeCount).toBe(imageComparisonRangeLimit + 10);
    expect(result.ranges).toHaveLength(imageComparisonRangeLimit);
    expect(result.ranges[0].end).toBe(51);
    expect(result.ranges[0].original).toHaveLength(imageComparisonSampleLimit);
    expect(result.changedByteCount).toBe(rebuilt.filter((byte) => byte !== 0).length);
    expect(result.unchangedByteCount).toBe(size - result.changedByteCount);
  });
  it.each([
    [0, 1],
    [2, 1],
  ])("rejects unequal physical sizes %i / %i", (originalSize, rebuiltSize) => {
    expect(() =>
      compareFirmwareImages(new Uint8Array(originalSize), new Uint8Array(rebuiltSize)),
    ).toThrow(/equal original and rebuilt sizes/);
  });
  it("uses view-relative image offsets and copies retained samples", () => {
    const source = Uint8Array.of(9, 1, 2, 9);
    const rebuilt = Uint8Array.of(8, 1, 3, 8);
    const result = compareFirmwareImages(source.subarray(1, 3), rebuilt.subarray(1, 3));
    expect(result.ranges).toEqual([{ start: 1, end: 2, original: [2], rebuilt: [3] }]);
    result.ranges[0].original[0] = 0;
    expect(source[2]).toBe(2);
  });
  it.each([1, 31, 256, 1024])(
    "matches an independent reference for a %i-byte sparse/dense mask",
    (size) => {
      const source = Uint8Array.from({ length: size }, (_, i) => i % 256);
      const rebuilt = Uint8Array.from(source, (byte, i) =>
        i % 7 < 3 || i % 11 === 0 ? byte ^ 255 : byte,
      );
      const differing = Array.from(source, (byte, i) => byte !== rebuilt[i]);
      const starts = differing.flatMap((changed, i) =>
        changed && !differing[i - 1] ? [i] : [],
      );
      const result = compareFirmwareImages(source, rebuilt);
      expect(result.changedByteCount).toBe(differing.filter(Boolean).length);
      expect(result.changedRangeCount).toBe(starts.length);
      expect(result.ranges.map((range) => range.start)).toEqual(
        starts.slice(0, imageComparisonRangeLimit),
      );
      for (const range of result.ranges) {
        expect(differing.slice(range.start, range.end).every(Boolean)).toBe(true);
        expect(differing[range.end] ?? false).toBe(false);
        expect(range.original).toEqual(
          Array.from(
            source.slice(
              range.start,
              Math.min(range.end, range.start + imageComparisonSampleLimit),
            ),
          ),
        );
      }
    },
  );
});
