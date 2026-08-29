import { describe, expect, it } from "vitest";
import { determineCondition } from "./ifrConditions";

describe("IFR condition parsing", () => {
  it("parses a single-opcode constant condition", () => {
    const result = determineCondition(
      [
        "0x10: SuppressIf { 0A 82 }",
        "0x12: True { 46 02 }",
        "0x14: Ref Prompt: x { 0F 00 }",
      ],
      0,
    );
    expect(result).toMatchObject({ start: "0x14", expression: "True", constant: true });
  });

  it("fails explicitly on truncated IFR instead of dereferencing undefined", () => {
    expect(() => determineCondition(["0x10: SuppressIf { 0A 82 }"], 0)).toThrow(
      /truncated/,
    );
  });
});
