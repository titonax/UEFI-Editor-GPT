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

  it("keeps consecutive user actions visible while optimizing their net result", () => {
    const base = firmwareData({ suppressions: [condition()] });
    const hidden = structuredClone(base);
    hidden.suppressions[0].active = false;
    const first = createDataChangeEntry(base, hidden, "hide");
    const restored = structuredClone(hidden);
    restored.suppressions[0].active = true;
    const second = createDataChangeEntry(hidden, restored, "restore");
    if (!first || !second) throw new Error("Expected two queue entries.");

    const entries = appendDataChangeEntry([first], second);
    expect(entries.map((entry) => entry.title)).toEqual([first.title, second.title]);
    expect(projectDataChangeQueue(base, entries).analysis).toMatchObject({
      canApply: false,
      stats: { selectedChanges: 2, patchSpans: 0 },
    });
  });

  it("names the exact menu and direction of a structural move", () => {
    const base = firmwareData({
      firmwareFamily: "uefi-hii",
      forms: [
        form({
          name: "Advanced",
          formId: "0x100",
          children: [
            prompt({
              type: "Ref",
              name: "Debug Settings",
              questionId: "0x10",
              formId: "0x200",
              pageId: null,
            }),
          ],
        }),
        form({ name: "Security", formId: "0x300" }),
        form({ name: "Debug Settings", formId: "0x200" }),
      ],
    });
    const moved = structuredClone(base);
    const [reference] = moved.forms[0].children.splice(0, 1);
    if (!reference) throw new Error("Expected the Ref fixture.");
    moved.forms[1].children.push(reference);
    moved.ifrEdits = [
      {
        kind: "move-ref",
        sourceOffset: 0x10,
        sourceEnd: 0x20,
        destinationOffset: 0x30,
        expected: [1],
        destinationExpected: [2],
        description: "Move Ref at 0x10 from FormId 0x100 to FormId 0x300",
      },
    ];

    expect(createDataChangeEntry(base, moved, "move")).toMatchObject({
      operation: "Move",
      title: "Move menu Debug Settings",
      description: "Advanced (0x100) → Security (0x300).",
    });
  });

  it("names the menu affected by a suppression visibility action", () => {
    const base = firmwareData({
      firmwareFamily: "uefi-hii",
      suppressions: [condition({ offset: "0x20", active: true })],
      forms: [
        form({
          name: "Advanced",
          children: [
            prompt({
              type: "Ref",
              name: "Trusted Computing",
              formId: "0x200",
              pageId: null,
              suppressIf: ["0x20"],
            }),
          ],
        }),
      ],
    });
    const shown = structuredClone(base);
    shown.suppressions[0].active = false;

    expect(createDataChangeEntry(base, shown, "show")).toMatchObject({
      operation: "Show",
      title: "Show menu Trusted Computing",
      description: "Disable SuppressIf 0x20 in Advanced.",
    });
  });

  it("describes a queued structural hide by menu name and original position", () => {
    const guid = "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA";
    const reference = prompt({
      type: "Ref",
      name: "Trusted Computing",
      questionId: "0x10",
      formId: "0x200",
      targetFormSetGuid: guid,
      pageId: null,
    });
    const base = firmwareData({
      firmwareFamily: "uefi-hii",
      forms: [
        form({
          name: "Advanced",
          formId: "0x100",
          formSetGuid: guid,
          children: [reference],
        }),
        form({ name: "Trusted Computing", formId: "0x200", formSetGuid: guid }),
        form({ name: "Suppression host", formId: "0x300", formSetGuid: guid }),
      ],
    });
    const hidden = structuredClone(base);
    const [movedReference] = hidden.forms[0].children.splice(0, 1);
    if (movedReference?.type !== "Ref") {
      throw new Error("Expected the Ref fixture.");
    }
    movedReference.suppressIf = ["0x90"];
    movedReference.conditions = ["0x90"];
    hidden.forms[2].children.push(movedReference);
    hidden.uefiHiiVisibilityEdits = [
      {
        reference: {
          questionId: "0x10",
          targetFormId: "0x200",
          targetFormSetGuid: guid,
        },
        originalParentFormId: "0x100",
        originalParentFormSetGuid: guid,
        editCount: 1,
      },
    ];

    expect(createDataChangeEntry(base, hidden, "hide")).toMatchObject({
      operation: "Hide",
      title: "Hide menu Trusted Computing",
      description:
        "Keep its logical position under Advanced, and park its Ref in the proven SuppressIf scope.",
    });
  });

  it("shows the exact option field and old/new values", () => {
    const base = firmwareData({
      forms: [
        form({
          name: "Power & Performance",
          children: [prompt({ name: "Turbo Mode", accessLevel: "00" })],
        }),
      ],
    });
    const changed = structuredClone(base);
    changed.forms[0].children[0].accessLevel = "05";

    expect(createDataChangeEntry(base, changed, "access")).toMatchObject({
      operation: "Change",
      title: "Set access level for Turbo Mode",
      description: "00 → 05 in Power & Performance.",
    });
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

describe("data queue reordering", () => {
  it("requires reapplication after moving independent operations and retains their final values", () => {
    const base = firmwareData();
    const { result } = renderHook(() => useDataChangeQueue(base));
    act(() => {
      result.current.enqueueData((draft) => {
        draft.forms[0].name = "Advanced";
      });
    });
    act(() => {
      result.current.enqueueData((draft) => {
        draft.suppressions = [condition({ active: false })];
      });
    });
    act(() => {
      result.current.apply();
    });
    const original = result.current.entries.map((entry) => entry.id);
    act(() => {
      result.current.move(original[1], -1);
    });
    expect(result.current.entries.map((entry) => entry.id)).toEqual(
      [...original].reverse(),
    );
    expect(result.current.analysis.canApply).toBe(true);
    expect(result.current.appliedFingerprint).toBeNull();
    expect(result.current.appliedData.forms[0].name).toBe(base.forms[0].name);
    act(() => {
      result.current.apply();
    });
    expect(result.current.appliedData.forms[0].name).toBe("Advanced");
    expect(result.current.appliedData.suppressions[0].active).toBe(false);
  });
  it("blocks dependent operations moved ahead of their expected state and recovers when restored", () => {
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
        draft.forms[0].children[0].accessLevel = "02";
      });
    });
    act(() => {
      result.current.apply();
    });
    const second = result.current.entries[1].id;
    act(() => {
      result.current.move(second, -1);
    });
    expect(result.current.analysis.canApply).toBe(false);
    expect(
      result.current.analysis.issues.some(
        (issue) => issue.code === "stale-logical-state",
      ),
    ).toBe(true);
    act(() => {
      result.current.apply();
    });
    expect(result.current.appliedFingerprint).toBeNull();
    expect(result.current.appliedData.forms[0].children[0].accessLevel).toBe("00");
    act(() => {
      result.current.move(second, 1);
    });
    expect(result.current.analysis.canApply).toBe(true);
    act(() => {
      result.current.apply();
    });
    expect(result.current.appliedData.forms[0].children[0].accessLevel).toBe("02");
    expect(base.forms[0].children[0].accessLevel).toBe("00");
  });
});
