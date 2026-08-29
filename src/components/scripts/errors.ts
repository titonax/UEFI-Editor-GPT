export type FirmwareErrorCode =
  | "INVALID_INPUT"
  | "INCOMPATIBLE_IFR"
  | "INTEGRITY_MISMATCH"
  | "PARSE_FAILED"
  | "PATCH_FAILED"
  | "NO_CHANGES";

export class FirmwareError extends Error {
  readonly code: FirmwareErrorCode;

  constructor(code: FirmwareErrorCode, message: string) {
    super(message);
    this.name = "FirmwareError";
    this.code = code;
  }
}

export function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
