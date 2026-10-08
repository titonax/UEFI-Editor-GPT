import React from "react";
import { MantineProvider } from "@mantine/core";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveAs } from "file-saver";
import type { PhoenixSetupInventory } from "../scripts/phoenixSetupMenu";
import type { PhoenixSetupItem } from "../scripts/phoenixSetupTable";
import {
  rebuildPhoenixFirmware,
  type PhoenixFirmwareBuildResult,
} from "../scripts/phoenixFirmwareRebuilder";
import { usePhoenixChangeQueue } from "./usePhoenixChangeQueue";
import PhoenixFooter from "./PhoenixFooter";

vi.mock("../scripts/phoenixFirmwareRebuilder", async (original) => ({
  ...(await original<typeof import("../scripts/phoenixFirmwareRebuilder")>()),
  rebuildPhoenixFirmware: vi.fn(),
}));
vi.mock("file-saver", () => ({ saveAs: vi.fn() }));
const item: PhoenixSetupItem = {
  type: "pick-field",
  offset: 8,
  length: 20,
  prompt: "Synthetic option",
  help: null,
  options: [],
  submenuOffset: null,
  rawBytes: new Uint8Array(20),
  visibilityPatch: { callbackOffset: 32, hidePatchOffset: 48, hiddenImmediate: 0x13 },
};
const secondItem: PhoenixSetupItem = {
  ...item,
  offset: 16,
  prompt: "Second option",
  visibilityPatch: { callbackOffset: 40, hidePatchOffset: 52, hiddenImmediate: 0x14 },
};
const output: PhoenixFirmwareBuildResult = {
  image: new Uint8Array([0x10, 0x20, 0x30]),
  compressedSize: 1,
  allocationSize: 2,
  changedOffset: 1,
  changedLength: 2,
  verifiedItemCount: 1,
};
function inventory(): PhoenixSetupInventory {
  const templat = new Uint8Array(64);
  templat[49] = 0x13;
  templat[53] = 0x14;
  return {
    templat,
    menu: {
      source: "root-table",
      sections: [
        {
          offset: 0,
          name: "Main",
          parentOffset: null,
          depth: 0,
          placement: "root",
          items: [item, secondItem],
        },
      ],
    },
  };
}
function Workspace() {
  const [source, setSource] = React.useState(() => new Uint8Array(3));
  const [opened] = React.useState(inventory);
  const [navigation, setNavigation] = React.useState(0);
  const queue = usePhoenixChangeQueue(opened);
  return (
    <MantineProvider env="test">
      <button
        onClick={() => {
          queue.toggleItem(item);
        }}
      >
        Stage Show
      </button>
      <button
        onClick={() => {
          queue.toggleItem(secondItem);
        }}
      >
        Stage second Show
      </button>
      <button
        onClick={() => {
          setSource(new Uint8Array(3));
        }}
      >
        Reload source
      </button>
      <button
        onClick={() => {
          setNavigation((value) => value + 1);
        }}
      >
        Navigate {navigation}
      </button>
      <PhoenixFooter
        fileName="synthetic.bin"
        sourceBytes={source}
        inventory={opened}
        entries={queue.entries}
        analysis={queue.analysis}
        appliedFingerprint={queue.appliedFingerprint}
        appliedItems={queue.appliedItems}
        onToggleEnabled={queue.toggleEnabled}
        onRemove={queue.remove}
        onMove={queue.move}
        onClear={queue.clear}
        onApply={queue.apply}
        onClose={vi.fn()}
      />
    </MantineProvider>
  );
}
function pending() {
  let resolve!: (value: PhoenixFirmwareBuildResult) => void;
  const promise = new Promise<PhoenixFirmwareBuildResult>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function apply() {
  fireEvent.click(screen.getByRole("button", { name: "Stage Show" }));
  fireEvent.click(screen.getByRole("button", { name: "Change queue (1)" }));
  fireEvent.click(await screen.findByRole("button", { name: "Apply selected" }));
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
}
function downloadedBytes(blob: Blob) {
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => {
      reject(new Error("Could not read synthetic download."));
    };
    reader.onload = () => {
      if (!(reader.result instanceof ArrayBuffer)) {
        reject(new Error("Unexpected download result."));
        return;
      }
      resolve(new Uint8Array(reader.result));
    };
    reader.readAsArrayBuffer(blob);
  });
}
describe("Phoenix verified output (synthetic UI integration)", () => {
  beforeEach(() => {
    vi.mocked(rebuildPhoenixFirmware).mockReset();
    vi.mocked(saveAs).mockReset();
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
      },
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });
  it("checks without downloading, reports fit, retains results during navigation and downloads exact bytes once", async () => {
    vi.mocked(rebuildPhoenixFirmware).mockResolvedValue(output);
    render(<Workspace />);
    expect(
      screen.getByRole("button", { name: "Check firmware output" }),
    ).toBeDisabled();
    await apply();
    expect(
      screen.getByRole("button", { name: "Modified firmware image" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Check firmware output" }));
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Modified firmware image" }),
      ).toBeEnabled();
    });
    expect(saveAs).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Navigate 0" }));
    expect(
      screen.getByRole("button", { name: "Modified firmware image" }),
    ).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Output details" }));
    expect(
      await screen.findByText(/LH5 payload: 1 \/ 2 bytes; 1 bytes remaining/),
    ).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Modified firmware image" }));
    expect(rebuildPhoenixFirmware).toHaveBeenCalledTimes(1);
    expect(vi.mocked(saveAs).mock.calls[0][1]).toBe("synthetic-modified.bin");
    const blob = vi.mocked(saveAs).mock.calls[0][0];
    if (!(blob instanceof Blob)) throw new Error("Expected a binary download.");
    expect(await downloadedBytes(blob)).toEqual(output.image);
  });
  it.each(["queue", "source"] as const)(
    "rejects late completion after changing %s",
    async (change) => {
      const task = pending();
      vi.mocked(rebuildPhoenixFirmware).mockReturnValue(task.promise);
      render(<Workspace />);
      await apply();
      fireEvent.click(screen.getByRole("button", { name: "Check firmware output" }));
      if (change === "source")
        fireEvent.click(screen.getByRole("button", { name: "Reload source" }));
      else {
        fireEvent.click(screen.getByRole("button", { name: "Change queue (1)" }));
        fireEvent.click(await screen.findByRole("button", { name: "Clear queue" }));
        fireEvent.click(screen.getByRole("button", { name: "Close" }));
      }
      await act(async () => {
        task.resolve(output);
        await task.promise;
      });
      expect(saveAs).not.toHaveBeenCalled();
      expect(
        screen.getByRole("button", { name: "Modified firmware image" }),
      ).toBeDisabled();
      expect(screen.getByRole("button", { name: "Output details" })).toBeDisabled();
    },
  );
  it("keeps allocation failure blocked and allows a fresh successful check", async () => {
    vi.mocked(rebuildPhoenixFirmware)
      .mockRejectedValueOnce(new Error("LH5 payload exceeds allocation."))
      .mockResolvedValueOnce(output);
    render(<Workspace />);
    await apply();
    fireEvent.click(screen.getByRole("button", { name: "Check firmware output" }));
    expect(
      await screen.findByText("LH5 payload exceeds allocation."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Modified firmware image" }),
    ).toBeDisabled();
    expect(saveAs).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Check firmware output" }));
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Modified firmware image" }),
      ).toBeEnabled();
    });
    expect(
      screen.queryByText("LH5 payload exceeds allocation."),
    ).not.toBeInTheDocument();
    expect(saveAs).not.toHaveBeenCalled();
  });
  it("requires a fresh check after reordering an already verified Phoenix plan", async () => {
    vi.mocked(rebuildPhoenixFirmware).mockResolvedValue({
      ...output,
      verifiedItemCount: 2,
    });
    render(<Workspace />);
    fireEvent.click(screen.getByRole("button", { name: "Stage Show" }));
    fireEvent.click(screen.getByRole("button", { name: "Stage second Show" }));
    fireEvent.click(screen.getByRole("button", { name: "Change queue (2)" }));
    fireEvent.click(await screen.findByRole("button", { name: "Apply selected" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Check firmware output" }));
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Modified firmware image" }),
      ).toBeEnabled();
    });
    fireEvent.click(screen.getByRole("button", { name: "Change queue (2)" }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Move Second option earlier in change queue",
      }),
    );
    expect(screen.getByRole("button", { name: "Apply selected" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Apply selected" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(
      screen.getByRole("button", { name: "Modified firmware image" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Output details" })).toBeDisabled();
    expect(saveAs).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Check firmware output" }));
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Modified firmware image" }),
      ).toBeEnabled();
    });
    expect(rebuildPhoenixFirmware).toHaveBeenCalledTimes(2);
    expect(
      vi.mocked(rebuildPhoenixFirmware).mock.calls[1][2].map((item) => item.offset),
    ).toEqual([secondItem.offset, item.offset]);
  });
});
