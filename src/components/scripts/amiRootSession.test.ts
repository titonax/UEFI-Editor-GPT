import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { buildPe, graph, roots } from "../../test/amiRootFixture";
import { firmwareData } from "../../test/fixtures";
import { inspectAmiRootVisibility } from "./amiRootVisibility";
import { toggleAmiRootVisibility } from "./amiRootVisibilityEditing";
import { planAmiRootVisibilityPatches } from "./amiRootVisibilityPatcher";
import { hasAcceptedRootVisibilitySource } from "./firmwareAcceptance";
import { sha256Hex } from "./checksum";
import {
  createDataChangeEntry,
  projectDataChangeQueue,
} from "../ChangeQueue/dataChangeQueue";
import { loadHiiQueueSession, saveHiiQueueSession } from "./hiiQueueSession";
import type { Data } from "./types";

function fixture(options: { secondVector?: number[] } = {}) {
  const provenance = graph(buildPe([1, 0, 1], options));
  const rootList = roots(3);
  const base = firmwareData({
    firmwareFamily: "ami-aptio",
    formSetRoots: rootList,
    menu: rootList,
    rootVisibility: inspectAmiRootVisibility(rootList, provenance),
  });
  return {
    base,
    sourceBytes: new Uint8Array(provenance.buffers[0].bytes),
    originalSetupSct: "00",
    ownershipKey: JSON.stringify(provenance.artifacts),
    provenance,
  };
}
function change(before: Data, index: number) {
  const after = structuredClone(before);
  after.rootVisibilityEdits = toggleAmiRootVisibility(after, index);
  return after;
}
function entry(before: Data, after: Data, id = "local") {
  const result = createDataChangeEntry(before, after, id);
  if (!result) throw new Error("Expected synthetic root change");
  return result;
}
async function plan() {
  const context = fixture();
  const after = change(context.base, 1);
  const text = await saveHiiQueueSession(context, [entry(context.base, after)]);
  return { context, after, text };
}
beforeEach(async () => {
  const { webcrypto } = await vi.importActual<{ webcrypto: Crypto }>("node:crypto");
  vi.stubGlobal("crypto", webcrypto);
});
afterEach(() => vi.unstubAllGlobals());

