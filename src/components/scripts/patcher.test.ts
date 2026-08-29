import { describe, expect, it } from "vitest";
import { condition, firmwareData, form, prompt } from "../../test/fixtures";
import { bytesToHex } from "./hex";
import { IFR_OPCODE, parseIfrOpcodeStream } from "./ifrBinary";
import { planIfrReferenceMove } from "./ifrEditing";
import { buildFirmwarePatches } from "./patcher";

describe("firmware patch builder", () => {
  it("moves the matching End opcode when a SuppressIf is disabled", () => {
    const data = firmwareData({
      suppressions: [condition({ active: false })],
    });
    const result = buildFirmwarePatches(data, {
      setupSct: "AAAA2902BBBB",
      amitseSct: "",
      setupdataBin: "",
    });

    expect(result.setupSct && [...result.setupSct]).toEqual([
      0x29, 0x02, 0xaa, 0xaa, 0xbb, 0xbb,
    ]);
    expect(result.changeLog).toContain("Unsuppressed 0x0");
  });

  it("refuses to patch a SuppressIf whose End opcode does not match", () => {
    const data = firmwareData({ suppressions: [condition({ active: false })] });
    expect(() =>
      buildFirmwarePatches(data, {
        setupSct: "AAAAFFFFBBBB",
        amitseSct: "",
        setupdataBin: "",
      }),
    ).toThrow(/no matching End opcode/);
  });

  it("patches SetupData offsets and records each change", () => {
    const data = firmwareData({
      forms: [
        form({
          children: [
            prompt({
              accessLevel: "05",
              failsafe: "01",
              optimal: "02",
              offsets: { accessLevel: "0x0", failsafe: "0x1", optimal: "0x2" },
            }),
          ],
        }),
      ],
    });
    const result = buildFirmwarePatches(data, {
      setupSct: "",
      amitseSct: "",
      setupdataBin: "000000",
    });
    expect(result.setupdataBin && [...result.setupdataBin]).toEqual([5, 1, 2]);
    expect(result.changeLog).toContain("Access Level 00 -> 05");
  });

  it("replays structural IFR moves into the exported Setup HII", () => {
    const source = new Uint8Array([
      IFR_OPCODE.FORM,
      0x86,
      1,
      0,
      0,
      0,
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
      3,
      0,
      IFR_OPCODE.END,
      2,
      IFR_OPCODE.FORM,
      0x86,
      2,
      0,
      0,
      0,
      0x03,
      2,
      IFR_OPCODE.END,
      2,
    ]);
    const spans = parseIfrOpcodeStream(source, 0, source.length);
    const reference = spans.find((span) => span.opcode === IFR_OPCODE.REF);
    const sourceForm = spans.find((span) => span.formId === 1);
    const destinationForm = spans.find((span) => span.formId === 2);
    if (!reference || !sourceForm || !destinationForm) {
      throw new Error("Expected both Forms and the Ref to be parsed.");
    }
    const move = planIfrReferenceMove(source, reference, sourceForm, destinationForm);
    const result = buildFirmwarePatches(firmwareData({ ifrEdits: [move] }), {
      setupSct: bytesToHex(source),
      amitseSct: "",
      setupdataBin: "",
    });

    expect(result.setupSct).toHaveLength(source.length);
    if (!result.setupSct) throw new Error("Expected a patched Setup HII.");
    expect(
      parseIfrOpcodeStream(result.setupSct, 0, result.setupSct.length).find(
        (span) => span.opcode === IFR_OPCODE.REF,
      ),
    ).toMatchObject({ ownerFormId: 2, formId: 3 });
    expect(result.changeLog).toContain("Move Ref");
  });
});
