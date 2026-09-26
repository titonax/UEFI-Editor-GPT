import { describe, expect, it } from "vitest";
import { firmwareData, prompt } from "../../test/fixtures";
import { parseDataFile } from "./dataValidation";

describe("data.json validation", () => {
  it("accepts the editor data envelope", () => {
    const data = firmwareData();
    data.forms[0].ifrOffset = "0x20";
    expect(parseDataFile(JSON.stringify(data))).toMatchObject({
      version: "0.7.0",
      forms: [{ ifrOffset: "0x20" }],
    });
  });

  it("accepts an AMI Aptio image whose generation remains unresolved", () => {
    const data = firmwareData({ firmwareFamily: "ami-aptio" });
    expect(parseDataFile(JSON.stringify(data)).firmwareFamily).toBe("ami-aptio");
  });

  it("accepts a read-only vendor-neutral UEFI HII workspace", () => {
    const data = firmwareData({ firmwareFamily: "uefi-hii" });
    expect(parseDataFile(JSON.stringify(data)).firmwareFamily).toBe("uefi-hii");
  });

  it("rejects malformed and incomplete data", () => {
    expect(() => parseDataFile("{")).toThrow(/not valid JSON/);
    expect(() => parseDataFile(JSON.stringify({ version: "0.6.0" }))).toThrow(
      /firmwareFamily/,
    );
  });

  it("rejects malformed nested forms, prompts, menus and suppressions", () => {
    const invalidPrompt = firmwareData();
    invalidPrompt.forms[0].children = [prompt({ questionId: 4 as never })];
    expect(() => parseDataFile(JSON.stringify(invalidPrompt))).toThrow(/forms/);

    const invalidMenu = firmwareData({
      menu: [{ name: "Main", formId: "0x1", offset: 12 as never }],
    });
    expect(() => parseDataFile(JSON.stringify(invalidMenu))).toThrow(/menu/);

    const invalidSuppression = firmwareData({
      suppressions: [
        {
          offset: "0x1",
          active: true,
          start: "0x1",
          end: "0x2",
          source: "guess" as never,
        },
      ],
    });
    expect(() => parseDataFile(JSON.stringify(invalidSuppression))).toThrow(
      /suppressions/,
    );
  });

  it("drops imported binary analysis because it must match the opened source", () => {
    const imported = {
      ...firmwareData(),
      ifrBinary: { packageCount: 999, packages: [] },
      rootVisibility: {
        status: "detected",
        mechanism: "setup-pe32-root-byte-vector",
        confidence: "corroborated",
        reason: "untrusted",
        entries: [],
      },
      singleFormSetNavigation: {
        status: "detected",
        mechanism: "single-formset-ifr-hub",
        confidence: "corroborated",
        reason: "untrusted",
        pages: [],
      },
    };

    const parsed = parseDataFile(JSON.stringify(imported));
    expect(parsed.ifrBinary).toBeUndefined();
    expect(parsed.rootVisibility).toBeUndefined();
    expect(parsed.singleFormSetNavigation).toBeUndefined();
  });

  it("preserves valid IFR edit plans and rejects malformed ones", () => {
    const imported = firmwareData({
      ifrEdits: [
        {
          kind: "move-ref",
          sourceOffset: 10,
          sourceEnd: 12,
          destinationOffset: 20,
          expected: [0x0f, 2],
          destinationExpected: [0x29, 2],
          containerPatches: [
            {
              offset: 4,
              expected: [0x20, 0, 0],
              replacement: [0x1e, 0, 0],
              description: "Shrink Forms Package",
            },
          ],
          description: "Move Ref",
        },
      ],
    });
    expect(parseDataFile(JSON.stringify(imported)).ifrEdits).toEqual(imported.ifrEdits);

    const malformed = structuredClone(imported);
    if (!malformed.ifrEdits?.[0]) throw new Error("Expected an IFR edit fixture.");
    malformed.ifrEdits[0].expected = [0x0f];
    expect(() => parseDataFile(JSON.stringify(malformed))).toThrow(/ifrEdits/);

    const malformedPatch = structuredClone(imported);
    const patch = malformedPatch.ifrEdits?.[0]?.containerPatches?.[0];
    if (!patch) throw new Error("Expected a container patch fixture.");
    patch.replacement = [0x1e];
    expect(() => parseDataFile(JSON.stringify(malformedPatch))).toThrow(/ifrEdits/);
  });

  it("preserves structurally valid root visibility plans and rejects ambiguity", () => {
    const edit = {
      kind: "set-root-visibility" as const,
      rootIndex: 1,
      formId: "0x402",
      formSetGuid: "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA",
      bufferId: 4,
      bufferOffset: 0x120,
      expected: 0 as const,
      replacement: 1 as const,
      description: "Show root FormSet Advanced",
    };
    const imported = firmwareData({ rootVisibilityEdits: [edit] });
    expect(parseDataFile(JSON.stringify(imported)).rootVisibilityEdits).toEqual([edit]);

    const duplicate = firmwareData({ rootVisibilityEdits: [edit, { ...edit }] });
    expect(() => parseDataFile(JSON.stringify(duplicate))).toThrow(
      /rootVisibilityEdits/,
    );

    const noChange = firmwareData({
      rootVisibilityEdits: [{ ...edit, replacement: 0 }],
    });
    expect(() => parseDataFile(JSON.stringify(noChange))).toThrow(
      /rootVisibilityEdits/,
    );
  });
});
