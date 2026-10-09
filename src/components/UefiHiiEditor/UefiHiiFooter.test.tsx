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
import { condition, firmwareData } from "../../test/fixtures";
import { useDataChangeQueue } from "../ChangeQueue/useDataChangeQueue";
import {
  buildUefiHiiFirmwareImage,
  type UefiHiiFirmwareBuildResult,
} from "../scripts/uefiHiiFirmwareRebuilder";
import type { UefiHiiWorkspace } from "../scripts/uefiHiiWorkspace";
import UefiHiiFooter from "./UefiHiiFooter";

// Exercise the actual queue, cache lifecycle and report. Binary reconstruction
// has separate synthetic engine tests and exact real P53 acceptance.
vi.mock("../scripts/uefiHiiFirmwareRebuilder", () => ({
  buildUefiHiiFirmwareImage: vi.fn(),
}));
vi.mock("file-saver", () => ({ saveAs: vi.fn() }));

const output: UefiHiiFirmwareBuildResult = {
  image: Uint8Array.of(10, 20, 30),
  containerKind: "intel-spi",
  modifiedModuleIds: ["setup"],
  verifiedModules: [
    {
      moduleId: "setup",
      name: "Setup",
      fileGuid: "setup-guid",
      physicalCopies: [
        { bufferId: 2, fileStart: 0x40 },
        { bufferId: 4, fileStart: 0x40 },
      ],
    },
  ],
  replacedArtifacts: ["setup-hii"],
  changedByteCount: 2,
  changedStart: 1,
  changedEnd: 3,
  spaceReport: {
    biosStart: 1,
    biosEnd: 3,
    preservedOutsideBiosBytes: 1,
    affectedRanges: [{ start: 1, end: 3 }],
    compressedSections: [2, 4].map((buffer) => ({
      parentBufferId: 0,
      sectionStart: buffer,
      compression: "lzma",
      originalPackedBytes: 30,
      rebuiltPackedBytes: 20,
      verifiedCapacityBytes: 30,
      remainingBytes: 10,
      capacityBasis: "original-payload",
    })),
  },
};

function Workspace({ mixed = false }: { mixed?: boolean }) {
  const [base] = React.useState(() =>
    firmwareData({
      firmwareFamily: "uefi-hii",
      suppressions: [
        condition(),
        condition({ offset: "0x10", start: "0x10", end: "0x12" }),
      ],
    }),
  );
  const queue = useDataChangeQueue(base);
  const [sourceImage, setSourceImage] = React.useState(() => Uint8Array.of(1, 2, 3));
  const [workspace, setWorkspace] = React.useState<UefiHiiWorkspace>(() => ({
    data: base,
    modules: mixed
      ? [
          {
            id: "mixed",
            name: "SetupCarrier",
            fileGuid: "fixture",
            formSetGuids: [],
            formCount: 1,
            referenceCount: 1,
            mirroredBufferIds: [],
            sourceStart: 0,
            sourceEnd: 2,
            nestedPayloadRanges: [{ offset: 1, end: 2 }],
          },
        ]
      : [],
    sourceBytes: Uint8Array.of(4, 5),
    warnings: [],
  }));
  return (
    <MantineProvider env="test">
      <button
        onClick={() => {
          queue.enqueueData((draft) => {
            draft.suppressions[0].active = false;
          });
        }}
      >
        Show first
      </button>
      <button
        onClick={() => {
          queue.enqueueData((draft) => {
            draft.suppressions[1].active = false;
          });
        }}
      >
        Show second
      </button>
      <button
        onClick={() => {
          queue.apply();
        }}
      >
        Apply queue
      </button>
      <button
        onClick={() => {
          queue.clear();
        }}
      >
        Clear queue
      </button>
      <button
        onClick={() => {
          queue.remove(queue.entries[0].id);
        }}
      >
        Remove first
      </button>
      <button
        onClick={() => {
          queue.toggleEnabled(queue.entries[0].id, false);
        }}
      >
        Disable first
      </button>
      <button
        onClick={() => {
          queue.move(queue.entries[1].id, -1);
        }}
      >
        Reorder queue
      </button>
      <button
        onClick={() => {
          setSourceImage(Uint8Array.of(1, 2, 3));
        }}
      >
        Reload source
      </button>
      <button
        onClick={() => {
          setWorkspace({ ...workspace });
        }}
      >
        Replace workspace
      </button>
      <UefiHiiFooter
        fileName="synthetic.rom"
        sourceImage={sourceImage}
        moduleCount={1}
        warningCount={0}
        data={queue.previewData}
        appliedData={queue.appliedData}
        changeQueue={queue}
        workspace={workspace}
        onClose={vi.fn()}
      />
    </MantineProvider>
  );
}

