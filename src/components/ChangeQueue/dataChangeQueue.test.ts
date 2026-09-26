import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { condition, firmwareData, form, prompt } from "../../test/fixtures";
import {
  appendDataChangeEntry,
  createDataChangeEntry,
  projectDataChangeQueue,
} from "./dataChangeQueue";
import { useDataChangeQueue } from "./useDataChangeQueue";

describe("firmware data change queue", () => {
  it("combines independent edits and permits either one to be paused", () => {
    const base = firmwareData({
      suppressions: [condition()],
      forms: [
        form({
          children: [
            prompt({
              accessLevel: "00",
              failsafe: "00",
              optimal: "00",
              offsets: { accessLevel: "0x0", failsafe: "0x1", optimal: "0x2" },
            }),
          ],
        }),
      ],
    });
    const visible = structuredClone(base);
    visible.suppressions[0].active = false;
    const visibility = createDataChangeEntry(base, visible, "visibility");
    const defaults = structuredClone(visible);
    defaults.forms[0].children[0].accessLevel = "05";
    const access = createDataChangeEntry(visible, defaults, "access");
    if (!visibility || !access) throw new Error("Expected two queue entries.");

    const combined = projectDataChangeQueue(base, [visibility, access]);
    expect(combined.analysis.canApply).toBe(true);
    expect(combined.data.suppressions[0].active).toBe(false);
    expect(combined.data.forms[0].children[0].accessLevel).toBe("05");

    const accessOnly = projectDataChangeQueue(base, [
      { ...visibility, enabled: false },
      access,
    ]);
    expect(accessOnly.analysis.canApply).toBe(true);
    expect(accessOnly.data.suppressions[0].active).toBe(true);
    expect(accessOnly.data.forms[0].children[0].accessLevel).toBe("05");
  });

  it("blocks a later operation when its required earlier state is removed", () => {
    const base = firmwareData({ suppressions: [condition()] });
    const hidden = structuredClone(base);
    hidden.suppressions[0].active = false;
    const first = createDataChangeEntry(base, hidden, "hide");
    const restored = structuredClone(hidden);
    restored.suppressions[0].active = true;
    const second = createDataChangeEntry(hidden, restored, "restore");
    if (!first || !second) throw new Error("Expected two queue entries.");

    const projection = projectDataChangeQueue(base, [
      { ...first, enabled: false },
      second,
    ]);
    expect(projection.analysis.canApply).toBe(false);
    expect(projection.analysis.issues).toContainEqual(
      expect.objectContaining({ code: "stale-logical-state", severity: "error" }),
    );
  });

  it("optimizes opposite selected operations to no net firmware change", () => {
    const base = firmwareData({ suppressions: [condition()] });
    const hidden = structuredClone(base);
    hidden.suppressions[0].active = false;
    const first = createDataChangeEntry(base, hidden, "hide");
    const restored = structuredClone(hidden);
    restored.suppressions[0].active = true;
    const second = createDataChangeEntry(hidden, restored, "restore");
    if (!first || !second) throw new Error("Expected two queue entries.");

    const projection = projectDataChangeQueue(base, [first, second]);
    expect(projection.analysis.canApply).toBe(false);
    expect(projection.analysis.stats.patchSpans).toBe(0);
    expect(projection.analysis.issues).toContainEqual(
      expect.objectContaining({ code: "no-net-change", severity: "warning" }),
    );
  });

  it("collapses consecutive edits of the same target and removes a cancelled pair", () => {
    const base = firmwareData({ suppressions: [condition()] });
    const hidden = structuredClone(base);
    hidden.suppressions[0].active = false;
    const first = createDataChangeEntry(base, hidden, "hide");
    const restored = structuredClone(hidden);
    restored.suppressions[0].active = true;
    const second = createDataChangeEntry(hidden, restored, "restore");
    if (!first || !second) throw new Error("Expected two queue entries.");

    expect(appendDataChangeEntry([first], second)).toEqual([]);
  });

  it("keeps export data immutable until apply and invalidates it after a mutation", () => {
    const base = firmwareData({ suppressions: [condition()] });
    const { result } = renderHook(() => useDataChangeQueue(base));

    act(() => {
      result.current.enqueueData((draft) => {
        draft.suppressions[0].active = false;
      });
    });
    expect(result.current.previewData.suppressions[0].active).toBe(false);
    expect(result.current.appliedData.suppressions[0].active).toBe(true);

    act(() => {
      result.current.apply();
    });
    expect(result.current.appliedData.suppressions[0].active).toBe(false);

    act(() => {
      result.current.enqueueData((draft) => {
        draft.forms[0].name = "Advanced";
      });
    });
    expect(result.current.appliedFingerprint).toBeNull();
    expect(result.current.appliedData.suppressions[0].active).toBe(true);

    act(() => {
      result.current.clear();
    });
    expect(result.current.entries).toHaveLength(0);
    expect(result.current.previewData.suppressions[0].active).toBe(true);
  });
});
