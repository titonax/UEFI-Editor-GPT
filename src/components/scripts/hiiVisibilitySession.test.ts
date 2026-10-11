import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hiiVisibilityFixture } from "../../test/hiiVisibilityFixture";
import { bytesToHex } from "./hex";
import {
  moveMenuReference,
  replayIfrEdits,
  toggleTopLevelTabVisibility,
} from "./menuEditing";
import { toggleUefiHiiMenuVisibility } from "./uefiHiiEditing";
import {
  loadHiiQueueSession,
  saveHiiQueueSession,
  type HiiQueueSessionContext,
} from "./hiiQueueSession";
import {
  createDataChangeEntry,
  projectDataChangeQueue,
} from "../ChangeQueue/dataChangeQueue";
import type { Data } from "./types";

function fixture(family: "aptio-v" | "uefi-hii") {
  const { bytes, data } = hiiVisibilityFixture(family === "uefi-hii");
  data.firmwareFamily = family;
  if (family === "uefi-hii") {
    data.singleFormSetNavigation = undefined;
    for (const form of data.forms) form.sourceModuleId = "synthetic-setup";
  }
  return {
    sourceBytes: new Uint8Array([7, 8, ...bytes]),
    originalSetupSct: bytesToHex(bytes),
    base: data,
    ownershipKey: "synthetic-owned-module",
  };
}
function entry(before: Data, after: Data, id = "local") {
  const value = createDataChangeEntry(before, after, id);
  if (!value) throw new Error("Synthetic action must change Data");
  return value;
}
function visibility(
  context: HiiQueueSessionContext,
  data: Data,
  sourceFormIndex: number,
  referenceChildIndex: number,
  visible: boolean,
) {
  return data.firmwareFamily === "uefi-hii"
    ? toggleUefiHiiMenuVisibility(
        data,
        context.originalSetupSct,
        sourceFormIndex,
        referenceChildIndex,
        visible,
      )
    : toggleTopLevelTabVisibility(data, context.originalSetupSct, {
        sourceFormIndex,
        referenceChildIndex,
        visible,
      });
}
beforeEach(async () => {
  const { webcrypto } = await vi.importActual<{ webcrypto: Crypto }>("node:crypto");
  vi.stubGlobal("crypto", webcrypto);
});
afterEach(() => vi.unstubAllGlobals());

