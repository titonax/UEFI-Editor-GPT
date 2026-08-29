import { describe, expect, it } from "vitest";
import {
  applyIfrBytePatches,
  applyIfrStructuralMove,
  planIfrReferenceMove,
  planIfrReferenceRetarget,
  remapIfrOffset,
  type IfrBytePatch,
} from "./ifrEditing";
import { IFR_OPCODE, parseIfrOpcodeStream } from "./ifrBinary";

function ref(formId = 0x1234) {
  return new Uint8Array([
    IFR_OPCODE.REF,
    15,
    1,
    0,
    2,
    0,
    3,
    0,
    4,
    0,
    5,
    0,
    0,
    formId & 0xff,
    (formId >>> 8) & 0xff,
  ]);
}

function form(formId: number) {
  return [IFR_OPCODE.FORM, 0x80 | 6, formId & 0xff, formId >>> 8, 0, 0];
}

const end = [IFR_OPCODE.END, 2];

function twoForms() {
  return new Uint8Array([...form(1), ...ref(3), ...end, ...form(2), 0x03, 2, ...end]);
}

describe("binary IFR editing primitives", () => {
  it("retargets a Ref in place without mutating the source", () => {
    const source = ref();
    const reference = parseIfrOpcodeStream(source, 0, source.length)[0];
    const patch = planIfrReferenceRetarget(source, reference, 0xabcd);
    const result = applyIfrBytePatches(source, [patch]);

    expect(patch).toMatchObject({
      offset: 13,
      expected: [0x34, 0x12],
      replacement: [0xcd, 0xab],
    });
    expect(Array.from(result)).toEqual(Array.from(ref(0xabcd)));
    expect(Array.from(source)).toEqual(Array.from(ref()));
  });

  it("rejects a stale decoded span", () => {
    const source = ref();
    const reference = parseIfrOpcodeStream(source, 0, source.length)[0];
    const changed = source.slice();
    changed[0] = IFR_OPCODE.FORM;

    expect(() => planIfrReferenceRetarget(changed, reference, 1)).toThrow(
      /no longer match/,
    );
  });

  it("validates all preconditions before applying any patch", () => {
    const source = ref();
    const good: IfrBytePatch = {
      offset: 13,
      expected: [0x34, 0x12],
      replacement: [0x78, 0x56],
      description: "valid",
    };
    const stale: IfrBytePatch = {
      offset: 2,
      expected: [0xff],
      replacement: [0],
      description: "stale",
    };

    expect(() => applyIfrBytePatches(source, [good, stale])).toThrow(
      /precondition failed/,
    );
    expect(Array.from(source)).toEqual(Array.from(ref()));
  });

  it("rejects length changes, overlaps and invalid FormIds", () => {
    const source = ref();
    const reference = parseIfrOpcodeStream(source, 0, source.length)[0];
    expect(() => planIfrReferenceRetarget(source, reference, 0x10000)).toThrow(
      /unsigned 16-bit/,
    );
    expect(() =>
      applyIfrBytePatches(source, [
        { offset: 0, expected: [0x0f], replacement: [], description: "resize" },
      ]),
    ).toThrow(/invalid bounds or changes/);
    expect(() =>
      applyIfrBytePatches(source, [
        { offset: 0, expected: [0x0f], replacement: [0x0f], description: "a" },
        { offset: 0, expected: [0x0f], replacement: [0x0f], description: "b" },
      ]),
    ).toThrow(/overlap/);
  });

  it("moves a direct Ref between Forms without changing the stream length", () => {
    const source = twoForms();
    const spans = parseIfrOpcodeStream(source, 0, source.length);
    const sourceForm = spans.find((span) => span.formId === 1);
    const destinationForm = spans.find((span) => span.formId === 2);
    const reference = spans.find((span) => span.opcode === IFR_OPCODE.REF);
    expect(sourceForm).toBeDefined();
    expect(destinationForm).toBeDefined();
    expect(reference).toBeDefined();
    if (!sourceForm || !destinationForm || !reference) {
      throw new Error("Expected both Forms and the Ref to be parsed.");
    }

    const move = planIfrReferenceMove(source, reference, sourceForm, destinationForm);
    const result = applyIfrStructuralMove(source, move);
    const movedReference = parseIfrOpcodeStream(
      result.bytes,
      0,
      result.bytes.length,
    ).find((span) => span.opcode === IFR_OPCODE.REF);
    if (!movedReference) throw new Error("Expected the moved Ref to be parsed.");

    expect(result.bytes).toHaveLength(source.length);
    expect(movedReference).toMatchObject({ ownerFormId: 2, formId: 3 });
    expect(remapIfrOffset(move, reference.offset)).toBe(movedReference.offset);
    expect(Array.from(source)).toEqual(Array.from(twoForms()));
  });

  it("moves a Ref backward to an earlier Form", () => {
    const source = new Uint8Array([
      ...form(1),
      0x03,
      2,
      ...end,
      ...form(2),
      ...ref(3),
      ...end,
    ]);
    const spans = parseIfrOpcodeStream(source, 0, source.length);
    const sourceForm = spans.find((span) => span.formId === 2);
    const destinationForm = spans.find((span) => span.formId === 1);
    const reference = spans.find((span) => span.opcode === IFR_OPCODE.REF);
    if (!sourceForm || !destinationForm || !reference) {
      throw new Error("Expected both Forms and the Ref to be parsed.");
    }

    const move = planIfrReferenceMove(source, reference, sourceForm, destinationForm);
    const result = applyIfrStructuralMove(source, move);
    const movedReference = parseIfrOpcodeStream(
      result.bytes,
      0,
      result.bytes.length,
    ).find((span) => span.opcode === IFR_OPCODE.REF);

    expect(movedReference).toMatchObject({ ownerFormId: 1, formId: 3 });
    expect(remapIfrOffset(move, destinationForm.matchingEndOffset ?? -1)).toBe(
      (destinationForm.matchingEndOffset ?? -1) + reference.length,
    );
  });

  it("rejects nested Refs and implicit cross-FormSet moves", () => {
    const source = twoForms();
    const spans = parseIfrOpcodeStream(source, 0, source.length);
    const sourceForm = spans.find((span) => span.formId === 1);
    const destinationForm = spans.find((span) => span.formId === 2);
    const reference = spans.find((span) => span.opcode === IFR_OPCODE.REF);
    if (!sourceForm || !destinationForm || !reference) {
      throw new Error("Expected both Forms and the Ref to be parsed.");
    }

    expect(() =>
      planIfrReferenceMove(
        source,
        { ...reference, parentOffset: 99 },
        sourceForm,
        destinationForm,
      ),
    ).toThrow(/direct child/);
    expect(() =>
      planIfrReferenceMove(source, reference, sourceForm, {
        ...destinationForm,
        ownerFormSetGuid: "OTHER",
      }),
    ).toThrow(/explicit FormSetGuid/);
  });
});
