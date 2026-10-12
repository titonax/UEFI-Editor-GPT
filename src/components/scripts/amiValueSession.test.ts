import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hiiVisibilityFixture } from "../../test/hiiVisibilityFixture";
import { sha256Hex } from "./checksum";
import { bytesToHex, hexToBytes } from "./hex";
import { buildFirmwarePatches } from "./patcher";
import { moveMenuReference } from "./menuEditing";
import {
  createDataChangeEntry,
  projectDataChangeQueue,
} from "../ChangeQueue/dataChangeQueue";
import { loadHiiQueueSession, saveHiiQueueSession } from "./hiiQueueSession";
import type { Data } from "./types";

async function fixture() {
  const { data: base, bytes } = hiiVisibilityFixture();
  base.firmwareFamily = "aptio-v";
  Object.assign(base.forms[0].children[0], {
    accessLevel: "01",
    failsafe: "00",
    optimal: "02",
    offsets: { accessLevel: "0x0", failsafe: "0x1", optimal: "0x2" },
  });
  const originalSetupData = "010002";
  base.hashes.setupdataBin = await sha256Hex(hexToBytes(originalSetupData));
  return {
    base,
    originalSetupData,
    originalSetupSct: bytesToHex(bytes),
    sourceBytes: new Uint8Array([...bytes, 1, 0, 2]),
    ownershipKey: "synthetic AMI context",
  };
}
function entry(before: Data, after: Data, id = "local") {
  const result = createDataChangeEntry(before, after, id);
  if (!result) throw new Error("Synthetic value operation must change Data");
  return result;
}
async function document() {
  const context = await fixture();
  const after = structuredClone(context.base);
  after.forms[0].children[0].accessLevel = "05";
  const text = await saveHiiQueueSession(context, [entry(context.base, after)]);
  return { context, after, text };
}
beforeEach(async () => {
  const { webcrypto } = await vi.importActual<{ webcrypto: Crypto }>("node:crypto");
  vi.stubGlobal("crypto", webcrypto);
});
afterEach(() => vi.unstubAllGlobals());

