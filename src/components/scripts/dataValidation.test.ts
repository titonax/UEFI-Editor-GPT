import { describe, expect, it } from "vitest";
import { firmwareData } from "../../test/fixtures";
import { parseDataFile } from "./dataValidation";

describe("data.json validation", () => {
  it("accepts the editor data envelope", () => {
    expect(parseDataFile(JSON.stringify(firmwareData())).version).toBe("0.4.0");
  });

  it("rejects malformed and incomplete data", () => {
    expect(() => parseDataFile("{")).toThrow(/not valid JSON/);
    expect(() => parseDataFile(JSON.stringify({ version: "0.4.0" }))).toThrow(
      /complete UEFI Editor data model/,
    );
  });
});
