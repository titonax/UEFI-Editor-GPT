import React from "react";
import { AppShell, MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "./App";
import { firmwareData } from "./test/fixtures";
import type Footer from "./components/Footer/Footer";
import type BiosImageUpload from "./components/BiosImageUpload/BiosImageUpload";

// Exercise App and the real queue. Extraction, layout and binary output are
// separate boundaries, not real-firmware/browser acceptance in this test.
vi.mock("./components/scripts/scripts", () => ({
  parseData: vi.fn(() => Promise.resolve(firmwareData())),
}));
vi.mock("./components/BiosImageUpload/BiosImageUpload", () => ({
  default: ({ onExtracted }: React.ComponentProps<typeof BiosImageUpload>) => (
    <button
      onClick={() => {
        const container = {
          file: new File([], "synthetic.bin"),
          textContent: "",
          isWrongFile: false,
        };
        void onExtracted({
          setupSctContainer: container,
          setupTxtContainer: container,
          amitseSctContainer: container,
          setupdataBinContainer: container,
        });
      }}
    >
      Select synthetic source
    </button>
  ),
}));
vi.mock("./components/Footer/Footer", () => ({
  default: ({
    onClose,
    onError,
    setData,
    changeQueue,
    currentFormIndex,
  }: React.ComponentProps<typeof Footer>) => (
    <>
      <div>Form index {currentFormIndex}</div>
      <div>
        Entries {changeQueue.entries.length}; undo {String(changeQueue.canUndo)}; redo{" "}
        {String(changeQueue.canRedo)}; applied{" "}
        {String(changeQueue.appliedFingerprint !== null)}
      </div>
      <button
        onClick={() => {
          setData((draft) => {
            draft.forms[0].name = "Changed";
          });
        }}
      >
        Stage
      </button>
      <button onClick={changeQueue.apply}>Apply</button>
      <button
        onClick={() => {
          onError("Previous source error");
          onClose?.();
        }}
      >
        Load another firmware
      </button>
    </>
  ),
}));
vi.mock("./components/Navigation/Navigation", () => ({
  default: ({
    setCurrentFormIndex,
  }: {
    setCurrentFormIndex: (index: number) => void;
  }) => (
    <button
      onClick={() => {
        setCurrentFormIndex(0);
      }}
    >
      Select form
    </button>
  ),
}));
vi.mock("./components/FormUi/FormUi", () => ({ default: () => null }));
vi.mock("./components/Header/Header", () => ({ default: () => null }));
vi.mock("./components/Navigation/NavigationResizer", () => ({ default: () => null }));
vi.mock("./components/CorpusRunner/CorpusRunner", () => ({ default: () => null }));

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("returns AMI to upload and resets source data, selection, queue, Apply, history and errors before reopening", async () => {
  render(
    <MantineProvider env="test">
      <AppShell>
        <App
          navigationWidth={300}
          navigationMinWidth={200}
          navigationMaxWidth={600}
          onNavigationWidthChange={vi.fn()}
          onNavigationWidthReset={vi.fn()}
        />
      </AppShell>
    </MantineProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Select synthetic source" }));
  fireEvent.click(await screen.findByRole("button", { name: "Select form" }));
  expect(screen.getByText("Form index 0")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Stage" }));
  fireEvent.click(screen.getByRole("button", { name: "Apply" }));
  expect(
    screen.getByText("Entries 1; undo true; redo false; applied true"),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Load another firmware" }));
  expect(
    screen.getByRole("button", { name: "Select synthetic source" }),
  ).toBeInTheDocument();
  expect(screen.queryByText("Previous source error")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Stage" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Select synthetic source" }));
  expect(await screen.findByText("Form index -1")).toBeInTheDocument();
  expect(
    screen.getByText("Entries 0; undo false; redo false; applied false"),
  ).toBeInTheDocument();
});
