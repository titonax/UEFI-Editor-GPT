import { describe, expect, it } from "vitest";
import {
  phoenixModifiedFileName,
  rebuildPhoenixFirmware,
} from "./phoenixFirmwareRebuilder";
import type { PhoenixSetupInventory } from "./phoenixSetupMenu";

const emptyInventory: PhoenixSetupInventory = {
  templat: new Uint8Array(),
  menu: { source: "root-table", sections: [] },
};

describe("rebuildPhoenixFirmware", () => {
  it("rejects an empty applied plan before inspecting the image", async () => {
    await expect(
      rebuildPhoenixFirmware(new Uint8Array(), emptyInventory, []),
    ).rejects.toThrow(/No applied Phoenix changes/);
  });

  it("preserves the original firmware extension", () => {
    expect(phoenixModifiedFileName("ACER-Z03-20140701.bin")).toBe(
      "ACER-Z03-20140701-modified.bin",
    );
    expect(phoenixModifiedFileName("Lenovo-P53.rom")).toBe("Lenovo-P53-modified.rom");
    expect(phoenixModifiedFileName("firmware")).toBe("firmware-modified.bin");
  });
});
