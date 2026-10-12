import { MantineProvider } from "@mantine/core";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { compareFirmwareImages } from "../scripts/firmwareImageComparison";
import FirmwareImageComparisonView from "./FirmwareImageComparisonView";

beforeEach(() => {
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
it("presents exact whole-image totals and bounded physical samples", () => {
  const comparison = compareFirmwareImages(
    new Uint8Array(40),
    new Uint8Array(40).fill(255),
  );
  render(
    <MantineProvider env="test">
      <FirmwareImageComparisonView comparison={comparison} />
    </MantineProvider>,
  );
  expect(screen.getByText(/40 of 40 bytes changed; 0 unchanged/)).toBeInTheDocument();
  expect(screen.getByText(/Showing 1 of 1 ranges/)).toHaveTextContent(
    "at most 16 bytes",
  );
  const table = screen.getByRole("table", { name: "Complete-image changed bytes" });
  expect(within(table).getByText("0x0 / 0x28")).toBeInTheDocument();
  expect(within(table).getByText(Array(16).fill("FF").join(" "))).toBeInTheDocument();
  expect(screen.getByText(/complete physical image/)).toHaveTextContent(
    "checksum repairs",
  );
});
it("reports identical images without a misleading changed-byte table", () => {
  render(
    <MantineProvider env="test">
      <FirmwareImageComparisonView
        comparison={compareFirmwareImages(Uint8Array.of(1), Uint8Array.of(1))}
      />
    </MantineProvider>,
  );
  expect(screen.getByText(/byte-identical/)).toBeInTheDocument();
  expect(screen.getByText(/0 of 1 bytes changed; 1 unchanged/)).toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});
