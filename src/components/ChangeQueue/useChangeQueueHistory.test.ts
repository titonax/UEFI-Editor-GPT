import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { firmwareData, condition } from "../../test/fixtures";
import type { ChangeQueueEntry } from "../scripts/changeQueue";
import { useChangeQueueHistory } from "./useChangeQueueHistory";
import { useDataChangeQueue } from "./useDataChangeQueue";
import { usePhoenixChangeQueue } from "../PhoenixEditor/usePhoenixChangeQueue";
import type { PhoenixSetupInventory } from "../scripts/phoenixSetupMenu";

function entry(id: string): ChangeQueueEntry<string> {
  return {
    id,
    family: "synthetic",
    operation: "test",
    targetKey: id,
    title: id,
    description: id,
    enabled: true,
    patches: [],
    payload: id,
  };
}

describe("shared queue history", () => {
  it("bounds history, preserves entry identity and drops redo after a divergent edit", () => {
    const source = {};
    const { result } = renderHook(() => useChangeQueueHistory<string>(source));
    const entries = Array.from({ length: 55 }, (_, index) => entry(String(index)));
    for (const item of entries)
      act(() => {
        result.current.update((current) => [...current, item]);
      });
    for (let index = 0; index < 50; index++)
      act(() => {
        result.current.undo();
      });
    expect(result.current.entries).toHaveLength(5);
    expect(result.current.entries[0]).toBe(entries[0]);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
    act(() => {
      result.current.undo();
    });
    expect(result.current.entries).toHaveLength(5);
    act(() => {
      result.current.redo();
    });
    expect(result.current.entries[5]).toBe(entries[5]);
    act(() => {
      result.current.update((current) => [...current, entry("new")]);
    });
    expect(result.current.canRedo).toBe(false);
    act(() => {
      result.current.redo();
    });
    expect(result.current.entries[result.current.entries.length - 1].id).toBe("new");
  });

  it("restores data operations, selected state, order, removal and clear without reapplying", () => {
    const base = firmwareData({ suppressions: [condition()] });
    const { result } = renderHook(() => useDataChangeQueue(base));
    act(() => {
      result.current.enqueueData((draft) => {
        draft.suppressions[0].active = false;
      });
    });
    act(() => {
      result.current.enqueueData((draft) => {
        draft.forms[0].name = "Advanced";
      });
    });
    const ids = result.current.entries.map((item) => item.id);
    act(() => {
      result.current.apply();
    });
    const revision = result.current.revision;
    act(() => {
      result.current.toggleEnabled(ids[0], false);
    });
    expect(result.current.previewData.suppressions[0].active).toBe(true);
    act(() => {
      result.current.undo();
    });
    expect(result.current.previewData.suppressions[0].active).toBe(false);
    expect(result.current.appliedFingerprint).toBeNull();
    expect(result.current.appliedData.suppressions[0].active).toBe(true);
    expect(result.current.revision).toBeGreaterThan(revision);
    act(() => {
      result.current.redo();
    });
    expect(result.current.entries[0].enabled).toBe(false);
    act(() => {
      result.current.move(ids[1], -1);
    });
    act(() => {
      result.current.undo();
    });
    expect(result.current.entries.map((item) => item.id)).toEqual(ids);
    act(() => {
      result.current.remove(ids[1]);
    });
    act(() => {
      result.current.undo();
    });
    expect(result.current.previewData.forms[0].name).toBe("Advanced");
    act(() => {
      result.current.clear();
    });
    expect(result.current.entries).toHaveLength(0);
    act(() => {
      result.current.undo();
    });
    expect(result.current.entries.map((item) => item.id)).toEqual(ids);
    act(() => {
      result.current.replaceBase(base);
    });
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
    expect(result.current.entries).toHaveLength(0);
    act(() => {
      result.current.undo();
      result.current.redo();
    });
    expect(result.current.previewData.suppressions[0].active).toBe(true);
    expect(base.suppressions[0].active).toBe(true);
  });

  it("ignores no-op queue controls without losing redo or an applied plan", () => {
    const base = firmwareData();
    const { result } = renderHook(() => useDataChangeQueue(base));
    act(() => {
      result.current.enqueueData((draft) => {
        draft.forms[0].name = "Advanced";
      });
    });
    act(() => {
      result.current.apply();
    });
    const revision = result.current.revision;
    const fingerprint = result.current.appliedFingerprint;
    act(() => {
      result.current.toggleEnabled(result.current.entries[0].id, true);
      result.current.remove("missing");
      result.current.move(result.current.entries[0].id, -1);
      result.current.redo();
      result.current.enqueueData((draft) => {
        draft.forms[0].name = "Advanced";
      });
    });
    expect(result.current.revision).toBe(revision);
    expect(result.current.appliedFingerprint).toBe(fingerprint);
    act(() => {
      result.current.undo();
    });
    act(() => {
      result.current.clear();
    });
    expect(result.current.canRedo).toBe(true);
  });

  it("resets Phoenix history on inventory replacement and close, even for identical sources", () => {
    const templat = new Uint8Array(64);
    templat[49] = 0x13;
    const source: PhoenixSetupInventory = {
      templat,
      menu: { source: "root-table", sections: [] },
    };
    const initialProps: { inventory: PhoenixSetupInventory | null } = {
      inventory: source,
    };
    const { result, rerender } = renderHook(
      ({ inventory }) => usePhoenixChangeQueue(inventory),
      { initialProps },
    );
    act(() => {
      result.current.toggleItem({
        type: "pick-field",
        offset: 8,
        length: 20,
        prompt: "Synthetic",
        help: null,
        options: [],
        submenuOffset: null,
        rawBytes: new Uint8Array(20),
        visibilityPatch: {
          callbackOffset: 32,
          hidePatchOffset: 48,
          hiddenImmediate: 0x13,
        },
      });
    });
    act(() => {
      result.current.apply();
    });
    expect(result.current.canUndo).toBe(true);
    rerender({ inventory: { ...source } });
    expect(result.current.entries).toHaveLength(0);
    expect(result.current.appliedFingerprint).toBeNull();
    expect(result.current.canUndo).toBe(false);
    act(() => {
      result.current.undo();
    });
    rerender({ inventory: null });
    expect(result.current.canRedo).toBe(false);
  });
});
