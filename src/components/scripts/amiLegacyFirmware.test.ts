import { describe, expect, it } from "vitest";
import { inspectAmiLegacyFirmware } from "./amiLegacyFirmware";

const ascii = (value: string) => new TextEncoder().encode(value);

function amibios8Rom() {
  const bytes = new Uint8Array(0x20000).fill(0xff);
  bytes.set(ascii("AMIBIOSC0800"), 0x17fea);
  bytes.set(ascii("AMIBOOT ROM"), 0x1804c);
  bytes.set(ascii("11/24/08"), bytes.length - 10);
  bytes.set([0xea, 0xaa, 0xff, 0x00, 0xf0], bytes.length - 16);
  return bytes;
}

describe("AMIBIOS8 legacy inspection", () => {
  it("requires a versioned signature, boot block and reset vector", () => {
    expect(inspectAmiLegacyFirmware(amibios8Rom())).toEqual({
      format: "AMIBIOS 8",
      signature: "AMIBIOSC0800",
      version: "0800",
      signatureOffset: 0x17fea,
      bootBlockOffset: 0x1804c,
      resetVectorOffset: 0x1fff0,
      biosDate: "11/24/08",
    });
  });

  it("does not promote a loose AMIBIOS string", () => {
    expect(inspectAmiLegacyFirmware(ascii("AMIBIOS 8"))).toBeNull();
    const invalid = amibios8Rom();
    invalid[invalid.length - 16] = 0xe9;
    expect(inspectAmiLegacyFirmware(invalid)).toBeNull();
  });
});
