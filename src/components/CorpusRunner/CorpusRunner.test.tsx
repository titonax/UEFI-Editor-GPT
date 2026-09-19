import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it, vi } from "vitest";
import { createCorpusInputFailure } from "../scripts/corpusReport";
import CorpusRunner from "./CorpusRunner";
import type { CorpusRunnerRequest, CorpusRunnerResponse } from "./protocol";

class FakeWorker {
  onmessage: ((event: MessageEvent<CorpusRunnerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminate = vi.fn();
  declaredBrand: string | undefined;

  postMessage = (message: CorpusRunnerRequest) => {
    if (message.type !== "start") return;
    const file = message.files[0]?.file;
    if (!file) return;
    this.declaredBrand = message.files[0]?.declaredBrand;
    queueMicrotask(() => {
      this.onmessage?.({
        data: {
          type: "progress",
          runId: message.runId,
          fileIndex: 0,
          fileCount: 1,
          fileName: file.name,
          progress: { stage: "preflight", detail: "Inspecting locally" },
        },
      } as MessageEvent<CorpusRunnerResponse>);
      this.onmessage?.({
        data: {
          type: "result",
          runId: message.runId,
          fileIndex: 0,
          fileCount: 1,
          result: createCorpusInputFailure(file, "No valid UEFI volume"),
        },
      } as MessageEvent<CorpusRunnerResponse>);
      this.onmessage?.({
        data: { type: "complete", runId: message.runId },
      } as MessageEvent<CorpusRunnerResponse>);
    });
  };
}

describe("local corpus runner UI", () => {
  it("runs selected files in a worker and exposes metadata-only reports", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
      },
    );
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
    const fakeWorker = new FakeWorker();
    const { container } = render(
      <MantineProvider>
        <CorpusRunner createWorker={() => fakeWorker} />
      </MantineProvider>,
    );
    expect(screen.getByText("Local-only by design")).toBeInTheDocument();
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("Expected the corpus file input.");
    const file = new File([new Uint8Array([1, 2, 3])], "sample.bin");
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText("Manufacturer for sample.bin"), {
      target: { value: "ASUS" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run local corpus analysis" }));

    expect(fakeWorker.declaredBrand).toBe("ASUS");
    expect((await screen.findAllByText("sample.bin")).length).toBeGreaterThan(0);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Export JSON report" })).toBeEnabled(),
    );
    expect(screen.getByText("Corpus analysis complete.")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(fakeWorker.terminate).toHaveBeenCalled();
  });
});
