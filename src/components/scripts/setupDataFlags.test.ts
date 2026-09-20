import { describe, expect, it } from "vitest";
import { decodeSetupDataFlags, describeSetupDataFlags } from "./setupDataFlags";

describe("SetupData flags", () => {
  it("reports set bits without assigning visibility semantics", () => {
    expect(decodeSetupDataFlags("29")).toEqual([0, 3, 5]);
    expect(decodeSetupDataFlags("00")).toEqual([]);
    expect(describeSetupDataFlags("29")).toMatch(/do not prove.*hidden or visible/);
  });

  it("does not invent flags for missing or invalid records", () => {
    expect(decodeSetupDataFlags(null)).toBeNull();
    expect(decodeSetupDataFlags("2G")).toBeNull();
  });
});
