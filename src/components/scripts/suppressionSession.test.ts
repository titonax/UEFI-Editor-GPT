import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hiiVisibilityFixture } from "../../test/hiiVisibilityFixture";
import { analyzeIfrBinary } from "./ifrBinary";
import { hexToBytes, bytesToHex } from "./hex";
import { moveMenuReference, replayIfrEdits } from "./menuEditing";
import {
  toggleUefiHiiSuppressions,
  applyUefiHiiSuppressionEdits,
} from "./uefiHiiSuppressionEditing";
import {
  createDataChangeEntry,
  projectDataChangeQueue,
} from "../ChangeQueue/dataChangeQueue";
import { saveHiiQueueSession, loadHiiQueueSession } from "./hiiQueueSession";
import type { Data } from "./types";

function fixture(family: "aptio-v" | "uefi-hii" = "aptio-v") {
  const { data: base, bytes } = hiiVisibilityFixture();
  base.firmwareFamily = family;
  return {
    base,
    originalSetupSct: bytesToHex(bytes),
    sourceBytes: new Uint8Array([9, ...bytes]),
    ownershipKey: "synthetic owned Forms Package",
  };
}
function entry(before: Data, after: Data, id = "local") {
  const result = createDataChangeEntry(before, after, id);
  if (!result) throw new Error("Expected synthetic suppression change");
  return result;
}
async function toggle(data: Data, active: boolean) {
  if (data.firmwareFamily === "uefi-hii")
    return toggleUefiHiiSuppressions(data, [data.suppressions[0].offset], active);
  const next = structuredClone(data);
  next.suppressions[0].active = active;
  return next;
}
async function plan(family: "aptio-v" | "uefi-hii" = "aptio-v") {
  const context = fixture(family);
  const after = await toggle(context.base, false);
  const text = await saveHiiQueueSession(context, [entry(context.base, after)]);
  return { context, after, text };
}
beforeEach(async () => {
  const { webcrypto } = await vi.importActual<{ webcrypto: Crypto }>("node:crypto");
  vi.stubGlobal("crypto", webcrypto);
});
afterEach(() => vi.unstubAllGlobals());

