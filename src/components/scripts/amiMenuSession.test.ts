import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hiiVisibilityFixture } from "../../test/hiiVisibilityFixture";
import { sha256Hex } from "./checksum";
import { bytesToHex, hexToBytes } from "./hex";
import { buildFirmwarePatches } from "./patcher";
import {
  createDataChangeEntry,
  projectDataChangeQueue,
} from "../ChangeQueue/dataChangeQueue";
import { loadHiiQueueSession, saveHiiQueueSession } from "./hiiQueueSession";
import type { Data } from "./types";

async function fixture() {
  const { data: base, bytes } = hiiVisibilityFixture();
  base.firmwareFamily = "aptio-v";
  base.menu = [
    {
      name: base.forms[0].name,
      formId: base.forms[0].formId,
      formSetGuid: base.forms[0].formSetGuid,
      offset: "0x11",
      source: "amitse",
    },
  ];
  const originalAmitse = "AA010000000000000000000000000000000100BB";
  base.hashes.amitseSct = await sha256Hex(hexToBytes(originalAmitse));
  return {
    base,
    originalAmitse,
    originalSetupSct: bytesToHex(bytes),
    sourceBytes: new Uint8Array([...bytes, 0xaa, 1, 0, 0xbb]),
    ownershipKey: "synthetic AMITSE context",
  };
}
function assign(base: Data, targetFormIndex: number) {
  const after = structuredClone(base);
  after.menu[0].formId = after.forms[targetFormIndex].formId;
  after.menu[0].name = after.forms[targetFormIndex].name;
  return after;
}
function entry(before: Data, after: Data) {
  const result = createDataChangeEntry(before, after, "local");
  if (!result) throw new Error("Expected synthetic change");
  return result;
}
async function document() {
  const context = await fixture();
  const after = assign(context.base, 2);
  const text = await saveHiiQueueSession(context, [entry(context.base, after)]);
  return { context, after, text };
}
beforeEach(async () => {
  const { webcrypto } = await vi.importActual<{ webcrypto: Crypto }>("node:crypto");
  vi.stubGlobal("crypto", webcrypto);
});
afterEach(() => vi.unstubAllGlobals());
describe("AMI menu sessions (synthetic)", () => {
  it.each(["aptio-v", "aptio-iv", "ami-aptio"] as const)(
    "round-trips %s registration selectors and regenerates exact bytes",
    async (family) => {
      const context = await fixture();
      context.base.firmwareFamily = family;
      const after = assign(context.base, 2);
      const text = await saveHiiQueueSession(context, [entry(context.base, after)]);
      expect((JSON.parse(text) as { operations: unknown[] }).operations).toEqual([
        {
          action: "ami-menu",
          changes: [{ menuIndex: 0, targetFormIndex: 2 }],
          enabled: true,
        },
      ]);
      expect(text).not.toMatch(/offset|formId|formSetGuid|name|patches|AA0100BB/);
      const restored = await loadHiiQueueSession(text, context);
      const data = projectDataChangeQueue(context.base, restored).data;
      expect(data).toEqual(after);
      const built = buildFirmwarePatches(data, {
        setupSct: context.originalSetupSct,
        amitseSct: context.originalAmitse,
        setupdataBin: "",
      });
      expect(built.amitseSct).toEqual(
        hexToBytes("AA010000000000000000000000000000000300BB"),
      );
      expect(built.setupSct).toBeUndefined();
      expect(context.base.menu[0].formId).toBe("0x1");
    },
  );
  it("keeps sequential restore actions and validates paused entries", async () => {
    const { context, after } = await document();
    const restore = assign(after, 0);
    const text = await saveHiiQueueSession(context, [
      entry(context.base, after),
      entry(after, restore),
    ]);
    expect(
      projectDataChangeQueue(context.base, await loadHiiQueueSession(text, context))
        .data,
    ).toEqual(context.base);
    const paused = { ...entry(context.base, after), enabled: false };
    const loaded = await loadHiiQueueSession(
      await saveHiiQueueSession(context, [paused]),
      context,
    );
    expect(loaded[0].enabled).toBe(false);
    expect(projectDataChangeQueue(context.base, loaded).data).toEqual(context.base);
  });
  it.each([
    "family",
    "missing",
    "hash",
    "readonly",
    "source",
    "guid",
    "bounds",
    "offset",
    "stale",
    "overlap",
    "cross",
    "ambiguous",
    "name",
  ])("rejects %s evidence without mutating input", async (caseName) => {
    const context = await fixture();
    if (caseName === "family") context.base.firmwareFamily = "uefi-hii";
    if (caseName === "missing") context.originalAmitse = "";
    if (caseName === "hash") context.base.hashes.amitseSct = "wrong";
    if (caseName === "readonly") context.base.menu[0].offset = null;
    if (caseName === "source") context.base.menu[0].source = "formset";
    if (caseName === "guid") delete context.base.menu[0].formSetGuid;
    if (caseName === "bounds") context.base.menu[0].offset = "0x13";
    if (caseName === "offset") context.base.menu[0].offset = "broken";
    if (caseName === "stale") context.base.menu[0].formId = "0x2";
    if (caseName === "overlap")
      context.base.menu.push({ ...context.base.menu[0], offset: "0x12" });
    if (caseName === "cross") context.base.forms[2].formSetGuid = "other";
    if (caseName === "ambiguous")
      context.base.forms.push(structuredClone(context.base.forms[2]));
    if (caseName === "name") context.base.forms[2].name = "";
    const original = structuredClone(context.base);
    await expect(
      saveHiiQueueSession(context, [entry(context.base, assign(context.base, 2))]),
    ).rejects.toThrow();
    expect(context.base).toEqual(original);
  });
  it.each(
    [
      [],
      [{ menuIndex: 0, targetFormIndex: -1 }],
      [{ menuIndex: 0, targetFormIndex: 999 }],
      [{ menuIndex: 0, targetFormIndex: 2 }],
      [{ menuIndex: 0, targetFormIndex: 2, offset: "0x11" }],
      [
        { menuIndex: 0, targetFormIndex: 2 },
        { menuIndex: 0, targetFormIndex: 3 },
      ],
    ].map((changes) => ({ changes })),
  )(
    "rejects malformed/duplicate/no-op selectors $changes atomically",
    async ({ changes }) => {
      const { context, text } = await document();
      const value = JSON.parse(text) as { operations: Record<string, unknown>[] };
      value.operations.push({ action: "ami-menu", changes, enabled: false });
      const before = structuredClone(context.base);
      await expect(
        loadHiiQueueSession(JSON.stringify(value), context),
      ).rejects.toThrow();
      expect(context.base).toEqual(before);
    },
  );
  it("rejects compound metadata edits instead of dropping them", async () => {
    const { context, after } = await document();
    after.menu[0].pageMask = "0x1";
    await expect(
      saveHiiQueueSession(context, [entry(context.base, after)]),
    ).rejects.toThrow(/other changes/);
  });
  it("supports SetupData roots with a matching proven AMITSE mapping", async () => {
    const context = await fixture();
    context.base.menu[0].source = "setupdata";
    const after = assign(context.base, 2);
    const text = await saveHiiQueueSession(context, [entry(context.base, after)]);
    expect(
      projectDataChangeQueue(context.base, await loadHiiQueueSession(text, context))
        .data,
    ).toEqual(after);
  });
  it("rejects a matching FormId with stale preceding GUID bytes", async () => {
    const context = await fixture();
    context.originalAmitse = context.originalAmitse.replace("AA01", "AA02");
    context.base.hashes.amitseSct = await sha256Hex(hexToBytes(context.originalAmitse));
    await expect(
      saveHiiQueueSession(context, [entry(context.base, assign(context.base, 2))]),
    ).rejects.toThrow(/FormSet bytes/);
  });
  it("requires the opened companion even on paused import", async () => {
    const { context, text } = await document();
    context.originalAmitse = "AA010000000000000000000000000000000200BB";
    const value = JSON.parse(text) as { operations: Record<string, unknown>[] };
    value.operations[0].enabled = false;
    await expect(loadHiiQueueSession(JSON.stringify(value), context)).rejects.toThrow(
      /source hash/,
    );
  });
});
