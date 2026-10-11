import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { firmwareData, form, prompt } from "../../test/fixtures";
import { analyzeIfrBinary, IFR_OPCODE } from "./ifrBinary";
import { bytesToHex } from "./hex";
import { moveMenuReference } from "./menuEditing";
import {
  createDataChangeEntry,
  projectDataChangeQueue,
} from "../ChangeQueue/dataChangeQueue";
import { useDataChangeQueue } from "../ChangeQueue/useDataChangeQueue";
import { loadHiiQueueSession, saveHiiQueueSession } from "./hiiQueueSession";
import { queueSessionTextLimit } from "./phoenixQueueSession";

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error("Missing synthetic fixture value");
  return value;
}

function fixture() {
  const guid = "00000000-0000-0000-0000-000000000000";
  const ops = [
    IFR_OPCODE.FORM_SET,
    0x97,
    ...new Array<number>(21).fill(0),
    IFR_OPCODE.FORM,
    0x86,
    1,
    0,
    0,
    0,
    IFR_OPCODE.REF,
    15,
    1,
    0,
    2,
    0,
    0x10,
    0,
    4,
    0,
    5,
    0,
    0,
    3,
    0,
    IFR_OPCODE.END,
    2,
    IFR_OPCODE.FORM,
    0x86,
    2,
    0,
    0,
    0,
    3,
    2,
    IFR_OPCODE.END,
    2,
    IFR_OPCODE.FORM,
    0x86,
    3,
    0,
    0,
    0,
    3,
    2,
    IFR_OPCODE.END,
    2,
    IFR_OPCODE.END,
    2,
  ];
  const bytes = new Uint8Array([ops.length + 4, 0, 0, 2, ...ops]);
  const model = analyzeIfrBinary(bytes);
  const offset = (id: number) =>
    `0x${required(model.packages[0].opcodes.find((span) => span.opcode === IFR_OPCODE.FORM && span.formId === id)).offset.toString(16)}`;
  const refOffset = required(
    model.packages[0].opcodes.find((span) => span.opcode === IFR_OPCODE.REF),
  ).offset;
  const base = firmwareData({
    ifrBinary: model,
    forms: [
      form({
        formSetGuid: guid,
        ifrOffset: offset(1),
        children: [
          prompt({
            type: "Ref",
            name: "Target",
            formId: "0x3",
            ifrOffset: `0x${refOffset.toString(16)}`,
            questionId: "0x10",
            pageId: null,
          }),
        ],
      }),
      form({
        name: "Destination",
        formId: "0x2",
        formSetGuid: guid,
        ifrOffset: offset(2),
      }),
      form({
        name: "Target",
        formId: "0x3",
        formSetGuid: guid,
        ifrOffset: offset(3),
        referencedIn: ["0x1"],
      }),
    ],
  });
  return {
    sourceBytes: new Uint8Array([9, 8, ...bytes]),
    originalSetupSct: bytesToHex(bytes),
    base,
    ownershipKey: "synthetic module:0",
  };
}
const request = { sourceFormIndex: 0, referenceChildIndex: 0, destinationFormIndex: 1 };
async function plan() {
  const context = fixture();
  const after = await moveMenuReference(
    context.base,
    context.originalSetupSct,
    request,
  );
  const entry = required(createDataChangeEntry(context.base, after, "local:1"));
  const text = await saveHiiQueueSession(context, [entry]);
  return { context, after, entry, text };
}
beforeEach(async () => {
  const { webcrypto } = await vi.importActual<{ webcrypto: Crypto }>("node:crypto");
  vi.stubGlobal("crypto", webcrypto);
});
afterEach(() => vi.unstubAllGlobals());