describe("AMI/HII suppression override sessions (synthetic)", () => {
  it.each(["aptio-v", "uefi-hii"] as const)(
    "round-trips %s disable/restore and verifies the existing scope relocation",
    async (family) => {
      const { context, after } = await plan(family);
      const restoredCondition = await toggle(after, true);
      const text = await saveHiiQueueSession(context, [
        entry(context.base, after, "disable"),
        entry(after, restoredCondition, "restore"),
      ]);
      expect((JSON.parse(text) as { operations: unknown[] }).operations).toEqual([
        {
          action: "suppressions",
          changes: [{ conditionIndex: 0, active: false }],
          enabled: true,
        },
        {
          action: "suppressions",
          changes: [{ conditionIndex: 0, active: true }],
          enabled: true,
        },
      ]);
      expect(text).not.toMatch(
        /offset|expression|constant|patches|expected|replacement|Main|Seed/,
      );
      const queue = await loadHiiQueueSession(text, context);
      expect(projectDataChangeQueue(context.base, queue).data).toEqual(
        restoredCondition,
      );
      const bytes = replayIfrEdits(after, context.originalSetupSct);
      const changed = applyUefiHiiSuppressionEdits(after, bytes);
      expect(changed).toHaveLength(bytes.length);
      expect(changed).not.toEqual(bytes);
      expect(applyUefiHiiSuppressionEdits(restoredCondition, bytes)).toEqual(bytes);
    },
  );
  it.each(["aptio-v", "uefi-hii"] as const)(
    "validates paused %s operations without advancing selected state",
    async (family) => {
      const { context, after } = await plan(family);
      const first = { ...entry(context.base, after), enabled: false };
      const paused = await loadHiiQueueSession(
        await saveHiiQueueSession(context, [first]),
        context,
      );
      expect(paused[0].enabled).toBe(false);
      expect(projectDataChangeQueue(context.base, paused).data).toEqual(context.base);
      const back = await toggle(after, true);
      await expect(
        saveHiiQueueSession(context, [
          first,
          { ...entry(after, back), enabled: false },
        ]),
      ).rejects.toThrow("stale");
    },
  );
  it("regenerates the current condition mapping after a Ref move", async () => {
    const context = fixture("uefi-hii");
    const moved = await moveMenuReference(context.base, context.originalSetupSct, {
      sourceFormIndex: 0,
      referenceChildIndex: 0,
      destinationFormIndex: 1,
    });
    const next = await toggle(moved, false);
    const text = await saveHiiQueueSession(context, [
      entry(context.base, moved, "move"),
      entry(moved, next, "force"),
    ]);
    expect(
      projectDataChangeQueue(context.base, await loadHiiQueueSession(text, context))
        .data,
    ).toEqual(next);
    expect(moved.suppressions[0].offset).not.toBe(context.base.suppressions[0].offset);
  });
  it("preserves multiple independent condition changes as one HII queue batch", async () => {
    const context = fixture("uefi-hii");
    const shift = context.originalSetupSct.length / 2;
    const second = structuredClone(context.base.suppressions[0]);
    for (const field of ["offset", "start", "end"] as const) {
      second[field] = `0x${(Number.parseInt(second[field], 16) + shift).toString(16)}`;
    }
    context.base.suppressions.push(second);
    context.originalSetupSct += context.originalSetupSct;
    context.sourceBytes = hexToBytes(context.originalSetupSct);
    context.base.ifrBinary = analyzeIfrBinary(context.sourceBytes);
    const after = await toggleUefiHiiSuppressions(
      context.base,
      context.base.suppressions.map((condition) => condition.offset),
      false,
    );
    const text = await saveHiiQueueSession(context, [entry(context.base, after)]);
    expect((JSON.parse(text) as { operations: unknown[] }).operations).toHaveLength(1);
    const restored = await loadHiiQueueSession(text, context);
    expect(restored).toHaveLength(1);
    expect(projectDataChangeQueue(context.base, restored).data).toEqual(after);
  });

  it("retains runtime/hardware classification as an override, not new visibility evidence", async () => {
    const context = fixture();
    context.base.suppressions[0].source = "hardware";
    context.base.suppressions[0].constant = undefined;
    const after = await toggle(context.base, false);
    const queue = await loadHiiQueueSession(
      await saveHiiQueueSession(context, [entry(context.base, after)]),
      context,
    );
    expect(projectDataChangeQueue(context.base, queue).data.suppressions[0]).toEqual(
      after.suppressions[0],
    );
    expect(after.suppressions[0].source).toBe("hardware");
    expect(after.suppressions[0].constant).toBeUndefined();
  });
  it.each(
    [
      [],
      [{ conditionIndex: -1, active: false }],
      [{ conditionIndex: 0.5, active: false }],
      [{ conditionIndex: 0, active: 0 }],
      [{ conditionIndex: 0, active: false, offset: "0x10" }],
      [
        { conditionIndex: 0, active: false },
        { conditionIndex: 0, active: true },
      ],
      Array.from({ length: 1001 }, () => ({ conditionIndex: 0, active: false })),
    ].map((changes) => ({ changes })),
  )("rejects malformed condition batches", async ({ changes }) => {
    const { context, text } = await plan();
    const value = JSON.parse(text) as { operations: unknown[] };
    value.operations = [{ action: "suppressions", changes, enabled: true }];
    await expect(loadHiiQueueSession(JSON.stringify(value), context)).rejects.toThrow(
      "Queue session",
    );
  });
  it.each([
    "GrayOutIf",
    "alias",
    "offset",
    "start",
    "end",
    "owner",
    "missing",
    "family",
  ])("rejects %s evidence, including paused restore actions", async (failure) => {
    const context = fixture();
    const condition = context.base.suppressions[0];
    if (failure === "GrayOutIf") condition.kind = "GrayOutIf";
    if (failure === "alias") context.base.suppressions.push(structuredClone(condition));
    if (failure === "offset") condition.offset = "0x0bad!";
    if (failure === "start") condition.start = "0x0";
    if (failure === "end") condition.end = "0x1";
    if (failure === "owner")
      condition.formSetGuid = "00000002-0000-0000-0000-000000000000";
    if (failure === "family") Reflect.deleteProperty(context.base, "firmwareFamily");
    const value = JSON.parse(await saveHiiQueueSession(context, [])) as {
      kind: string;
      operations: unknown[];
    };
    value.kind = "hii-menu-actions";
    value.operations = [
      {
        action: "suppressions",
        changes: [{ conditionIndex: failure === "missing" ? 999 : 0, active: true }],
        enabled: false,
      },
    ];
    const before = JSON.stringify(context.base);
    await expect(loadHiiQueueSession(JSON.stringify(value), context)).rejects.toThrow();
    expect(JSON.stringify(context.base)).toBe(before);
  });
  it("rejects compound changes and invalid later targets atomically", async () => {
    const { context, after, text } = await plan();
    after.forms[0].name = "other mutation";
    await expect(
      saveHiiQueueSession(context, [entry(context.base, after)]),
    ).rejects.toThrow("other changes");
    const value = JSON.parse(text) as { operations: { changes: unknown[] }[] };
    value.operations[0].changes.push({ conditionIndex: 999, active: false });
    const before = JSON.stringify(context.base);
    await expect(loadHiiQueueSession(JSON.stringify(value), context)).rejects.toThrow();
    expect(JSON.stringify(context.base)).toBe(before);
  });
});
