import { describe, expect, it } from "vitest";
import {
  applyIfrBytePatches,
  planIfrReferenceRetarget,
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
});
