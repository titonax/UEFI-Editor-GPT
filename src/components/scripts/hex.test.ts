import { describe, expect, it } from "vitest";
import {
  decimalToHex,
  hexToBytes,
  offsetToHexIndex,
  replaceHex,
  validateByteInput,
} from "./hex";

describe("hex utilities", () => {
  it("validates one-byte editor input", () => {
    expect(validateByteInput("")).toBe(true);
    expect(validateByteInput("A5")).toBe(true);
    expect(validateByteInput("A5F")).toBe(false);
    expect(validateByteInput("GG")).toBe(false);
  });

  it("converts offsets and byte strings without silent truncation", () => {
    expect(offsetToHexIndex("0x10")).toBe(32);
    expect(decimalToHex(255)).toBe("0xFF");
    expect([...hexToBytes("00A5FF")]).toEqual([0, 165, 255]);
    expect(() => hexToBytes("ABC")).toThrow(/odd number/);
    expect(() => hexToBytes("ZZ")).toThrow(/Invalid hexadecimal byte/);
  });

  it("rejects out-of-range patches", () => {
    expect(replaceHex("001122", 2, 2, "FF")).toBe("00FF22");
    expect(() => replaceHex("00", 4, 2, "FF")).toThrow(/outside/);
  });
});