describe("mapped AMI scalar sessions (synthetic)", () => {
  it.each(["aptio-v", "aptio-iv", "ami-aptio"] as const)(
    "round-trips %s scalar batches as selectors and values only",
    async (family) => {
      const context = await fixture();
      context.base.firmwareFamily = family;
      const after = structuredClone(context.base);
      Object.assign(after.forms[0].children[0], {
        accessLevel: "05",
        failsafe: "F",
        optimal: "FF",
      });
      const original = entry(context.base, after);
      const text = await saveHiiQueueSession(context, [original]);
      expect(text).toContain('"action": "ami-values"');
      expect(text).not.toMatch(
        /offsets|ifrOffset|expected|replacement|patches|Main|010002/,
      );
      const restored = await loadHiiQueueSession(text, context);
      expect(restored[0].payload).toEqual(original.payload);
      expect(projectDataChangeQueue(context.base, restored).data).toEqual(after);
      expect(context.base.forms[0].children[0].accessLevel).toBe("01");
      const rebuilt = buildFirmwarePatches(
        projectDataChangeQueue(context.base, restored).data,
        {
          setupSct: context.originalSetupSct,
          amitseSct: "",
          setupdataBin: context.originalSetupData,
        },
      );
      expect(rebuilt.setupdataBin).toEqual(Uint8Array.of(5, 15, 255));
      expect(rebuilt.setupSct).toBeUndefined();
      expect(
        projectDataChangeQueue(context.base, restored).data.singleFormSetNavigation,
      ).toEqual(context.base.singleFormSetNavigation);
    },
  );
  it("preserves selected-prefix dependencies and rejects stale paused dependencies", async () => {
    const { context, after } = await document();
    const second = structuredClone(after);
    second.forms[0].children[0].accessLevel = "09";
    const firstEntry = entry(context.base, after, "first");
    const secondEntry = entry(after, second, "second");
    const restored = await loadHiiQueueSession(
      await saveHiiQueueSession(context, [firstEntry, secondEntry]),
      context,
    );
    expect(projectDataChangeQueue(context.base, restored).data).toEqual(second);
    await expect(
      saveHiiQueueSession(context, [
        { ...firstEntry, enabled: false },
        { ...secondEntry, enabled: false },
      ]),
    ).rejects.toThrow("stale");
    const paused = await loadHiiQueueSession(
      await saveHiiQueueSession(context, [{ ...firstEntry, enabled: false }]),
      context,
    );
    expect(paused[0].enabled).toBe(false);
    expect(projectDataChangeQueue(context.base, paused).data).toEqual(context.base);
  });
  it("follows a moved Ref's existing SetupData mapping without serializing offsets", async () => {
    const context = await fixture();
    const moved = await moveMenuReference(context.base, context.originalSetupSct, {
      sourceFormIndex: 0,
      referenceChildIndex: 0,
      destinationFormIndex: 1,
    });
    const after = structuredClone(moved);
    after.forms[1].children[1].optimal = "04";
    const text = await saveHiiQueueSession(context, [
      entry(context.base, moved, "move"),
      entry(moved, after, "value"),
    ]);
    expect(
      projectDataChangeQueue(context.base, await loadHiiQueueSession(text, context))
        .data,
    ).toEqual(after);
  });
  it.each([
    { formIndex: -1, childIndex: 0, field: "accessLevel", value: "05" },
    { formIndex: 0, childIndex: 0.5, field: "accessLevel", value: "05" },
    { formIndex: 0, childIndex: 0, field: "__proto__", value: "05" },
    { formIndex: 0, childIndex: 0, field: "ifrOffset", value: "05" },
    { formIndex: 0, childIndex: 0, field: "accessLevel", value: null },
    { formIndex: 0, childIndex: 0, field: "accessLevel", value: "" },
    { formIndex: 0, childIndex: 0, field: "accessLevel", value: "ff" },
    { formIndex: 0, childIndex: 0, field: "accessLevel", value: "100" },
    { formIndex: 0, childIndex: 0, field: "accessLevel", value: "05", offset: 0 },
  ])("rejects invalid or non-whitelisted scalar input", async (change) => {
    const { context, text } = await document();
    const value = JSON.parse(text) as { operations: unknown[] };
    value.operations = [{ action: "ami-values", changes: [change], enabled: false }];
    await expect(loadHiiQueueSession(JSON.stringify(value), context)).rejects.toThrow(
      "Queue session",
    );
  });
  it.each(["empty", "duplicate", "oversized", "selection"])(
    "rejects a malformed %s batch",
    async (failure) => {
      const { context, text } = await document();
      const value = JSON.parse(text) as {
        operations: { changes: unknown[]; enabled: unknown }[];
      };
      const op = value.operations[0];
      if (failure === "empty") op.changes = [];
      if (failure === "duplicate") op.changes.push(op.changes[0]);
      if (failure === "oversized")
        op.changes = Array.from({ length: 1001 }, () => op.changes[0]);
      if (failure === "selection") op.enabled = "true";
      await expect(loadHiiQueueSession(JSON.stringify(value), context)).rejects.toThrow(
        "Queue session",
      );
    },
  );
  it.each([
    "missing-source",
    "source-hash",
    "HII",
    "unmapped",
    "null-field",
    "incomplete-field",
    "invalid-offset",
    "bounds",
    "alias",
    "original-byte",
  ])("rejects %s even for paused scalar changes", async (failure) => {
    const context = await fixture();
    if (failure === "missing-source") context.originalSetupData = "";
    if (failure === "source-hash") context.originalSetupData = "010003";
    if (failure === "HII") context.base.firmwareFamily = "uefi-hii";
    const child = context.base.forms[0].children[0];
    if (failure === "unmapped") child.offsets = null;
    if (failure === "null-field") child.accessLevel = null;
    if (failure === "incomplete-field") child.optimal = "";
    if (!child.offsets && failure !== "unmapped")
      throw new Error("Missing fixture mapping");
    if (child.offsets) {
      if (failure === "invalid-offset") child.offsets.accessLevel = "0x0junk";
      if (failure === "bounds") child.offsets.accessLevel = "0x3";
      if (failure === "alias") child.offsets.optimal = "0x0";
    }
    if (failure === "original-byte") child.accessLevel = "03";
    const text = await saveHiiQueueSession(context, []);
    const value = JSON.parse(text) as { kind: string; operations: unknown[] };
    value.kind = "hii-menu-actions";
    value.operations = [
      {
        action: "ami-values",
        changes: [{ formIndex: 0, childIndex: 0, field: "accessLevel", value: "05" }],
        enabled: false,
      },
    ];
    const before = JSON.stringify(context);
    await expect(loadHiiQueueSession(JSON.stringify(value), context)).rejects.toThrow();
    expect(JSON.stringify(context)).toBe(before);
  });
  it("rejects missing later targets atomically and never imports a partial batch", async () => {
    const { context, text } = await document();
    const value = JSON.parse(text) as { operations: { changes: unknown[] }[] };
    value.operations[0].changes.push({
      formIndex: 999,
      childIndex: 0,
      field: "failsafe",
      value: "03",
    });
    const before = JSON.stringify(context.base);
    await expect(loadHiiQueueSession(JSON.stringify(value), context)).rejects.toThrow();
    expect(JSON.stringify(context.base)).toBe(before);
  });
  it("refuses incomplete values or mixed unrecognized changes at export", async () => {
    const { context, after } = await document();
    after.forms[0].children[0].name = "extra mutation";
    await expect(
      saveHiiQueueSession(context, [entry(context.base, after)]),
    ).rejects.toThrow();
    const incomplete = structuredClone(context.base);
    incomplete.forms[0].children[0].accessLevel = "";
    await expect(
      saveHiiQueueSession(context, [entry(context.base, incomplete)]),
    ).rejects.toThrow();
  });
});
