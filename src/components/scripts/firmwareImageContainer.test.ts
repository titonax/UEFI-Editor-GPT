import { describe, expect, it } from "vitest";
import {
  inspectFirmwareImageLayout,
  replaceFirmwareBiosRegion,
} from "./firmwareImageContainer";

function intelSpiFixture() {
  const bytes = new Uint8Array(0x5000);
  const view = new DataView(bytes.buffer);
  view.setUint32(0x10, 0x0ff0a55a, true);
  view.setUint32(0x14, 4 << 16, true);
  const region = (basePage: number, limitPage: number) => basePage | (limitPage << 16);
  view.setUint32(0x40, region(0, 0), true);
  view.setUint32(0x44, region(2, 4), true);
  view.setUint32(0x48, region(1, 1), true);
  for (let offset = 0; offset < bytes.length; offset += 1) bytes[offset] ^= offset;
  view.setUint32(0x10, 0x0ff0a55a, true);
  view.setUint32(0x14, 4 << 16, true);
  view.setUint32(0x40, region(0, 0), true);
  view.setUint32(0x44, region(2, 4), true);
  view.setUint32(0x48, region(1, 1), true);
  return bytes;
}

describe("firmware image container", () => {
  it("treats an image without a root descriptor as a pure BIOS", () => {
    expect(inspectFirmwareImageLayout(new Uint8Array(0x2000))).toMatchObject({
      kind: "bios-image",
      biosStart: 0,
      biosEnd: 0x2000,
    });
  });

  it("locates the BIOS region in an Intel SPI image", () => {
    const layout = inspectFirmwareImageLayout(intelSpiFixture());
    expect(layout).toMatchObject({
      kind: "intel-spi",
      biosStart: 0x2000,
      biosEnd: 0x5000,
    });
    expect(layout.regions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "descriptor", start: 0, end: 0x1000 }),
        expect.objectContaining({ name: "me", start: 0x1000, end: 0x2000 }),
      ]),
    );
  });

  it("reassembles a complete SPI without changing non-BIOS regions", () => {
    const source = intelSpiFixture();
    const layout = inspectFirmwareImageLayout(source);
    const bios = source.slice(layout.biosStart, layout.biosEnd);
    bios[0x123] ^= 0xff;
    const rebuilt = replaceFirmwareBiosRegion(source, layout, bios);

    expect(rebuilt).toHaveLength(source.length);
    expect(rebuilt.subarray(0, layout.biosStart)).toEqual(
      source.subarray(0, layout.biosStart),
    );
    expect(rebuilt[layout.biosStart + 0x123]).toBe(bios[0x123]);
  });

  it("rejects BIOS-region growth", () => {
    const source = intelSpiFixture();
    const layout = inspectFirmwareImageLayout(source);
    expect(() =>
      replaceFirmwareBiosRegion(source, layout, new Uint8Array(0x3001)),
    ).toThrow(/must remain/);
  });
});
