import { FirmwareError } from "./errors";

export const IFR_OPCODE = {
  FORM: 0x01,
  FORM_SET: 0x0e,
  REF: 0x0f,
  END: 0x29,
} as const;

const HII_PACKAGE_FORMS = 0x02;
const HII_PACKAGE_END = 0xdf;
const HII_PACKAGE_HEADER_SIZE = 4;
const HII_PACKAGE_LIST_HEADER_SIZE = 20;

const OPCODE_NAMES: Readonly<Record<number, string>> = {
  0x01: "Form",
  0x02: "Subtitle",
  0x03: "Text",
  0x05: "OneOf",
  0x06: "CheckBox",
  0x07: "Numeric",
  0x08: "Password",
  0x09: "OneOfOption",
  0x0a: "SuppressIf",
  0x0e: "FormSet",
  0x0f: "Ref",
  0x10: "NoSubmitIf",
  0x11: "InconsistentIf",
  0x12: "EqIdVal",
  0x13: "EqIdId",
  0x14: "EqIdList",
  0x15: "And",
  0x16: "Or",
  0x17: "Not",
  0x18: "Rule",
  0x19: "GrayOutIf",
  0x1a: "Date",
  0x1b: "Time",
  0x1c: "String",
  0x1d: "Refresh",
  0x1e: "DisableIf",
  0x23: "OrderedList",
  0x24: "VarStore",
  0x25: "VarStoreNameValue",
  0x26: "VarStoreEfi",
  0x29: "End",
  0x5b: "Default",
};

export interface IfrBinaryDiagnostic {
  code: "NO_FORMS_PACKAGE" | "INVALID_PACKAGE_LIST" | "INVALID_FORMS_PACKAGE";
  message: string;
  offset: number;
}

export interface IfrOpcodeSpan {
  opcode: number;
  name: string;
  offset: number;
  end: number;
  length: number;
  scope: boolean;
  depth: number;
  parentOffset: number | null;
  matchingEndOffset: number | null;
  closesOffset?: number;
  ownerFormSetGuid?: string;
  ownerFormId?: number;
  formSetGuid?: string;
  formId?: number;
  questionId?: number;
  refQuestionId?: number;
  targetFormSetGuid?: string;
  devicePathStringId?: number;
}

export interface IfrFormPackage {
  packageListOffset: number | null;
  offset: number;
  end: number;
  length: number;
  payloadOffset: number;
  valid: boolean;
  opcodes: IfrOpcodeSpan[];
}

export interface IfrBinaryModel {
  sourceSize: number;
  packages: IfrFormPackage[];
  diagnostics: IfrBinaryDiagnostic[];
}

function ensureRange(bytes: Uint8Array, offset: number, size: number, label: string) {
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(size) ||
    offset < 0 ||
    size < 0 ||
    offset + size > bytes.length
  ) {
    throw new FirmwareError(
      "PARSE_FAILED",
      `${label} at 0x${offset.toString(16).toUpperCase()} exceeds its source buffer.`,
    );
  }
}

