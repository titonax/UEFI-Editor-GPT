import { FirmwareError } from "./errors";
import type { Data } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasString(record: Record<string, unknown>, key: string): boolean {
  return typeof record[key] === "string";
}

export function parseDataFile(text: string): Data {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new FirmwareError("INVALID_INPUT", "data.json is not valid JSON.");
  }

  if (
    !isRecord(value) ||
    !hasString(value, "version") ||
    !Array.isArray(value.menu) ||
    !Array.isArray(value.forms) ||
    !Array.isArray(value.varStores) ||
    !Array.isArray(value.suppressions) ||
    !isRecord(value.hashes)
  ) {
    throw new FirmwareError(
      "INVALID_INPUT",
      "data.json does not contain a complete UEFI Editor data model.",
    );
  }

  const hashes = value.hashes;
  for (const key of [
    "setupTxt",
    "setupSct",
    "amitseSct",
    "setupdataBin",
    "offsetChecksum",
  ]) {
    if (!hasString(hashes, key)) {
      throw new FirmwareError("INVALID_INPUT", `data.json is missing hashes.${key}.`);
    }
  }

  return value as unknown as Data;
}
