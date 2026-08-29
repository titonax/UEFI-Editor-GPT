import { describe, expect, it } from "vitest";
import { condition, firmwareData, form, prompt } from "../../test/fixtures";
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
});