function u16(bytes: Uint8Array, offset: number) {
  ensureRange(bytes, offset, 2, "16-bit field");
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function u24(bytes: Uint8Array, offset: number) {
  ensureRange(bytes, offset, 3, "24-bit field");
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function u32(bytes: Uint8Array, offset: number) {
  ensureRange(bytes, offset, 4, "32-bit field");
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
    offset,
    true,
  );
}

function hex(value: number, width: number) {
  return value.toString(16).toUpperCase().padStart(width, "0");
}

function decodeGuid(bytes: Uint8Array, offset: number) {
  ensureRange(bytes, offset, 16, "GUID");
  return `${hex(u32(bytes, offset), 8)}-${hex(u16(bytes, offset + 4), 4)}-${hex(
    u16(bytes, offset + 6),
    4,
  )}-${hex(bytes[offset + 8], 2)}${hex(bytes[offset + 9], 2)}-${Array.from(
    bytes.slice(offset + 10, offset + 16),
    (byte) => hex(byte, 2),
  ).join("")}`;
}

function enclosing(stack: IfrOpcodeSpan[], opcode: number): IfrOpcodeSpan | undefined {
  for (let index = stack.length - 1; index >= 0; index--) {
    const candidate = stack[index];
    if (candidate.opcode === opcode) return candidate;
  }
  return undefined;
}

function decodeKnownFields(
  bytes: Uint8Array,
  span: IfrOpcodeSpan,
  stack: IfrOpcodeSpan[],
) {
  span.ownerFormSetGuid = enclosing(stack, IFR_OPCODE.FORM_SET)?.formSetGuid;
  span.ownerFormId = enclosing(stack, IFR_OPCODE.FORM)?.formId;

  if (span.opcode === IFR_OPCODE.FORM_SET) {
    if (span.length < 23) {
      throw new FirmwareError(
        "PARSE_FAILED",
        `FormSet at 0x${span.offset.toString(16).toUpperCase()} is shorter than 23 bytes.`,
      );
    }
    span.formSetGuid = decodeGuid(bytes, span.offset + 2);
    span.ownerFormSetGuid = span.formSetGuid;
    return;
  }

  if (span.opcode === IFR_OPCODE.FORM) {
    if (span.length < 6) {
      throw new FirmwareError(
        "PARSE_FAILED",
        `Form at 0x${span.offset.toString(16).toUpperCase()} is shorter than 6 bytes.`,
      );
    }
    span.formId = u16(bytes, span.offset + 2);
    span.ownerFormId = span.formId;
    return;
  }

  if (span.opcode !== IFR_OPCODE.REF) return;
  if (span.length < 15) {
    throw new FirmwareError(
      "PARSE_FAILED",
      `Ref at 0x${span.offset.toString(16).toUpperCase()} is shorter than 15 bytes.`,
    );
  }

  span.questionId = u16(bytes, span.offset + 6);
  span.formId = u16(bytes, span.offset + 13);
  if (span.length >= 17) span.refQuestionId = u16(bytes, span.offset + 15);
  if (span.length >= 33) span.targetFormSetGuid = decodeGuid(bytes, span.offset + 17);
  if (span.length >= 35) span.devicePathStringId = u16(bytes, span.offset + 33);
}

export function parseIfrOpcodeStream(
  bytes: Uint8Array,
  start: number,
  end: number,
): IfrOpcodeSpan[] {
  ensureRange(bytes, start, end - start, "IFR opcode stream");
  const spans: IfrOpcodeSpan[] = [];
  const stack: IfrOpcodeSpan[] = [];
  let cursor = start;

  while (cursor < end) {
    ensureRange(bytes, cursor, 2, "IFR opcode header");
    const opcode = bytes[cursor];
    const length = bytes[cursor + 1] & 0x7f;
    const scope = (bytes[cursor + 1] & 0x80) !== 0;
    if (length < 2 || cursor + length > end) {
      throw new FirmwareError(
        "PARSE_FAILED",
        `Invalid IFR opcode length ${String(length)} at 0x${cursor
          .toString(16)
          .toUpperCase()}.`,
      );
    }

    if (opcode === IFR_OPCODE.END) {
      if (scope || length !== 2) {
        throw new FirmwareError(
          "PARSE_FAILED",
          `Malformed End opcode at 0x${cursor.toString(16).toUpperCase()}.`,
        );
      }
      const opener = stack.pop();
      if (!opener) {
        throw new FirmwareError(
          "PARSE_FAILED",
          `Unmatched End opcode at 0x${cursor.toString(16).toUpperCase()}.`,
        );
      }
      opener.matchingEndOffset = cursor;
      const span: IfrOpcodeSpan = {
        opcode,
        name: OPCODE_NAMES[opcode] ?? `Opcode 0x${hex(opcode, 2)}`,
        offset: cursor,
        end: cursor + length,
        length,
        scope,
        depth: stack.length,
        parentOffset: opener.offset,
        matchingEndOffset: null,
        closesOffset: opener.offset,
        ownerFormSetGuid: enclosing(stack, IFR_OPCODE.FORM_SET)?.formSetGuid,
        ownerFormId: enclosing(stack, IFR_OPCODE.FORM)?.formId,
      };
      spans.push(span);
      cursor += length;
      continue;
    }

    const span: IfrOpcodeSpan = {
      opcode,
      name: OPCODE_NAMES[opcode] ?? `Opcode 0x${hex(opcode, 2)}`,
      offset: cursor,
      end: cursor + length,
      length,
      scope,
      depth: stack.length,
      parentOffset: stack[stack.length - 1]?.offset ?? null,
      matchingEndOffset: null,
    };
    decodeKnownFields(bytes, span, stack);
    spans.push(span);
    if (scope) stack.push(span);
    cursor += length;
  }

  if (stack.length > 0) {
    const opener = stack[stack.length - 1];
    throw new FirmwareError(
      "PARSE_FAILED",
      `IFR scope opened at 0x${(opener?.offset ?? start)
        .toString(16)
        .toUpperCase()} has no matching End opcode.`,
    );
  }
  return spans;
}

function parseFormsPackage(
  bytes: Uint8Array,
  packageOffset: number,
  packageLength: number,
  packageListOffset: number | null,
  diagnostics: IfrBinaryDiagnostic[],
): IfrFormPackage {
  const payloadOffset = packageOffset + HII_PACKAGE_HEADER_SIZE;
  const end = packageOffset + packageLength;
  try {
    return {
      packageListOffset,
      offset: packageOffset,
      end,
      length: packageLength,
      payloadOffset,
      valid: true,
      opcodes: parseIfrOpcodeStream(bytes, payloadOffset, end),
    };
  } catch (reason) {
    diagnostics.push({
      code: "INVALID_FORMS_PACKAGE",
      message: reason instanceof Error ? reason.message : String(reason),
      offset: packageOffset,
    });
    return {
      packageListOffset,
      offset: packageOffset,
      end,
      length: packageLength,
      payloadOffset,
      valid: false,
      opcodes: [],
    };
  }
}

function packageHeader(bytes: Uint8Array, offset: number) {
  ensureRange(bytes, offset, HII_PACKAGE_HEADER_SIZE, "HII package header");
  return { length: u24(bytes, offset), type: bytes[offset + 3] };
}

function parsePackageListAtStart(
  bytes: Uint8Array,
  diagnostics: IfrBinaryDiagnostic[],
): IfrFormPackage[] | null {
  if (bytes.length < HII_PACKAGE_LIST_HEADER_SIZE) return null;
  const listLength = u32(bytes, 16);
  if (listLength < HII_PACKAGE_LIST_HEADER_SIZE || listLength > bytes.length) {
    return null;
  }

  const packages: IfrFormPackage[] = [];
  let cursor = HII_PACKAGE_LIST_HEADER_SIZE;
  let foundEnd = false;
  try {
    while (cursor < listLength) {
      const header = packageHeader(bytes, cursor);
      if (
        header.length < HII_PACKAGE_HEADER_SIZE ||
        cursor + header.length > listLength
      ) {
        throw new FirmwareError(
          "PARSE_FAILED",
          `Invalid HII package length ${String(header.length)} at 0x${cursor
            .toString(16)
            .toUpperCase()}.`,
        );
      }
      if (header.type === HII_PACKAGE_FORMS) {
        packages.push(parseFormsPackage(bytes, cursor, header.length, 0, diagnostics));
      }
      cursor += header.length;
      if (header.type === HII_PACKAGE_END) {
        foundEnd = true;
        break;
      }
    }
    if (!foundEnd || cursor !== listLength) {
      throw new FirmwareError(
        "PARSE_FAILED",
        "The HII package list does not end at its declared boundary.",
      );
    }
  } catch (reason) {
    diagnostics.push({
      code: "INVALID_PACKAGE_LIST",
      message: reason instanceof Error ? reason.message : String(reason),
      offset: 0,
    });
  }
  return packages;
}

export function analyzeIfrBinary(bytes: Uint8Array): IfrBinaryModel {
  const diagnostics: IfrBinaryDiagnostic[] = [];
  let packages = parsePackageListAtStart(bytes, diagnostics);

  if (packages === null && bytes.length >= HII_PACKAGE_HEADER_SIZE) {
    const header = packageHeader(bytes, 0);
    if (
      header.type === HII_PACKAGE_FORMS &&
      header.length >= HII_PACKAGE_HEADER_SIZE &&
      header.length <= bytes.length
    ) {
      packages = [parseFormsPackage(bytes, 0, header.length, null, diagnostics)];
    }
  }

  packages ??= [];
  if (packages.length === 0) {
    diagnostics.push({
      code: "NO_FORMS_PACKAGE",
      message: "No HII Forms Package was found at the start of the source buffer.",
      offset: 0,
    });
  }

  return { sourceSize: bytes.length, packages, diagnostics };
}
