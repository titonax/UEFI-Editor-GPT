import { render, screen, cleanup } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AmiFirmwareBuildResult } from "../scripts/amiFirmwareRebuilder";
import FirmwareOutputReport from "./FirmwareOutputReport";

const result: AmiFirmwareBuildResult = {
  image: new Uint8Array(256),
  fileName: "modified.bin",
  changeLog: "changes",
  containerKind: "intel-spi",
  replacedArtifacts: ["setup-hii"],
  changedByteCount: 5,
  changedStart: 80,
  changedEnd: 100,
  spaceReport: {
    biosStart: 64,
    biosEnd: 256,
    preservedOutsideBiosBytes: 64,
    affectedRanges: [{ start: 80, end: 128 }],
    compressedSections: [
      {
        parentBufferId: 3,
        sectionStart: 32,
        compression: "standard",
        originalPackedBytes: 30,
        rebuiltPackedBytes: 30,
        verifiedCapacityBytes: 30,
        remainingBytes: 0,
        capacityBasis: "original-payload",
      },
      {
        parentBufferId: 0,
        sectionStart: 88,
        compression: "lzma",
        originalPackedBytes: 35,
        rebuiltPackedBytes: 25,
        verifiedCapacityBytes: 40,
        remainingBytes: 15,
        capacityBasis: "verified-terminal-padding",
      },
    ],
  },
};
describe("verified output report (synthetic presentation)", () => {
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
  it("distinguishes original capacity from verified padding and names buffer-relative offsets", () => {
    render(
      <MantineProvider>
        <FirmwareOutputReport result={result} opened onClose={vi.fn()} />
      </MantineProvider>,
    );
    expect(
      screen.getByText(/64 bytes outside BIOS preserved exactly/),
    ).toBeInTheDocument();
    expect(screen.getByText("0x20 / 3")).toBeInTheDocument();
    expect(screen.getByText("30 (original payload only)")).toBeInTheDocument();
    expect(screen.getByText("40 (terminal padding verified)")).toBeInTheDocument();
    expect(screen.getByText(/not global free space/)).toBeInTheDocument();
  });
  it("reports the absence of rebuilt compressed sections", () => {
    render(
      <MantineProvider>
        <FirmwareOutputReport
          result={{
            ...result,
            spaceReport: { ...result.spaceReport, compressedSections: [] },
          }}
          opened
          onClose={vi.fn()}
        />
      </MantineProvider>,
    );
    expect(
      screen.getByText("No compressed sections required rebuilding."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
