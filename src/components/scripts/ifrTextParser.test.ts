import { describe, expect, it } from "vitest";
import { parseIfrText } from "./ifrTextParser";

describe("IFR text parser", () => {
  it("extracts form-set, var-store, form and scoped question metadata", () => {
    const input = [
      '0x000: FormSet Guid: AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE, Title: "Setup", Help: "" { 0E 82 }',
      '0x010:\tVarStore Guid: 00000000-0000-0000-0000-000000000000, VarStoreId: 0x1, Size: 4, Name: "Setup" { 24 02 }',
      '0x020:\tForm FormId: 0x1, Title: "Main" { 01 82 }',
      '0x030:\t\tCheckBox Prompt: "Feature", Help: "Toggle", QuestionFlags: 0, QuestionId: 0x2, VarStoreId: 0x1, VarOffset: 0x0, Flags: 0 { 06 82 01 00 01 00 00 00 }',
      "0x040:\t\t\tDefault DefaultId: 0x0 Value: 0x1 { 5B 02 }",
      "0x050:\t\t{ 29 02 }",
      "0x060:\t{ 29 02 }",
    ].join("\n");

    const parsed = parseIfrText(input, "");

    expect(parsed.formSetRoots).toEqual([
      expect.objectContaining({ name: "Setup", formId: "0x1", source: "formset" }),
    ]);
    expect(parsed.varStores).toEqual([
      expect.objectContaining({ varStoreId: "0x1", name: "Setup" }),
    ]);
    expect(parsed.forms).toHaveLength(1);
    expect(parsed.forms[0]).toEqual(
      expect.objectContaining({ name: "Main", formId: "0x1" }),
    );
    expect(parsed.forms[0].children).toEqual([
      expect.objectContaining({
        type: "CheckBox",
        name: "Feature",
        varStoreName: "Setup",
        defaults: [{ defaultId: "0x0", value: "0x1" }],
      }),
    ]);
  });

  it("rejects unclosed scopes", () => {
    expect(() =>
      parseIfrText('0x000: Form FormId: 0x1, Title: "Main" { 01 82 }', ""),
    ).toThrow(/unclosed/);
  });
});
