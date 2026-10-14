import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadPhoenixQueueSession,
  savePhoenixQueueSession,
  queueSessionTextLimit,
} from "./phoenixQueueSession";
import { phoenixShowChange } from "./phoenixChangeQueue";
import type { PhoenixSetupInventory } from "./phoenixSetupMenu";
import type { PhoenixSetupItem } from "./phoenixSetupTable";

function fixture() {
  const source = Uint8Array.of(1, 2, 3);
  const items: PhoenixSetupItem[] = [48, 52].map((hidePatchOffset, index) => ({
    type: "pick-field",
    offset: 8 + index * 8,
    length: 20,
    prompt: `Option ${String(index)}`,
    help: null,
    options: [],
    submenuOffset: null,
    rawBytes: new Uint8Array(20),
    visibilityPatch: {
      callbackOffset: 32,
      hidePatchOffset,
      hiddenImmediate: 0x13 + index,
    },
  }));
  const templat = new Uint8Array(64);
  templat[49] = 0x13;
  templat[53] = 0x14;
  const inventory: PhoenixSetupInventory = {
    templat,
    menu: {
      source: "root-table",
      sections: [
        {
          offset: 0,
          name: "Main",
          parentOffset: null,
          depth: 0,
          placement: "root",
          items,
        },
      ],
    },
  };
  const entries = [
    phoenixShowChange(items[1]),
    { ...phoenixShowChange(items[0]), enabled: false },
  ];
  return { source, inventory, entries };
}
async function saved() {
  const f = fixture();
  return {
    ...f,
    text: await savePhoenixQueueSession(f.source, f.inventory, f.entries),
  };
}
function change(text: string, update: (value: Record<string, unknown>) => void) {
  const value = JSON.parse(text) as Record<string, unknown>;
  update(value);
  return JSON.stringify(value);
}

describe("Phoenix portable queue sessions (synthetic)", () => {
  beforeEach(async () => {
    const { webcrypto } = await vi.importActual<{ webcrypto: Crypto }>("node:crypto");
    vi.stubGlobal("crypto", webcrypto);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it("round-trips order/selection, regenerates labels and contains no patches or firmware bytes", async () => {
    const f = await saved();
    expect(JSON.parse(f.text)).toMatchObject({
      version: 2,
      operations: [
        { action: "show", itemOffset: 16, enabled: true },
        { action: "show", itemOffset: 8, enabled: false },
      ],
    });
    expect(f.text).not.toMatch(/patch|rawBytes|prompt|fileName|applied|image|history/);
    f.inventory.menu.sections[0].items[1].prompt = "Fresh decoded label";
    const restored = await loadPhoenixQueueSession(f.text, f.source, f.inventory);
    expect(restored.map((entry) => entry.payload.itemOffset)).toEqual([16, 8]);
    expect(restored.map((entry) => entry.enabled)).toEqual([true, false]);
    expect(restored[0].title).toBe("Fresh decoded label");
    expect(restored[0].patches[0].expected).toEqual(Uint8Array.of(0x14, 0));
    expect(f.source).toEqual(Uint8Array.of(1, 2, 3));
    expect(f.inventory.templat[53]).toBe(0x14);
  });
  it("migrates strict version-1 operations before regeneration", async () => {
    const f = await saved();
    const legacy = JSON.parse(f.text) as {
      version: number;
      operations: { action?: string; itemOffset: number; enabled: boolean }[];
    };
    legacy.version = 1;
    legacy.operations = legacy.operations.map(({ itemOffset, enabled }) => ({
      itemOffset,
      enabled,
    }));
    const restored = await loadPhoenixQueueSession(
      JSON.stringify(legacy),
      f.source,
      f.inventory,
    );
    expect(restored.map((entry) => entry.payload.itemOffset)).toEqual([16, 8]);
    expect(restored.map((entry) => entry.enabled)).toEqual([true, false]);
  });
  it.each(["source", "size", "template"])(
    "rejects a different %s without modifying bytes",
    async (kind) => {
      const f = await saved();
      if (kind === "source") f.source[2] = 4;
      if (kind === "template") f.inventory.templat[0] = 1;
      const source = kind === "size" ? Uint8Array.of(1, 2, 3, 0) : f.source;
      await expect(
        loadPhoenixQueueSession(f.text, source, f.inventory),
      ).rejects.toThrow("different firmware");
      expect(f.inventory.templat[49]).toBe(0x13);
    },
  );
  it.each([
    (value: Record<string, unknown>) => {
      value.version = 3;
    },
    (value: Record<string, unknown>) => {
      value.kind = "ami";
    },
    (value: Record<string, unknown>) => {
      value.extra = "untrusted";
    },
    (value: Record<string, unknown>) => {
      value.source = { sha256: "bad", size: 3, templatSha256: "bad" };
    },
    (value: Record<string, unknown>) => {
      value.operations = [{ itemOffset: -1, enabled: true }];
    },
    (value: Record<string, unknown>) => {
      value.operations = [{ itemOffset: 8, enabled: "yes" }];
    },
    (value: Record<string, unknown>) => {
      value.operations = [{ itemOffset: 8, enabled: true, patches: [] }];
    },
    (value: Record<string, unknown>) => {
      value.operations = [
        { itemOffset: 8, enabled: true },
        { itemOffset: 8, enabled: false },
      ];
    },
    (value: Record<string, unknown>) => {
      value.operations = Array.from({ length: 1001 }, (_, itemOffset) => ({
        itemOffset,
        enabled: true,
      }));
    },
  ])("rejects malformed schema/operations %s", async (update) => {
    const f = await saved();
    await expect(
      loadPhoenixQueueSession(change(f.text, update), f.source, f.inventory),
    ).rejects.toThrow("Queue session");
  });
  it("rejects invalid JSON, oversized input and empty source identities", async () => {
    const f = fixture();
    await expect(loadPhoenixQueueSession("{", f.source, f.inventory)).rejects.toThrow(
      "valid JSON",
    );
    await expect(
      loadPhoenixQueueSession(
        " ".repeat(queueSessionTextLimit + 1),
        f.source,
        f.inventory,
      ),
    ).rejects.toThrow("limit");
    await expect(
      savePhoenixQueueSession(new Uint8Array(), f.inventory, []),
    ).rejects.toThrow("opened firmware");
  });
  it.each(["missing", "ambiguous", "unsupported", "stale", "bounds"])(
    "rejects %s targets even when paused",
    async (kind) => {
      const f = fixture();
      const text = await savePhoenixQueueSession(f.source, f.inventory, f.entries);
      const item = f.inventory.menu.sections[0].items[0];
      if (kind === "missing") f.inventory.menu.sections[0].items.shift();
      if (kind === "ambiguous") f.inventory.menu.sections[0].items.push({ ...item });
      if (kind === "unsupported") item.visibilityPatch = null;
      if (kind === "stale" && item.visibilityPatch)
        item.visibilityPatch.hiddenImmediate = 0x99;
      if (kind === "bounds" && item.visibilityPatch)
        item.visibilityPatch.hidePatchOffset = 64;
      await expect(
        loadPhoenixQueueSession(text, f.source, f.inventory),
      ).rejects.toThrow();
    },
  );
  it("permits an empty session and rejects duplicate operations on save", async () => {
    const f = fixture();
    const text = await savePhoenixQueueSession(f.source, f.inventory, []);
    expect(await loadPhoenixQueueSession(text, f.source, f.inventory)).toEqual([]);
    await expect(
      savePhoenixQueueSession(f.source, f.inventory, [f.entries[0], f.entries[0]]),
    ).rejects.toThrow("duplicate");
  });
});