function click(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
}
function apply() {
  click("Show first");
  click("Apply queue");
}
async function check() {
  click("Check firmware output");
  await waitFor(() => {
    expect(
      screen.getByRole("button", { name: "Modified firmware image" }),
    ).toBeEnabled();
  });
}
function pending() {
  let resolve!: (value: UefiHiiFirmwareBuildResult) => void;
  const promise = new Promise<UefiHiiFirmwareBuildResult>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function readBlob(blob: Blob) {
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => {
      reject(new Error("Cannot read synthetic download."));
    };
    reader.onload = () => {
      if (!(reader.result instanceof ArrayBuffer)) {
        reject(new Error("Invalid blob."));
        return;
      }
      resolve(new Uint8Array(reader.result));
    };
    reader.readAsArrayBuffer(blob);
  });
}

describe("generic HII complete-image frontend (synthetic orchestration)", () => {
  beforeEach(() => {
    vi.mocked(buildUefiHiiFirmwareImage).mockReset().mockResolvedValue(output);
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

  it("routes mixed workspaces through verified image output and disables separate module export", async () => {
    render(<Workspace mixed />);
    click("Show first");
    click("Apply queue");
    expect(screen.getByRole("button", { name: "Modified HII modules" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Modified HII modules" }),
    ).toHaveAttribute("title", expect.stringContaining("complete-image download"));
    click("Check firmware output");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Modified firmware image" }),
      ).toBeEnabled(),
    );
    expect(saveAs).not.toHaveBeenCalled();
    click("Modified firmware image");
    expect(saveAs).toHaveBeenCalledOnce();
  });

  it("requires Apply and verification, reports both copies, and explicitly downloads exact cached bytes", async () => {
    const task = pending();
    vi.mocked(buildUefiHiiFirmwareImage).mockReturnValue(task.promise);
    render(<Workspace />);
    expect(
      screen.getByRole("button", { name: "Check firmware output" }),
    ).toBeDisabled();
    click("Show first");
    expect(
      screen.getByRole("button", { name: "Check firmware output" }),
    ).toBeDisabled();
    click("Apply queue");
    click("Check firmware output");
    expect(
      screen.getByRole("button", { name: "Building and verifying…" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Modified firmware image" }),
    ).toBeDisabled();
    await act(async () => {
      task.resolve(output);
      await task.promise;
    });
    expect(saveAs).not.toHaveBeenCalled();
    click("Output details");
    expect(
      await screen.findByText(/2 physical copy\/copies verified/),
    ).toHaveTextContent("0x40 / buffer 2, 0x40 / buffer 4");
    expect(
      screen.getByText(/1 bytes outside BIOS preserved exactly/),
    ).toBeInTheDocument();
    expect(screen.getAllByText("10")).toHaveLength(2);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    click("Modified firmware image");
    expect(buildUefiHiiFirmwareImage).toHaveBeenCalledTimes(1);
    const [data, workspace, image] = vi.mocked(buildUefiHiiFirmwareImage).mock.calls[0];
    expect(data.suppressions[0].active).toBe(false);
    expect(workspace.sourceBytes).toEqual(Uint8Array.of(4, 5));
    expect(image).toEqual(Uint8Array.of(1, 2, 3));
    expect(saveAs).toHaveBeenCalledOnce();
    const [blob, name] = vi.mocked(saveAs).mock.calls[0];
    expect(name).toBe("synthetic-modified.bin");
    if (!(blob instanceof Blob)) throw new Error("Expected a blob.");
    expect(await readBlob(blob)).toEqual(output.image);
  });

  it("keeps unsupported/allocation failures blocked and allows retry", async () => {
    vi.mocked(buildUefiHiiFirmwareImage).mockRejectedValueOnce(
      new Error("Unsupported compression or allocation growth."),
    );
    render(<Workspace />);
    apply();
    click("Check firmware output");
    expect(
      await screen.findByText(/Output check failed: Unsupported compression/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Modified firmware image" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Output details" })).toBeDisabled();
    await check();
    expect(saveAs).not.toHaveBeenCalled();
  });

  it.each([
    "Clear queue",
    "Remove first",
    "Disable first",
    "Show second",
    "Reorder queue",
    "Reload source",
    "Replace workspace",
  ])("invalidates ready output after %s", async (action) => {
    render(<Workspace />);
    apply();
    if (action === "Reorder queue") {
      click("Show second");
      click("Apply queue");
    }
    await check();
    click("Output details");
    await screen.findByRole("dialog");
    click(action);
    expect(
      screen.getByRole("button", { name: "Modified firmware image" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Output details" })).toBeDisabled();
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    click("Apply queue");
    expect(
      screen.getByRole("button", { name: "Modified firmware image" }),
    ).toBeDisabled();
    expect(saveAs).not.toHaveBeenCalled();
  });

  it.each(["Reload source", "Show second"])(
    "discards a pending completion after %s",
    async (action) => {
      const task = pending();
      vi.mocked(buildUefiHiiFirmwareImage).mockReturnValue(task.promise);
      render(<Workspace />);
      apply();
      click("Check firmware output");
      click(action);
      await act(async () => {
        task.resolve(output);
        await task.promise;
      });
      expect(
        screen.getByRole("button", { name: "Modified firmware image" }),
      ).toBeDisabled();
      expect(saveAs).not.toHaveBeenCalled();
    },
  );
});
