import { describe, expect, it } from "vitest";
import { analyzeIfrBinary, IFR_OPCODE, parseIfrOpcodeStream } from "./ifrBinary";

function le16(value: number) {
  return [value & 0xff, (value >>> 8) & 0xff];
}

function le24(value: number) {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff];
}

function le32(value: number) {
  return [
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ];
}

const formSetGuidBytes = [
  0x78, 0x56, 0x34, 0x12, 0xbc, 0x9a, 0xf0, 0xde, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66,
  0x77, 0x88,
];

const targetGuidBytes = [
  0xef, 0xcd, 0xab, 0x90, 0x34, 0x12, 0x78, 0x56, 0x90, 0xab, 0xcd, 0xef, 0x01, 0x23,
  0x45, 0x67,
];

function formSet() {
  return [
    IFR_OPCODE.FORM_SET,
    0x80 | 23,
    ...formSetGuidBytes,
    ...le16(1),
    ...le16(2),
    0,
  ];
}

function form(formId = 0x1234) {
  return [IFR_OPCODE.FORM, 0x80 | 6, ...le16(formId), ...le16(3)];
}

function ref(formId = 0x5678) {
  return [
    IFR_OPCODE.REF,
    15,
    ...le16(4),
    ...le16(5),
    ...le16(0x1111),
    ...le16(1),
    ...le16(2),
    0,
    ...le16(formId),
  ];
}

function ref3(formId = 0x5678) {
  return [
    IFR_OPCODE.REF,
    33,
    ...le16(4),
    ...le16(5),
    ...le16(0x2222),
    ...le16(1),
    ...le16(2),
    0,
    ...le16(formId),
    ...le16(0x3333),
    ...targetGuidBytes,
  ];
}

const end = [IFR_OPCODE.END, 2];

function opcodeStream(reference = ref()) {
  return new Uint8Array([...formSet(), ...form(), ...reference, ...end, ...end]);
}

function formsPackage(reference = ref()) {
  const payload = opcodeStream(reference);
  const length = payload.length + 4;
  return new Uint8Array([...le24(length), 0x02, ...payload]);
}

function packageList(reference = ref()) {
  const forms = formsPackage(reference);
  const endPackage = [4, 0, 0, 0xdf];
  const length = 20 + forms.length + endPackage.length;
  return new Uint8Array([
    ...new Array<number>(16).fill(0),
    ...le32(length),
    ...forms,
    ...endPackage,
  ]);
}

describe("binary IFR model", () => {
  it("maps scopes and decodes FormSet, Form and Ref identities", () => {
    const bytes = packageList();
    const model = analyzeIfrBinary(bytes);

    expect(model.diagnostics).toEqual([]);
    expect(model.packages).toHaveLength(1);
    const opcodes = model.packages[0].opcodes;
    expect(opcodes).toHaveLength(5);

    const formSetOpcode = opcodes[0];
    const formOpcode = opcodes[1];
    const refOpcode = opcodes[2];
    expect(formSetOpcode).toMatchObject({
      name: "FormSet",
      depth: 0,
      formSetGuid: "12345678-9ABC-DEF0-1122-334455667788",
    });
    expect(formSetOpcode.matchingEndOffset).toBe(opcodes[4].offset);
    expect(formOpcode).toMatchObject({
      name: "Form",
      depth: 1,
      formId: 0x1234,
      ownerFormSetGuid: "12345678-9ABC-DEF0-1122-334455667788",
      parentOffset: formSetOpcode.offset,
    });
    expect(formOpcode.matchingEndOffset).toBe(opcodes[3].offset);
    expect(refOpcode).toMatchObject({
      name: "Ref",
      depth: 2,
      questionId: 0x1111,
      formId: 0x5678,
      ownerFormId: 0x1234,
      ownerFormSetGuid: "12345678-9ABC-DEF0-1122-334455667788",
      parentOffset: formOpcode.offset,
    });
  });

  it("decodes a cross-FormSet Ref3 without confusing its owner", () => {
    const model = analyzeIfrBinary(packageList(ref3()));
    const reference = model.packages[0].opcodes.find(
      (opcode) => opcode.opcode === IFR_OPCODE.REF,
    );

    expect(reference).toMatchObject({
      questionId: 0x2222,
      formId: 0x5678,
      refQuestionId: 0x3333,
      targetFormSetGuid: "90ABCDEF-1234-5678-90AB-CDEF01234567",
      ownerFormSetGuid: "12345678-9ABC-DEF0-1122-334455667788",
    });
  });

  it("accepts a standalone Forms Package", () => {
    const model = analyzeIfrBinary(formsPackage());

    expect(model.packages[0]).toMatchObject({
      packageListOffset: null,
      offset: 0,
      payloadOffset: 4,
      valid: true,
    });
    expect(model.diagnostics).toEqual([]);
  });

  it("rejects truncated and unbalanced opcode streams", () => {
    expect(() => parseIfrOpcodeStream(new Uint8Array([0x01, 0x06]), 0, 2)).toThrow(
      /Invalid IFR opcode length/,
    );
    expect(() =>
      parseIfrOpcodeStream(new Uint8Array([...form(), ...end, ...end]), 0, 10),
    ).toThrow(/Unmatched End opcode/);
    expect(() =>
      parseIfrOpcodeStream(new Uint8Array(form()), 0, form().length),
    ).toThrow(/no matching End opcode/);
  });

  it("reports malformed packages without exposing partial opcode trees", () => {
    const bytes = formsPackage();
    bytes[5] = 1;
    const model = analyzeIfrBinary(bytes);

    expect(model.packages[0]).toMatchObject({ valid: false, opcodes: [] });
    expect(model.diagnostics[0]).toMatchObject({
      code: "INVALID_FORMS_PACKAGE",
      offset: 0,
    });
  });

  it("reports sources that do not contain a Forms Package", () => {
    const model = analyzeIfrBinary(new Uint8Array([1, 2, 3]));

    expect(model.packages).toEqual([]);
    expect(model.diagnostics).toEqual([
      expect.objectContaining({ code: "NO_FORMS_PACKAGE" }),
    ]);
  });
});