describe("AMI tabs and vendor-neutral menu visibility sessions (synthetic)", () => {
  it.each(["aptio-v", "uefi-hii"] as const)(
    "round-trips %s Hide/Show and preserves physical menu position",
    async (family) => {
      const context = fixture(family);
      const hidden = await visibility(context, context.base, 0, 0, false);
      const index = hidden.forms[1].children.findIndex(
        (child) => child.type === "Ref" && child.formId === "0x3",
      );
      const shown = await visibility(context, hidden, 1, index, true);
      const text = await saveHiiQueueSession(context, [
        entry(context.base, hidden, "hide"),
        entry(hidden, shown, "show"),
      ]);
      const session = JSON.parse(text) as { kind: string; operations: unknown[] };
      expect(session.kind).toBe("hii-menu-actions");
      expect(session.operations).toEqual([
        {
          action: "visibility",
          sourceFormIndex: 0,
          referenceChildIndex: 0,
          visible: false,
          enabled: true,
        },
        {
          action: "visibility",
          sourceFormIndex: 1,
          referenceChildIndex: index,
          visible: true,
          enabled: true,
        },
      ]);
      expect(text).not.toMatch(
        /ifrOffset|destinationBeforeOffset|restoreBeforeOffset|patches|expected|replacement|navigation|Main|Boot/,
      );
      const restored = await loadHiiQueueSession(text, context);
      expect(restored.map((op) => op.title)).toEqual([
        "Hide menu Main",
        "Show menu Main",
      ]);
      const projection = projectDataChangeQueue(context.base, restored);
      expect(projection.data).toEqual(shown);
      expect(
        projection.analysis.issues.filter((issue) => issue.severity === "error"),
      ).toEqual([]);
      expect(replayIfrEdits(projection.data, context.originalSetupSct)).toEqual(
        replayIfrEdits(context.base, context.originalSetupSct),
      );
      expect(projection.data.forms[0].children.map((child) => child.name)).toEqual([
        "Main",
        "Boot",
      ]);
      if (family === "uefi-hii")
        expect(projection.data.uefiHiiVisibilityEdits).toEqual([]);
    },
  );
  it.each(["aptio-v", "uefi-hii"] as const)(
    "validates paused %s visibility without advancing the selected prefix",
    async (family) => {
      const context = fixture(family);
      const hidden = await visibility(context, context.base, 0, 0, false);
      const paused = { ...entry(context.base, hidden), enabled: false };
      const restored = await loadHiiQueueSession(
        await saveHiiQueueSession(context, [paused]),
        context,
      );
      expect(restored[0].enabled).toBe(false);
      expect(restored[0].payload).toEqual(paused.payload);
      expect(projectDataChangeQueue(context.base, restored).data).toEqual(context.base);
      const shown = await visibility(context, hidden, 1, 1, true);
      await expect(
        saveHiiQueueSession(context, [
          paused,
          { ...entry(hidden, shown), enabled: false },
        ]),
      ).rejects.toThrow("stale");
    },
  );
  it("supports mixed Ref moves and visibility with fresh HII restore anchors", async () => {
    const context = fixture("uefi-hii");
    const moved = await moveMenuReference(context.base, context.originalSetupSct, {
      sourceFormIndex: 0,
      referenceChildIndex: 1,
      destinationFormIndex: 1,
    });
    const hidden = await visibility(context, moved, 0, 0, false);
    const text = await saveHiiQueueSession(context, [
      entry(context.base, moved, "move"),
      entry(moved, hidden, "hide"),
    ]);
    expect(text).toContain('"action": "move-ref"');
    const restored = await loadHiiQueueSession(text, context);
    expect(projectDataChangeQueue(context.base, restored).data).toEqual(hidden);
    expect(restored.map((op) => op.title)).toEqual([
      "Move menu Boot",
      "Hide menu Main",
    ]);
  });
  it.each([
    {
      action: "root-visibility",
      sourceFormIndex: 0,
      referenceChildIndex: 0,
      visible: false,
      enabled: true,
    },
    {
      action: "visibility",
      sourceFormIndex: 0,
      referenceChildIndex: 0,
      visible: 0,
      enabled: true,
    },
    {
      action: "visibility",
      sourceFormIndex: -1,
      referenceChildIndex: 0,
      visible: false,
      enabled: true,
    },
    {
      action: "visibility",
      sourceFormIndex: 0,
      referenceChildIndex: 0,
      visible: false,
      enabled: true,
      destinationBeforeOffset: "0x10",
    },
    {
      action: "move-ref",
      sourceFormIndex: 0,
      referenceChildIndex: 0,
      destinationFormIndex: 1,
      enabled: true,
      visible: false,
    },
  ])("rejects malformed or capability-promoting action fields", async (operation) => {
    const context = fixture("aptio-v");
    const value = JSON.parse(await saveHiiQueueSession(context, [])) as {
      kind: string;
      operations: unknown[];
    };
    value.kind = "hii-menu-actions";
    value.operations = [operation];
    await expect(loadHiiQueueSession(JSON.stringify(value), context)).rejects.toThrow(
      "Queue session",
    );
  });
  it.each(["missing-hub", "runtime-condition", "missing-owner", "missing-ref"])(
    "retains existing editor rejection for %s",
    async (failure) => {
      const context = fixture(failure === "missing-owner" ? "uefi-hii" : "aptio-v");
      if (failure === "missing-hub") context.base.singleFormSetNavigation = undefined;
      if (failure === "runtime-condition")
        context.base.suppressions[0].constant = undefined;
      if (failure === "missing-owner") context.base.forms[0].sourceModuleId = undefined;
      const value = JSON.parse(await saveHiiQueueSession(context, [])) as {
        kind: string;
        operations: unknown[];
      };
      value.kind = "hii-menu-actions";
      value.operations = [
        {
          action: "visibility",
          sourceFormIndex: 0,
          referenceChildIndex: failure === "missing-ref" ? 999 : 0,
          visible: false,
          enabled: false,
        },
      ];
      const before = JSON.stringify(context);
      await expect(
        loadHiiQueueSession(JSON.stringify(value), context),
      ).rejects.toThrow();
      expect(JSON.stringify(context)).toBe(before);
    },
  );
  it("rejects compound visibility edits and forged routing descriptions", async () => {
    const context = fixture("aptio-v");
    const hidden = await visibility(context, context.base, 0, 0, false);
    const compound = structuredClone(hidden);
    compound.forms[0].name = "extra edit";
    await expect(
      saveHiiQueueSession(context, [entry(context.base, compound)]),
    ).rejects.toThrow("other changes");
    const move = hidden.ifrEdits?.[0];
    if (!move) throw new Error("Missing visibility move");
    move.description = "Show top-level tab Main by a forged label";
    await expect(
      saveHiiQueueSession(context, [entry(context.base, hidden)]),
    ).rejects.toThrow();
  });
  it("rejects an invalid later visibility atomically, without imported HII provenance", async () => {
    const context = fixture("uefi-hii");
    const hidden = await visibility(context, context.base, 0, 0, false);
    const text = await saveHiiQueueSession(context, [entry(context.base, hidden)]);
    const value = JSON.parse(text) as { operations: unknown[] };
    value.operations.push({
      action: "visibility",
      sourceFormIndex: 0,
      referenceChildIndex: 999,
      visible: true,
      enabled: false,
    });
    const before = JSON.stringify(context.base);
    await expect(loadHiiQueueSession(JSON.stringify(value), context)).rejects.toThrow();
    expect(JSON.stringify(context.base)).toBe(before);
  });
});
