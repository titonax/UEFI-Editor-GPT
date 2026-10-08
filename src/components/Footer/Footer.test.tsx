import React from "react";
import { MantineProvider } from "@mantine/core";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveAs } from "file-saver";
import { condition, firmwareData, form, prompt } from "../../test/fixtures";
import type { PopulatedFiles } from "../firmwareFiles";
import { useDataChangeQueue } from "../ChangeQueue/useDataChangeQueue";
import {
  buildAmiFirmwareImage,
  type AmiFirmwareBuildResult,
} from "../scripts/amiFirmwareRebuilder";
import Footer from "./Footer";

// The queue, provenance assessment, Footer and report are real. Mock only the
// expensive builder boundary and download adapter; complete binary acceptance
// is exercised separately by firmware:acceptance on the real Tiano SPI.
vi.mock("../scripts/amiFirmwareRebuilder", () => ({ buildAmiFirmwareImage: vi.fn() }));
vi.mock("file-saver", () => ({ saveAs: vi.fn() }));

const output: AmiFirmwareBuildResult = {
  image: new Uint8Array([0x10, 0x20, 0x30]),
  fileName: "verified.bin",
  changeLog: "Unsuppressed 0x0",
  containerKind: "bios-image",
  replacedArtifacts: ["setup-hii"],
  changedByteCount: 1,
  changedStart: 1,
  changedEnd: 2,
  spaceReport: {
    biosStart: 0,
    biosEnd: 3,
    preservedOutsideBiosBytes: 0,
    affectedRanges: [{ start: 0, end: 3 }],
    compressedSections: [],
  },
};
function files(): PopulatedFiles {
  const sourceFile = {
    bufferId: 0,
    guid: "899407D7-99FE-43D8-9A21-79EC328CAC21",
    volumeStart: 0,
    volumeEnd: 256,
    fileStart: 32,
    bodyStart: 56,
    end: 128,
    headerSize: 24,
  };
  const container = {
    file: new File([], "synthetic.bin"),
    textContent: "",
    isWrongFile: false,
  };
  return {
    setupSctContainer: container,
    setupTxtContainer: container,
    amitseSctContainer: container,
    setupdataBinContainer: container,
    firmwareSource: {
      fileName: "synthetic.bin",
      artifacts: {
        hii: new Uint8Array(8),
        ifrText: "synthetic",
        formPackageCount: 1,
        extractionDepth: 0,
        selectedArtifactSetId: "synthetic",
        artifactSets: [
          {
            id: "synthetic",
            label: "Synthetic",
            coherence: "setup-only",
            setupFile: sourceFile,
            warnings: [],
          },
        ],
        provenance: {
          rootBufferId: 0,
          sourceSize: 256,
          buffers: [{ id: 0, bytes: new Uint8Array(256), depth: 0 }],
          artifacts: [
            {
              kind: "setup-hii",
              bufferId: 0,
              payloadStart: 64,
              payloadEnd: 72,
              sourceFile,
            },
          ],
        },
      },
    },
  };
}
function Workspace() {
  const [openedFiles, setFiles] = React.useState(files);
  const [base] = React.useState(() =>
    firmwareData({
      suppressions: [condition()],
      forms: [form({ children: [prompt({ suppressIf: ["0x0"], accessLevel: "00" })] })],
    }),
  );
  const queue = useDataChangeQueue(base);
  return (
    <MantineProvider env="test">
      <button
        onClick={() => {
          setFiles(files());
        }}
      >
        Reload source
      </button>
      <Footer
        files={openedFiles}
        data={queue.previewData}
        appliedData={queue.appliedData}
        changeQueue={queue}
        setData={queue.enqueueData}
        currentFormIndex={0}
        onError={vi.fn()}
      />
    </MantineProvider>
  );
}
function pending() {
  let resolve!: (value: AmiFirmwareBuildResult) => void;
  const promise = new Promise<AmiFirmwareBuildResult>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function applyQueue() {
  fireEvent.click(
    screen.getByRole("button", { name: "Unsuppress all Items in this Form" }),
  );
  expect(screen.getByRole("button", { name: "Check firmware output" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Change queue (1)" }));
  fireEvent.click(await screen.findByRole("button", { name: "Apply selected" }));
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
}
function readBlob(blob: Blob) {
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => {
      reject(new Error("Could not read downloaded fixture."));
    };
    reader.onload = () => {
      if (!(reader.result instanceof ArrayBuffer)) {
        reject(new Error("Unexpected blob result."));
        return;
      }
      resolve(new Uint8Array(reader.result));
    };
    reader.readAsArrayBuffer(blob);
  });
}

describe("AMI complete-image user flow (synthetic integration)", () => {
  beforeEach(() => {
    vi.mocked(buildAmiFirmwareImage).mockReset();
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

  it("requires apply and completed verification, then downloads exact cached bytes without rebuilding", async () => {
    const task = pending();
    vi.mocked(buildAmiFirmwareImage).mockReturnValue(task.promise);
    render(<Workspace />);
    expect(
      screen.getByRole("button", { name: "Check firmware output" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Modified firmware image" }),
    ).toBeDisabled();
    await applyQueue();
    fireEvent.click(screen.getByRole("button", { name: "Check firmware output" }));
    expect(
      screen.getByRole("button", { name: "Building and verifying…" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Modified firmware image" }),
    ).toBeDisabled();
    expect(saveAs).not.toHaveBeenCalled();
    await act(async () => {
      task.resolve(output);
      await task.promise;
    });
    expect(saveAs).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Output details" }));
    expect(
      await screen.findByText("No compressed sections required rebuilding."),
    ).toBeInTheDocument();
    // Close the report through Escape, as a user would.
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Modified firmware image" }));
    expect(buildAmiFirmwareImage).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(buildAmiFirmwareImage).mock.calls[0][0].suppressions[0].active,
    ).toBe(false);
    expect(saveAs).toHaveBeenCalledTimes(2);
    expect(vi.mocked(saveAs).mock.calls.map((call) => call[1])).toEqual([
      "verified.bin",
      "changelog.txt",
    ]);
    const downloaded = vi.mocked(saveAs).mock.calls[0][0];
    if (!(downloaded instanceof Blob))
      throw new Error("Firmware download is not a blob.");
    expect(await readBlob(downloaded)).toEqual(output.image);
    const log = vi.mocked(saveAs).mock.calls[1][0];
    if (!(log instanceof Blob)) throw new Error("Change log is not a blob.");
    expect(new TextDecoder().decode(await readBlob(log))).toBe(output.changeLog);
  });

  it("shows allocation failure without downloading and permits a successful retry", async () => {
    vi.mocked(buildAmiFirmwareImage)
      .mockRejectedValueOnce(
        new Error("Compressed section cannot grow beyond its FFS allocation."),
      )
      .mockResolvedValueOnce(output);
    render(<Workspace />);
    await applyQueue();
    fireEvent.click(screen.getByRole("button", { name: "Check firmware output" }));
    expect(
      await screen.findByText(/Output check failed:.*FFS allocation/),
    ).toBeInTheDocument();
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
    expect(saveAs).not.toHaveBeenCalled();
  });

  it("blocks a previously verified download after removing the applied operation", async () => {
    vi.mocked(buildAmiFirmwareImage).mockResolvedValue(output);
    render(<Workspace />);
    await applyQueue();
    fireEvent.click(screen.getByRole("button", { name: "Check firmware output" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Output details" })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole("button", { name: "Change queue (1)" }));
    fireEvent.click(
      await screen.findByRole("button", { name: /Remove .* from change queue/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(
      screen.getByRole("button", { name: "Modified firmware image" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Output details" })).toBeDisabled();
    expect(saveAs).not.toHaveBeenCalled();
  });

  it("ignores completion for a source that was replaced during verification", async () => {
    const task = pending();
    vi.mocked(buildAmiFirmwareImage).mockReturnValue(task.promise);
    render(<Workspace />);
    await applyQueue();
    fireEvent.click(screen.getByRole("button", { name: "Check firmware output" }));
    fireEvent.click(screen.getByRole("button", { name: "Reload source" }));
    await act(async () => {
      task.resolve(output);
      await task.promise;
    });
    expect(
      screen.getByRole("button", { name: "Modified firmware image" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Output details" })).toBeDisabled();
    expect(saveAs).not.toHaveBeenCalled();
  });
  it("invalidates verified output when independent operations are reordered", async () => {
    vi.mocked(buildAmiFirmwareImage).mockResolvedValue(output);
    render(<Workspace />);
    fireEvent.click(
      screen.getByRole("button", { name: "Unsuppress all Items in this Form" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Change all Access Levels in this Form to" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Change queue (2)" }));
    expect(
      await screen.findByRole("button", {
        name: /Move Show .* earlier in change queue/,
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", {
        name: "Move Set access level for Option later in change queue",
      }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Apply selected" }));
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
        name: "Move Set access level for Option earlier in change queue",
      }),
    );
    expect(
      within(screen.getAllByRole("row")[1]).getByText("Set access level for Option"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply selected" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Apply selected" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(
      screen.getByRole("button", { name: "Modified firmware image" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Output details" })).toBeDisabled();
    expect(buildAmiFirmwareImage).toHaveBeenCalledTimes(1);
    expect(saveAs).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Check firmware output" }));
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Modified firmware image" }),
      ).toBeEnabled();
    });
    expect(buildAmiFirmwareImage).toHaveBeenCalledTimes(2);
  });
});
