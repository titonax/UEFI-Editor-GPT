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
import * as scripts from "../scripts/scripts";

// The queue, provenance assessment, Footer and report are real. Mock only the
// expensive builder boundary and download adapter; complete binary acceptance
// is exercised separately by firmware:acceptance on the real Tiano SPI.
vi.mock("../scripts/amiFirmwareRebuilder", () => ({ buildAmiFirmwareImage: vi.fn() }));
vi.mock("file-saver", () => ({ saveAs: vi.fn() }));

const output: AmiFirmwareBuildResult = {
  image: Uint8Array.from({ length: 256 }, (_, index) => [0x10, 0x20, 0x30][index] ?? 0),
  fileName: "verified.bin",
  changeLog: "Unsuppressed 0x0",
  containerKind: "bios-image",
  replacedArtifacts: ["setup-hii"],
  changedByteCount: 3,
  changedStart: 0,
  changedEnd: 3,
  spaceReport: {
    biosStart: 0,
    biosEnd: 256,
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
const ignoreError = () => undefined;
function Workspace({ onError = ignoreError }: { onError?: (message: string) => void }) {
  const [opened, setOpened] = React.useState(true);
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
      {!opened && (
        <button
          onClick={() => {
            setOpened(true);
          }}
        >
          Open source again
        </button>
      )}
      {opened && (
        <Footer
          files={openedFiles}
          data={queue.previewData}
          appliedData={queue.appliedData}
          changeQueue={queue}
          setData={queue.enqueueData}
          currentFormIndex={0}
          onError={onError}
          onClose={() => {
            setOpened(false);
            setFiles(files());
            queue.replaceBase(base);
          }}
        />
      )}
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
  const queueDialog = within(await screen.findByRole("dialog"));
  fireEvent.click(queueDialog.getByRole("button", { name: "Apply selected" }));
  fireEvent.click(queueDialog.getByRole("button", { name: "Close" }));
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
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each(["success", "failure"])(
    "discards a late %sful file read after closing and reopening the source",
    async (outcome) => {
      const onError = vi.fn();
      let resolve!: (text: string) => void;
      let reject!: (reason: Error) => void;
      const read = new Promise<string>((done, fail) => {
        resolve = done;
        reject = fail;
      });
      render(<Workspace onError={onError} />);
      const file = new File([], "data.json");
      Object.defineProperty(file, "text", { value: () => read });
      const input = document.querySelector('input[type="file"][accept=".json"]');
      if (!input) throw new Error("Expected JSON input");
      fireEvent.change(input, { target: { files: [file] } });
      fireEvent.click(screen.getByRole("button", { name: "Load another firmware" }));
      fireEvent.click(screen.getByRole("button", { name: "Open source again" }));
      await act(async () => {
        if (outcome === "success") resolve("malformed old JSON");
        else reject(new Error("old read failed"));
        await read.catch(() => undefined);
      });
      expect(onError).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Change queue (0)" })).toBeEnabled();
      expect(
        screen.getByRole("button", { name: "Modified firmware image" }),
      ).toBeDisabled();
      expect(saveAs).not.toHaveBeenCalled();
    },
  );

  it.each(["matching", "mismatching", "rejected"])(
    "discards a late %s checksum after source replacement but reports current import failures",
    async (outcome) => {
      const onError = vi.fn();
      let resolve!: (checksum: string) => void;
      let reject!: (reason: Error) => void;
      const checksum = new Promise<string>((done, fail) => {
        resolve = done;
        reject = fail;
      });
      const calculate = vi
        .spyOn(scripts, "calculateJsonChecksum")
        .mockReturnValue(checksum);
      render(<Workspace onError={onError} />);
      const file = new File([], "data.json");
      Object.defineProperty(file, "text", {
        value: () => Promise.resolve(JSON.stringify(firmwareData())),
      });
      const importFile = () => {
        const input = document.querySelector('input[type="file"][accept=".json"]');
        if (!input) throw new Error("Expected JSON input");
        fireEvent.change(input, { target: { files: [file] } });
      };
      importFile();
      await waitFor(() => {
        expect(calculate).toHaveBeenCalledTimes(1);
      });
      fireEvent.click(screen.getByRole("button", { name: "Reload source" }));
      await act(async () => {
        if (outcome === "rejected") reject(new Error("Old checksum failed"));
        else resolve(outcome === "matching" ? "offsets" : "wrong checksum");
        await checksum.catch(() => undefined);
      });
      expect(onError).not.toHaveBeenCalled();
      calculate.mockResolvedValue("wrong checksum");
      importFile();
      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith(
          "Wrong data.json version, source hashes, or offset checksum.",
        );
      });
      expect(screen.getByRole("button", { name: "Change queue (0)" })).toBeEnabled();
    },
  );

  it("ignores an older read superseded by a current import in the same source", async () => {
    const onError = vi.fn();
    let resolve!: (text: string) => void;
    const read = new Promise<string>((done) => {
      resolve = done;
    });
    render(<Workspace onError={onError} />);
    const input = document.querySelector('input[type="file"][accept=".json"]');
    if (!input) throw new Error("Expected JSON input");
    const old = new File([], "old.json");
    Object.defineProperty(old, "text", { value: () => read });
    fireEvent.change(input, { target: { files: [old] } });
    const current = new File([], "current.json");
    Object.defineProperty(current, "text", { value: () => Promise.resolve("{") });
    fireEvent.change(input, { target: { files: [current] } });
    await waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(1);
    });
    const currentError: unknown = onError.mock.calls[0][0];
    await act(async () => {
      resolve("old invalid JSON");
      await read;
    });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenLastCalledWith(currentError);
  });

  it("closes a verified workspace and reopens with no output, Apply or history", async () => {
    vi.mocked(buildAmiFirmwareImage).mockResolvedValue(output);
    render(<Workspace />);
    await applyQueue();
    fireEvent.click(screen.getByRole("button", { name: "Check firmware output" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Output details" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Load another firmware" }));
    expect(
      screen.queryByRole("button", { name: "Output details" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open source again" }));
    expect(
      screen.getByRole("button", { name: "Check firmware output" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Modified firmware image" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Change queue (0)" }));
    expect(
      await screen.findByRole("button", { name: "Undo queue change" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Redo queue change" })).toBeDisabled();
    expect(saveAs).not.toHaveBeenCalled();
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
    expect(
      screen.getByText(/3 of 256 bytes changed; 253 unchanged/),
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

  it.each(["resolve", "reject"])(
    "ignores an old build's late %s after closing, reopening and verifying a new source",
    async (outcome) => {
      let resolve!: (result: AmiFirmwareBuildResult) => void;
      let reject!: (reason: Error) => void;
      const old = new Promise<AmiFirmwareBuildResult>((done, fail) => {
        resolve = done;
        reject = fail;
      });
      vi.mocked(buildAmiFirmwareImage)
        .mockReturnValueOnce(old)
        .mockResolvedValue(output);
      render(<Workspace />);
      await applyQueue();
      fireEvent.click(screen.getByRole("button", { name: "Check firmware output" }));
      fireEvent.click(screen.getByRole("button", { name: "Load another firmware" }));
      fireEvent.click(screen.getByRole("button", { name: "Open source again" }));
      await applyQueue();
      fireEvent.click(screen.getByRole("button", { name: "Check firmware output" }));
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Output details" })).toBeEnabled(),
      );
      await act(async () => {
        if (outcome === "resolve") resolve({ ...output, fileName: "old.bin" });
        else reject(new Error("Old source failed"));
        await old.catch(() => undefined);
      });
      expect(screen.getByRole("button", { name: "Output details" })).toBeEnabled();
      expect(screen.queryByText(/Old source failed/)).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Modified firmware image" }));
      expect(vi.mocked(saveAs).mock.calls.map((call) => call[1])).toEqual([
        "verified.bin",
        "changelog.txt",
      ]);
      expect(buildAmiFirmwareImage).toHaveBeenCalledTimes(2);
    },
  );

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
  it("requires a new check after restoring the same AMI queue with undo/redo", async () => {
    vi.mocked(buildAmiFirmwareImage).mockResolvedValue(output);
    render(<Workspace />);
    fireEvent.click(
      screen.getByRole("button", { name: "Unsuppress all Items in this Form" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Change queue (1)" }));
    fireEvent.click(await screen.findByRole("button", { name: "Apply selected" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Check firmware output" }));
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Modified firmware image" }),
      ).toBeEnabled();
    });
    fireEvent.click(screen.getByRole("button", { name: "Change queue (1)" }));
    fireEvent.click(await screen.findByRole("button", { name: "Undo queue change" }));
    fireEvent.click(screen.getByRole("button", { name: "Redo queue change" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply selected" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(
      screen.getByRole("button", { name: "Modified firmware image" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Output details" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Check firmware output" }));
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Modified firmware image" }),
      ).toBeEnabled();
    });
    expect(buildAmiFirmwareImage).toHaveBeenCalledTimes(2);
  });
  it("compares net selected values and permits read-only inspection of a verified plan", async () => {
    vi.mocked(buildAmiFirmwareImage).mockResolvedValue(output);
    render(<Workspace />);
    fireEvent.click(
      screen.getByRole("button", { name: "Unsuppress all Items in this Form" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Change queue (1)" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Original / selected plan (1)" }),
    );
    const row = screen.getByText("suppressions.0.active").closest("tr");
    if (!row) throw new Error("Expected comparison row");
    expect(within(row).getByText("Yes")).toBeInTheDocument();
    expect(within(row).getByText("No")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(
      screen.getByRole("button", { name: "Original / selected plan (0)" }),
    ).toBeInTheDocument();
    expect(screen.getByText("No net changes in the selected plan.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Undo queue change" }));
    expect(
      screen.getByRole("button", { name: "Original / selected plan (1)" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apply selected" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Check firmware output" }));
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Modified firmware image" }),
      ).toBeEnabled();
    });
    fireEvent.click(screen.getByRole("button", { name: "Change queue (1)" }));
    expect(
      await screen.findByRole("button", { name: "Original / selected plan (1)" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(
      screen.getByRole("button", { name: "Modified firmware image" }),
    ).toBeEnabled();
    expect(buildAmiFirmwareImage).toHaveBeenCalledTimes(1);
    expect(saveAs).not.toHaveBeenCalled();
  });
});
