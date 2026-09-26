import { calculateJsonChecksum } from "./checksum";
import { FirmwareError } from "./errors";
import { analyzeIfrBinary, IFR_OPCODE } from "./ifrBinary";
import { replayIfrEdits } from "./menuEditing";
import type { Data, Suppression } from "./types";

function parsedOffset(value: string, label: string) {
  const parsed = Number.parseInt(value, 16);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new FirmwareError("PATCH_FAILED", `${label} has an invalid IFR offset.`);
  }
  return parsed;
}

/**
 * Ends disabled SuppressIf scopes immediately after their expression by moving
 * the existing closing End opcode. Length and all bytes outside the scope stay
 * unchanged; nested condition offsets are remapped on the local clone.
 */
export function applyUefiHiiSuppressionEdits(data: Data, source: Uint8Array) {
  const result = source.slice();
  const conditions: Suppression[] = structuredClone(data.suppressions);
  for (const condition of conditions) {
    if ((condition.kind ?? "SuppressIf") !== "SuppressIf" || condition.active) {
      continue;
    }
    const start = parsedOffset(condition.start, "SuppressIf body");
    const end = parsedOffset(condition.end, "SuppressIf End");
    if (
      end < start ||
      end + 2 > result.length ||
      result[end] !== IFR_OPCODE.END ||
      (result[end + 1] & 0x7f) !== 2
    ) {
      throw new FirmwareError(
        "PATCH_FAILED",
        `SuppressIf at ${condition.offset} has no proven closing End opcode.`,
      );
    }
    const body = result.slice(start, end);
    result[start] = IFR_OPCODE.END;
    result[start + 1] = 2;
    result.set(body, start + 2);

    for (const nested of conditions) {
      if (nested.offset === condition.offset) continue;
      for (const field of ["offset", "start", "end"] as const) {
        const nestedOffset = parsedOffset(nested[field], "Nested condition");
        if (nestedOffset >= start && nestedOffset < end) {
          nested[field] = `0x${(nestedOffset + 2).toString(16).toUpperCase()}`;
        }
      }
    }
  }
  const model = analyzeIfrBinary(result);
  if (!model.packages.some((pkg) => pkg.valid) || model.diagnostics.length > 0) {
    throw new FirmwareError(
      "PATCH_FAILED",
      "The unsuppressed HII stream did not pass structural revalidation.",
    );
  }
  return result;
}

export function analyzeUefiHiiSuppressionToggle(
  data: Data,
  originalSource: string,
  offsets: string[],
  active: boolean,
) {
  try {
    const next = structuredClone(data);
    for (const offset of offsets) {
      const condition = next.suppressions.find(
        (candidate) =>
          candidate.offset === offset &&
          (candidate.kind ?? "SuppressIf") === "SuppressIf",
      );
      if (!condition) {
        throw new FirmwareError(
          "PATCH_FAILED",
          `SuppressIf ${offset} could not be resolved.`,
        );
      }
      condition.active = active;
    }
    applyUefiHiiSuppressionEdits(next, replayIfrEdits(next, originalSource));
    return {
      available: true,
      reason: active
        ? "Restore the original SuppressIf scope."
        : "Move the proven closing End before the guarded content without changing length.",
    };
  } catch (reason) {
    return {
      available: false,
      reason: reason instanceof Error ? reason.message : String(reason),
    };
  }
}

export async function toggleUefiHiiSuppressions(
  data: Data,
  offsets: string[],
  active: boolean,
) {
  const next = structuredClone(data);
  for (const offset of offsets) {
    const condition = next.suppressions.find(
      (candidate) =>
        candidate.offset === offset &&
        (candidate.kind ?? "SuppressIf") === "SuppressIf",
    );
    if (!condition) {
      throw new FirmwareError(
        "PATCH_FAILED",
        `SuppressIf ${offset} could not be resolved.`,
      );
    }
    condition.active = active;
  }
  next.hashes.offsetChecksum = await calculateJsonChecksum(
    next.menu,
    next.forms,
    next.suppressions,
  );
  return next;
}
