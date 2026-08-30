import { describe, expect, it } from "vitest";
import { firmwareData, prompt } from "../../test/fixtures";
import { parseDataFile } from "./dataValidation";

describe("data.json validation", () => {
  it("accepts the editor data envelope", () => {
    const data = firmwareData();
    data.forms[0].ifrOffset = "0x20";
    expect(parseDataFile(JSON.stringify(data))).toMatchObject({
      version: "0.4.0",
      forms: [{ ifrOffset: "0x20" }],
    });
  });

  it("rejects malformed and incomplete data", () => {
    expect(() => parseDataFile("{")).toThrow(/not valid JSON/);
    expect(() => parseDataFile(JSON.stringify({ version: "0.4.0" }))).toThrow(
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

  it("drops imported binary analysis because it must match the opened SCT", () => {
    const imported = {
      ...firmwareData(),
      ifrBinary: { packageCount: 999, packages: [] },
    };

    expect(parseDataFile(JSON.stringify(imported)).ifrBinary).toBeUndefined();
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
          description: "Move Ref",
        },
      ],
    });
    expect(parseDataFile(JSON.stringify(imported)).ifrEdits).toEqual(imported.ifrEdits);

    const malformed = structuredClone(imported);
    if (!malformed.ifrEdits?.[0]) throw new Error("Expected an IFR edit fixture.");
    malformed.ifrEdits[0].expected = [0x0f];
    expect(() => parseDataFile(JSON.stringify(malformed))).toThrow(/ifrEdits/);
  });
});
