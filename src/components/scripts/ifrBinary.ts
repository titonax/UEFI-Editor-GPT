import {
  assertBinaryRange,
  formatHex,
  readGuid,
  readUint16,
  readUint24,
  readUint32,
} from "./binaryReader";
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
    span.formSetGuid = readGuid(bytes, span.offset + 2);
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
    span.formId = readUint16(bytes, span.offset + 2);
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

  span.questionId = readUint16(bytes, span.offset + 6);
  span.formId = readUint16(bytes, span.offset + 13);
  if (span.length >= 17) span.refQuestionId = readUint16(bytes, span.offset + 15);
  if (span.length >= 33) span.targetFormSetGuid = readGuid(bytes, span.offset + 17);
  if (span.length >= 35) span.devicePathStringId = readUint16(bytes, span.offset + 33);
}

export function parseIfrOpcodeStream(
  bytes: Uint8Array,
  start: number,
  end: number,
): IfrOpcodeSpan[] {
  assertBinaryRange(bytes, start, end - start, "IFR opcode stream");
  const spans: IfrOpcodeSpan[] = [];
  const stack: IfrOpcodeSpan[] = [];
  let cursor = start;

  while (cursor < end) {
    assertBinaryRange(bytes, cursor, 2, "IFR opcode header");
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
        name: OPCODE_NAMES[opcode] ?? `Opcode 0x${formatHex(opcode, 2)}`,
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
      name: OPCODE_NAMES[opcode] ?? `Opcode 0x${formatHex(opcode, 2)}`,
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
  assertBinaryRange(bytes, offset, HII_PACKAGE_HEADER_SIZE, "HII package header");
  return { length: readUint24(bytes, offset), type: bytes[offset + 3] };
}

function parsePackageListAtStart(
  bytes: Uint8Array,
  diagnostics: IfrBinaryDiagnostic[],
): IfrFormPackage[] | null {
  if (bytes.length < HII_PACKAGE_LIST_HEADER_SIZE) return null;
  const listLength = readUint32(bytes, 16);
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

function scanEmbeddedFormsPackages(bytes: Uint8Array): IfrFormPackage[] {
  const packages: IfrFormPackage[] = [];
  let cursor = 0;
  while (cursor + HII_PACKAGE_HEADER_SIZE <= bytes.length) {
    if (bytes[cursor + 3] !== HII_PACKAGE_FORMS) {
      cursor++;
      continue;
    }
    const length = readUint24(bytes, cursor);
    const payloadOffset = cursor + HII_PACKAGE_HEADER_SIZE;
    if (
      length < HII_PACKAGE_HEADER_SIZE + 2 ||
      cursor + length > bytes.length ||
      bytes[payloadOffset] !== IFR_OPCODE.FORM_SET
    ) {
      cursor++;
      continue;
    }

    const ignoredDiagnostics: IfrBinaryDiagnostic[] = [];
    const candidate = parseFormsPackage(
      bytes,
      cursor,
      length,
      null,
      ignoredDiagnostics,
    );
    if (
      candidate.valid &&
      candidate.opcodes.some((span) => span.opcode === IFR_OPCODE.FORM_SET) &&
      candidate.opcodes.some((span) => span.opcode === IFR_OPCODE.FORM)
    ) {
      packages.push(candidate);
      cursor += length;
    } else {
      cursor++;
    }
  }
  return packages;
}

interface EmbeddedPackageList {
  offset: number;
  length: number;
  packages: IfrFormPackage[];
}

function parseValidPackageListAt(
  bytes: Uint8Array,
  listOffset: number,
): EmbeddedPackageList | null {
  if (listOffset < 0 || listOffset + HII_PACKAGE_LIST_HEADER_SIZE > bytes.length) {
    return null;
  }
  const listLength = readUint32(bytes, listOffset + 16);
  if (
    listLength < HII_PACKAGE_LIST_HEADER_SIZE + HII_PACKAGE_HEADER_SIZE ||
    listOffset + listLength > bytes.length
  ) {
    return null;
  }

  const packages: IfrFormPackage[] = [];
  let cursor = listOffset + HII_PACKAGE_LIST_HEADER_SIZE;
  const listEnd = listOffset + listLength;
  while (cursor < listEnd) {
    let header: ReturnType<typeof packageHeader>;
    try {
      header = packageHeader(bytes, cursor);
    } catch {
      return null;
    }
    if (header.length < HII_PACKAGE_HEADER_SIZE || cursor + header.length > listEnd) {
      return null;
    }
    if (header.type === HII_PACKAGE_FORMS) {
      const ignoredDiagnostics: IfrBinaryDiagnostic[] = [];
      const formsPackage = parseFormsPackage(
        bytes,
        cursor,
        header.length,
        listOffset,
        ignoredDiagnostics,
      );
      if (!formsPackage.valid) return null;
      packages.push(formsPackage);
    }
    cursor += header.length;
    if (header.type === HII_PACKAGE_END) {
      return header.length === HII_PACKAGE_HEADER_SIZE &&
        cursor === listEnd &&
        packages.length > 0
        ? { offset: listOffset, length: listLength, packages }
        : null;
    }
  }
  return null;
}

function scanEmbeddedPackageLists(bytes: Uint8Array): EmbeddedPackageList[] {
  const lists: EmbeddedPackageList[] = [];
  let cursor = 0;
  while (cursor + HII_PACKAGE_LIST_HEADER_SIZE <= bytes.length) {
    const candidate = parseValidPackageListAt(bytes, cursor);
    if (candidate) {
      lists.push(candidate);
      cursor += candidate.length;
    } else {
      cursor++;
    }
  }
  return lists;
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
  const knownOffsets = new Set(packages.map((pkg) => pkg.offset));
  for (const list of scanEmbeddedPackageLists(bytes)) {
    for (const pkg of list.packages) {
      if (!knownOffsets.has(pkg.offset)) {
        packages.push(pkg);
        knownOffsets.add(pkg.offset);
      }
    }
  }
  for (const embedded of scanEmbeddedFormsPackages(bytes)) {
    if (!knownOffsets.has(embedded.offset)) {
      packages.push(embedded);
      knownOffsets.add(embedded.offset);
    }
  }
  packages.sort((left, right) => left.offset - right.offset);
  if (packages.length === 0) {
    diagnostics.push({
      code: "NO_FORMS_PACKAGE",
      message: "No HII Forms Package was found in the source buffer.",
      offset: 0,
    });
  }

  return { sourceSize: bytes.length, packages, diagnostics };
}
