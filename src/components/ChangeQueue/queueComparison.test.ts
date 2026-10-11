import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { condition, firmwareData, form, prompt } from "../../test/fixtures";
import { createDataChangeEntry, projectDataChangeQueue } from "./dataChangeQueue";
import { binaryQueueComparison, dataQueueComparison } from "./queueComparison";
import { analyzeChangeQueue, type ChangeQueueEntry } from "../scripts/changeQueue";
import { useDataChangeQueue } from "./useDataChangeQueue";

function binaryEntry(id: string, replacement: number): ChangeQueueEntry {
  return {
    id,
    family: "synthetic",
    operation: "Show",
    targetKey: id,
    title: id,
    description: id,
    enabled: true,
    payload: null,
    patches: [
      {
        bufferId: "module",
        offset: 0,
        expected: Uint8Array.of(0x13, 0),
        replacement: Uint8Array.of(replacement, 0),
      },
    ],
  };
}

describe("original / selected queue plan comparison", () => {
  it("reports net original-to-final values rather than intermediate queue values and tracks undo/selection", () => {
    const base = firmwareData({
      forms: [form({ children: [prompt({ accessLevel: "00" })] })],
    });
    const { result } = renderHook(() => useDataChangeQueue(base));
    act(() => {
      result.current.enqueueData((draft) => {
        draft.forms[0].children[0].accessLevel = "01";
      });
    });
    act(() => {
      result.current.enqueueData((draft) => {
        draft.forms[0].children[0].accessLevel = "05";
      });
    });
    expect(result.current.comparison.rows).toHaveLength(1);
    expect(result.current.comparison.rows[0]).toMatchObject({
      before: "00",
      after: "05",
      field: "forms.0.children.0.accessLevel",
    });
    expect(result.current.comparison.rows[0].target).toContain(
      base.forms[0].children[0].name,
    );
    const revision = result.current.revision;
    expect(result.current.comparison.valid).toBe(true);
    expect(result.current.appliedFingerprint).toBeNull();
    expect(result.current.revision).toBe(revision);
    act(() => {
      result.current.undo();
    });
    expect(result.current.comparison.rows[0].after).toBe("01");
    act(() => {
      result.current.redo();
    });
    act(() => {
      result.current.toggleEnabled(result.current.entries[0].id, false);
    });
    expect(result.current.comparison).toMatchObject({ valid: false, rows: [] });
    expect(base.forms[0].children[0].accessLevel).toBe("00");
  });

  it("shows no net changes for cancelling operations or an empty selection", () => {
    const base = firmwareData({ suppressions: [condition()] });
    const changed = structuredClone(base);
    changed.suppressions[0].active = false;
    const show = createDataChangeEntry(base, changed, "show");
    const hide = createDataChangeEntry(changed, base, "hide");
    if (!show || !hide) throw new Error("Expected changes");
    expect(
      dataQueueComparison(base, projectDataChangeQueue(base, [show, hide])),
    ).toMatchObject({ valid: true, totalRows: 0, rows: [] });
    expect(
      dataQueueComparison(
        base,
        projectDataChangeQueue(base, [{ ...show, enabled: false }]),
      ),
    ).toMatchObject({ valid: true, totalRows: 0 });
    const comparison = dataQueueComparison(base, projectDataChangeQueue(base, [show]));
    expect(comparison.rows[0]).toMatchObject({
      target: "SuppressIf 0x0",
      before: "Yes",
      after: "No",
    });
  });

  it("compares ordered structure and added/removed plans with explicit bounded summaries", () => {
    const base = firmwareData({
      forms: [
        form({
          children: [
            prompt({ type: "Ref", formId: "0x2", name: "First" }),
            prompt({ type: "Ref", formId: "0x3", name: "Second" }),
          ],
        }),
      ],
    });
    const changed = structuredClone(base);
    changed.forms[0].children.splice(0, 1);
    changed.ifrEdits = [];
    const change = createDataChangeEntry(base, changed, "move");
    if (!change) throw new Error("Expected change");
    const comparison = dataQueueComparison(
      base,
      projectDataChangeQueue(base, [change]),
    );
    const children = comparison.rows.find((row) => row.field === "forms.0.children");
    expect(children?.before).toContain("First");
    expect(children?.after).not.toContain("First");
    expect(children?.after).toContain("Second");
    expect(comparison.rows.find((row) => row.field === "ifrEdits")).toMatchObject({
      before: "Not present",
      after: "[]",
    });
    const reverse = createDataChangeEntry(changed, base, "restore");
    if (!reverse) throw new Error("Expected restoration");
    expect(
      dataQueueComparison(
        changed,
        projectDataChangeQueue(changed, [reverse]),
      ).rows.find((row) => row.field === "ifrEdits")?.after,
    ).toBe("Not present");
  });

  it("bounds large comparisons and labels omitted rows and structural fields", () => {
    const base = firmwareData({
      forms: Array.from({ length: 105 }, (_, index) =>
        form({ name: `Form ${String(index)}` }),
      ),
    });
    const changed = structuredClone(base);
    for (const item of changed.forms) item.name += " changed";
    changed.forms[0].name = "x".repeat(200);
    changed.ifrEdits = [
      {
        kind: "move-ref",
        expected: Array.from({ length: 64 }, () => 222),
        sourceOffset: 1,
        sourceEnd: 2,
        destinationOffset: 2,
        destinationExpected: [],
        description: "Test",
      },
    ];
    const change = createDataChangeEntry(base, changed, "large");
    if (!change) throw new Error("Expected change");
    const comparison = dataQueueComparison(
      base,
      projectDataChangeQueue(base, [change]),
    );
    expect(comparison.totalRows).toBe(106);
    expect(comparison.rows).toHaveLength(100);
    expect(comparison.rows[0].after).toContain("200 characters");
    const bytesOnly = structuredClone(base);
    bytesOnly.ifrEdits = changed.ifrEdits;
    const edit = createDataChangeEntry(base, bytesOnly, "bytes");
    if (!edit) throw new Error("Expected byte plan");
    const text = dataQueueComparison(base, projectDataChangeQueue(base, [edit])).rows[0]
      .after;
    expect(text).toContain("60 more");
    expect(text).toContain("more fields");
  });

  it("deduplicates binary spans, excludes paused patches and blocks stale/conflicting sources", () => {
    const buffers = { module: Uint8Array.of(0x13, 0) };
    const first = binaryEntry("first", 0);
    const second = binaryEntry("second", 0);
    const comparison = binaryQueueComparison(
      analyzeChangeQueue([first, second], buffers),
    );
    expect(comparison).toMatchObject({ kind: "binary", valid: true, totalRows: 1 });
    expect(comparison.rows[0]).toMatchObject({
      target: "module",
      field: "0x0 · 2 bytes",
      before: "13 00",
      after: "00 00",
    });
    expect(
      binaryQueueComparison(analyzeChangeQueue([{ ...first, enabled: false }], buffers))
        .totalRows,
    ).toBe(0);
    expect(
      binaryQueueComparison(
        analyzeChangeQueue([first], { module: Uint8Array.of(0x14, 0) }),
      ),
    ).toMatchObject({ valid: false, rows: [] });
    expect(
      binaryQueueComparison(
        analyzeChangeQueue([first, binaryEntry("conflict", 1)], buffers),
      ),
    ).toMatchObject({ valid: false, rows: [] });
    expect(
      binaryQueueComparison(
        analyzeChangeQueue([binaryEntry("unchanged", 0x13)], buffers),
      ).totalRows,
    ).toBe(0);
  });
  it("keeps distinct comparison rows for compatible spans sharing an offset", () => {
    const long = binaryEntry("long", 0);
    const short = binaryEntry("short", 0);
    short.patches[0].expected = Uint8Array.of(0x13);
    short.patches[0].replacement = Uint8Array.of(0);
    const comparison = binaryQueueComparison(
      analyzeChangeQueue([long, short], { module: Uint8Array.of(0x13, 0) }),
    );
    expect(comparison.rows).toHaveLength(2);
    expect(new Set(comparison.rows.map((row) => row.key)).size).toBe(2);
  });
});