describe("source-bound AMI/HII Ref sessions (synthetic)", () => {
  it.each(["aptio-v", "uefi-hii"] as const)(
    "round-trips %s through the editor and exports selectors only",
    async (firmwareFamily) => {
      const context = fixture();
      context.base.firmwareFamily = firmwareFamily;
      const after = await moveMenuReference(
        context.base,
        context.originalSetupSct,
        request,
      );
      const entry = required(createDataChangeEntry(context.base, after, "private-id"));
      entry.title = "untrusted local title";
      const text = await saveHiiQueueSession(context, [{ ...entry, enabled: false }]);
      const parsed = JSON.parse(text) as { operations: unknown[] };
      expect(parsed.operations).toEqual([{ ...request, enabled: false }]);
      expect(text).not.toMatch(
        /patches|expected|replacement|ifrBinary|untrusted|private-id|Target|Destination/,
      );
      const restored = await loadHiiQueueSession(text, context);
      expect(restored[0].enabled).toBe(false);
      expect(restored[0].title).toBe("Move menu Target");
      expect(restored[0].payload).toEqual(entry.payload);
      expect(context.base.forms[0].children).toHaveLength(1);
    },
  );
  it("preserves ordered dependent moves and remaps from regenerated data", async () => {
    const { context, after, entry } = await plan();
    const back = await moveMenuReference(after, context.originalSetupSct, {
      sourceFormIndex: 1,
      referenceChildIndex: 0,
      destinationFormIndex: 0,
    });
    const second = required(createDataChangeEntry(after, back, "local:2"));
    const restored = await loadHiiQueueSession(
      await saveHiiQueueSession(context, [entry, second]),
      context,
    );
    expect(restored.map((op) => op.id)).toEqual(["session-ref:1", "session-ref:2"]);
    expect(projectDataChangeQueue(context.base, restored).data).toEqual(back);
  });
  it("rejects stale dependent moves when a prerequisite is paused, even if both are paused", async () => {
    const { context, after, entry } = await plan();
    const back = await moveMenuReference(after, context.originalSetupSct, {
      sourceFormIndex: 1,
      referenceChildIndex: 0,
      destinationFormIndex: 0,
    });
    const second = required(createDataChangeEntry(after, back, "local:2"));
    await expect(
      saveHiiQueueSession(context, [
        { ...entry, enabled: false },
        { ...second, enabled: false },
      ]),
    ).rejects.toThrow("stale");
  });
  it("accepts an empty session", async () => {
    const context = fixture();
    expect(
      await loadHiiQueueSession(await saveHiiQueueSession(context, []), context),
    ).toEqual([]);
  });
  it.each(["source", "size", "stream", "base", "ownership"])(
    "rejects a mismatched %s identity",
    async (part) => {
      const { context, text } = await plan();
      if (part === "source") context.sourceBytes[0] ^= 1;
      if (part === "size") context.sourceBytes = context.sourceBytes.slice(1);
      if (part === "stream") context.originalSetupSct += "00";
      if (part === "base") context.base.forms[0].name += " changed";
      if (part === "ownership") context.ownershipKey += "different selected context";
      await expect(loadHiiQueueSession(text, context)).rejects.toThrow("different");
    },
  );
  it.each([
    { version: 2 },
    { kind: "phoenix-visibility" },
    { unknown: true },
    { source: { sha256: "invalid", size: 3, contextSha256: "0".repeat(64) } },
    { operations: [{ ...request, enabled: 1 }] },
    { operations: [{ ...request, sourceFormIndex: -1, enabled: false }] },
    { operations: [{ ...request, referenceChildIndex: 0.5, enabled: true }] },
    {
      operations: [
        {
          ...request,
          destinationFormIndex: Number.MAX_SAFE_INTEGER + 1,
          enabled: true,
        },
      ],
    },
    { operations: [{ ...request, enabled: true, expected: [0] }] },
    { operations: Array.from({ length: 1001 }, () => ({ ...request, enabled: true })) },
  ])("rejects malformed/unknown fields atomically", async (change) => {
    const { context, text } = await plan();
    const before = JSON.stringify(context);
    await expect(
      loadHiiQueueSession(
        JSON.stringify({ ...(JSON.parse(text) as object), ...change }),
        context,
      ),
    ).rejects.toThrow("Queue session");
    expect(JSON.stringify(context)).toBe(before);
  });
  it("bounds text, rejects invalid JSON and requires opened bytes", async () => {
    const context = fixture();
    await expect(
      loadHiiQueueSession(" ".repeat(queueSessionTextLimit + 1), context),
    ).rejects.toThrow("limit");
    await expect(loadHiiQueueSession("{", context)).rejects.toThrow("JSON");
    await expect(
      saveHiiQueueSession({ ...context, sourceBytes: new Uint8Array() }, []),
    ).rejects.toThrow("opened");
  });
  it.each([true, false])(
    "rejects missing or incompatible targets even when enabled=%s",
    async (enabled) => {
      const { context, text } = await plan();
      const session = JSON.parse(text) as { operations: unknown[] };
      for (const destinationFormIndex of [0, 2, 999]) {
        session.operations = [{ ...request, destinationFormIndex, enabled }];
        await expect(
          loadHiiQueueSession(JSON.stringify(session), context),
        ).rejects.toThrow();
      }
    },
  );
  it("rejects an invalid later operation without changing the base", async () => {
    const { context, text } = await plan();
    const session = JSON.parse(text) as { operations: unknown[] };
    session.operations.push({ ...request, enabled: false });
    const before = structuredClone(context.base);
    await expect(
      loadHiiQueueSession(JSON.stringify(session), context),
    ).rejects.toThrow();
    expect(context.base).toEqual(before);
  });
  it("refuses scalar and compound operations instead of losing changes", async () => {
    const { context, after, entry } = await plan();
    const scalar = structuredClone(context.base);
    scalar.forms[0].name = "changed";
    await expect(
      saveHiiQueueSession(context, [
        required(createDataChangeEntry(context.base, scalar, "scalar")),
      ]),
    ).rejects.toThrow("individual Ref");
    after.forms[0].name = "additional change";
    await expect(
      saveHiiQueueSession(context, [
        required(createDataChangeEntry(context.base, after, entry.id)),
      ]),
    ).rejects.toThrow("other changes");
  });
  it("restores once with Undo, invalidates Apply, and avoids ID collisions on new edits", async () => {
    const { context, after, text } = await plan();
    const { result } = renderHook(() => useDataChangeQueue(context.base));
    act(() => {
      result.current.enqueueData(after);
    });
    act(() => {
      result.current.apply();
    });
    const revision = result.current.revision;
    const oldEntries = result.current.entries;
    const restored = await loadHiiQueueSession(text, context);
    act(() => {
      result.current.restoreEntries(restored);
    });
    expect(result.current.revision).toBeGreaterThan(revision);
    expect(result.current.appliedFingerprint).toBeNull();
    expect(result.current.appliedData).toEqual(context.base);
    act(() => {
      result.current.undo();
    });
    expect(result.current.entries).toBe(oldEntries);
    expect(result.current.appliedFingerprint).toBeNull();
    act(() => {
      result.current.redo();
    });
    act(() => {
      result.current.enqueueData((draft) => {
        draft.forms[0].name = "Another edit";
      });
    });
    expect(new Set(result.current.entries.map((entry) => entry.id)).size).toBe(2);
  });
});
