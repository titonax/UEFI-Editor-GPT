import { FirmwareError } from "./errors";
import { analyzeIfrBinary } from "./ifrBinary";
import type { UefiHiiModule } from "./uefiHiiDiscovery";

/** Original module-body offsets, including the Forms Package header. */
export interface UefiHiiPackageRange {
  offset: number;
  end: number;
}

function validateRanges(ranges: UefiHiiPackageRange[], size: number) {
  const ordered = [...ranges].sort((left, right) => left.offset - right.offset);
  for (const [index, range] of ordered.entries()) {
    if (
      !Number.isSafeInteger(range.offset) ||
      !Number.isSafeInteger(range.end) ||
      range.offset < 0 ||
      range.end <= range.offset ||
      range.end > size ||
      (index > 0 && range.offset < ordered[index - 1].end)
    ) {
      throw new FirmwareError(
        "INTEGRITY_MISMATCH",
        "HII ownership ranges are invalid or overlap.",
      );
    }
  }
}

function validatePackages(source: Uint8Array, ranges: UefiHiiPackageRange[]) {
  validateRanges(ranges, source.length);
  const packages = analyzeIfrBinary(source).packages.filter((pkg) => pkg.valid);
  if (
    ranges.length === 0 ||
    ranges.some(
      (range) =>
        !packages.some((pkg) => pkg.offset === range.offset && pkg.end === range.end),
    )
  ) {
    throw new FirmwareError(
      "INTEGRITY_MISMATCH",
      "Owned HII packages no longer match the original valid package boundaries.",
    );
  }
  return packages;
}

/**
 * Analysis-only copy: keep byte offsets and direct strings, hide the entire
 * nested payload (including its strings), and omit non-owned Forms Packages.
 * The immutable original body is always used for patching and reconstruction.
 */
export function createUefiHiiOwnedPackageView(module: UefiHiiModule) {
  const ranges = module.packages.map(({ offset, end }) => ({ offset, end }));
  const packages = validatePackages(module.bytes, ranges);
  const nested = module.nestedPayloadRanges ?? [];
  validateRanges(nested, module.bytes.length);
  if (
    nested.some((payload) =>
      ranges.some((range) => range.offset < payload.end && range.end > payload.offset),
    )
  ) {
    throw new FirmwareError(
      "INTEGRITY_MISMATCH",
      "An owned HII package overlaps a nested payload.",
    );
  }
  const view = module.bytes.slice();
  for (const payload of nested) view.fill(0, payload.offset, payload.end);
  for (const pkg of packages) {
    if (!ranges.some((range) => range.offset === pkg.offset && range.end === pkg.end))
      view.fill(0, pkg.offset, pkg.end);
  }
  return { bytes: view, ownedPackages: ranges };
}

/** Reject changes to code, strings, section headers or nested driver bytes. */
export function assertUefiHiiOwnedPackageChanges(
  original: Uint8Array,
  modified: Uint8Array,
  ranges: UefiHiiPackageRange[] = analyzeIfrBinary(original)
    .packages.filter((pkg) => pkg.valid)
    .map(({ offset, end }) => ({ offset, end })),
) {
  validatePackages(original, ranges);
  if (modified.length !== original.length) {
    throw new FirmwareError("PATCH_FAILED", "The owned HII body changed length.");
  }
  for (let offset = 0; offset < original.length; offset++) {
    if (original[offset] === modified[offset]) continue;
    if (!ranges.some((range) => offset >= range.offset && offset < range.end)) {
      throw new FirmwareError(
        "PATCH_FAILED",
        `A changed byte at 0x${offset.toString(16).toUpperCase()} is outside the owned HII packages.`,
      );
    }
  }
}