describe("fresh-source AMI root sessions (synthetic PE code)", () => {
  it.each(["aptio-v", "aptio-iv", "ami-aptio"] as const)(
    "round-trips %s desired roots without importing source offsets or evidence",
    async (family) => {
      const context = fixture();
      context.base.firmwareFamily = family;
      const after = change(context.base, 1);
      const text = await saveHiiQueueSession(context, [entry(context.base, after)]);
      expect((JSON.parse(text) as { operations: unknown[] }).operations).toEqual([
        {
          action: "ami-roots",
          changes: [{ rootIndex: 1, visible: true }],
          enabled: true,
        },
      ]);
      expect(text).not.toMatch(
        /bufferId|bufferOffset|vector|confidence|codeReference|formSetGuid|expected|replacement|Root 1/,
      );
      const restored = await loadHiiQueueSession(text, context);
      expect(restored[0].title).toBe("Show root menu Root 1");
      expect(projectDataChangeQueue(context.base, restored).data).toEqual(after);
      const edits =
        projectDataChangeQueue(context.base, restored).data.rootVisibilityEdits ?? [];
      expect(
        planAmiRootVisibilityPatches(
          edits,
          context.base.rootVisibility,
          context.provenance,
        )[0],
      ).toMatchObject({
        offset: 0x684 + 1,
        expected: Uint8Array.of(0),
        replacement: Uint8Array.of(1),
      });
      expect(context.provenance.buffers[1].bytes[0x685]).toBe(0);
      expect(
        hasAcceptedRootVisibilitySource(
          await sha256Hex(context.sourceBytes),
          context.sourceBytes.length,
        ),
      ).toBe(false);
    },
  );
  it("restores the original desired state and retains immutable original evidence", async () => {
    const { context, after } = await plan();
    const back = change(after, 1);
    const text = await saveHiiQueueSession(context, [
      entry(context.base, after, "show"),
      entry(after, back, "restore"),
    ]);
    const queue = await loadHiiQueueSession(text, context);
    expect(
      projectDataChangeQueue(context.base, queue).data.rootVisibilityEdits,
    ).toBeUndefined();
    expect(projectDataChangeQueue(context.base, queue).data.rootVisibility).toEqual(
      context.base.rootVisibility,
    );
  });
  it("preserves root batches and paused operations against the selected prefix", async () => {
    const context = fixture();
    const first = change(context.base, 1);
    const after = change(first, 0);
    const batch = entry(context.base, after);
    const text = await saveHiiQueueSession(context, [batch]);
    expect(
      (JSON.parse(text) as { operations: { changes: unknown[] }[] }).operations[0]
        .changes,
    ).toHaveLength(2);
    expect(
      projectDataChangeQueue(context.base, await loadHiiQueueSession(text, context))
        .data,
    ).toEqual(after);
    const paused = await loadHiiQueueSession(
      await saveHiiQueueSession(context, [{ ...batch, enabled: false }]),
      context,
    );
    expect(projectDataChangeQueue(context.base, paused).data).toEqual(context.base);
    const back = change(first, 1);
    await expect(
      saveHiiQueueSession(context, [
        { ...entry(context.base, first), enabled: false },
        { ...entry(first, back), enabled: false },
      ]),
    ).rejects.toThrow("stale");
  });
  it.each(
    [
      [],
      [{ rootIndex: -1, visible: true }],
      [{ rootIndex: 1, visible: 1 }],
      [{ rootIndex: 1, visible: true, bufferOffset: 0x685 }],
      [
        { rootIndex: 1, visible: true },
        { rootIndex: 1, visible: false },
      ],
      Array.from({ length: 1001 }, () => ({ rootIndex: 1, visible: true })),
    ].map((changes) => ({ changes })),
  )("rejects malformed root batches", async ({ changes }) => {
    const { context, text } = await plan();
    const value = JSON.parse(text) as { operations: unknown[] };
    value.operations = [{ action: "ami-roots", changes, enabled: false }];
    await expect(loadHiiQueueSession(JSON.stringify(value), context)).rejects.toThrow(
      "Queue session",
    );
  });
  it.each([
    "missing-graph",
    "HII",
    "root-bytes",
    "root-size",
    "duplicate-buffer",
    "duplicate-artifact",
    "decoded-code",
    "cached-evidence",
    "missing-root",
    "last-root",
  ])("rejects %s without a partial queue or source change", async (failure) => {
    const context = fixture();
    if (failure === "HII") context.base.firmwareFamily = "uefi-hii";
    if (failure === "root-bytes") context.provenance.buffers[0].bytes[0] = 1;
    if (failure === "root-size") context.provenance.sourceSize -= 1;
    if (failure === "duplicate-buffer")
      context.provenance.buffers.push(context.provenance.buffers[0]);
    if (failure === "duplicate-artifact")
      context.provenance.artifacts.push(context.provenance.artifacts[0]);
    if (failure === "decoded-code")
      context.provenance.buffers[1].bytes[4 + 0x220] = 0x90;
    if (failure === "cached-evidence" && context.base.rootVisibility?.vector)
      context.base.rootVisibility.vector.offset += 1;
    const value = JSON.parse(await saveHiiQueueSession(context, [])) as {
      kind: string;
      operations: unknown[];
    };
    value.kind = "hii-menu-actions";
    value.operations = [
      {
        action: "ami-roots",
        changes:
          failure === "last-root"
            ? [
                { rootIndex: 0, visible: false },
                { rootIndex: 2, visible: false },
              ]
            : [{ rootIndex: failure === "missing-root" ? 999 : 1, visible: true }],
        enabled: false,
      },
    ];
    const input =
      failure === "missing-graph" ? { ...context, provenance: undefined } : context;
    const before = JSON.stringify(input);
    await expect(loadHiiQueueSession(JSON.stringify(value), input)).rejects.toThrow();
    expect(JSON.stringify(input)).toBe(before);
  });
  it("rejects ambiguous vectors instead of promoting cached evidence", async () => {
    const context = fixture({ secondVector: [1, 1, 0] });
    const value = JSON.parse(await saveHiiQueueSession(context, [])) as {
      kind: string;
      operations: unknown[];
    };
    value.kind = "hii-menu-actions";
    value.operations = [
      {
        action: "ami-roots",
        changes: [{ rootIndex: 1, visible: true }],
        enabled: true,
      },
    ];
    await expect(loadHiiQueueSession(JSON.stringify(value), context)).rejects.toThrow(
      "freshly corroborated",
    );
  });
  it("rejects compound root changes and invalid later roots atomically", async () => {
    const { context, after, text } = await plan();
    after.forms[0].name = "extra mutation";
    await expect(
      saveHiiQueueSession(context, [entry(context.base, after)]),
    ).rejects.toThrow("other changes");
    const value = JSON.parse(text) as { operations: unknown[] };
    value.operations.push({
      action: "ami-roots",
      changes: [{ rootIndex: 999, visible: true }],
      enabled: false,
    });
    const before = JSON.stringify(context);
    await expect(loadHiiQueueSession(JSON.stringify(value), context)).rejects.toThrow();
    expect(JSON.stringify(context)).toBe(before);
  });
});
