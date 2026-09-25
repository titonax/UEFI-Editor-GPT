import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PhoenixSetupItem } from "../scripts/phoenixSetupTable";
import PhoenixBehaviorDialog from "./PhoenixBehaviorDialog";

const analyzePhoenixSetupCallback = vi.hoisted(() => vi.fn());

vi.mock("../scripts/behavior/phoenixCallbackAnalysis", () => ({
  analyzePhoenixSetupCallback,
}));

const item: PhoenixSetupItem = {
  type: "generic-text",
  offset: 0x200,
  length: 12,
  prompt: "Intel",
  help: null,
  options: [],
  visibilityPatch: {
    callbackOffset: 0x80,
    hidePatchOffset: 0x94,
    hiddenImmediate: 0x13,
  },
  rawBytes: new Uint8Array(12),
};

describe("Phoenix callback behavior dialog", () => {
  beforeEach(() => {
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
    analyzePhoenixSetupCallback.mockResolvedValue({
      status: "analyzed",
      trace: {
        architecture: "x86-16",
        entry: 0x80,
        instructions: [
          {
            address: 0x80,
            size: 2,
            bytes: Uint8Array.from([0x74, 0x04]),
            mnemonic: "je",
            operands: "0x86",
          },
          {
            address: 0x82,
            size: 3,
            bytes: Uint8Array.from([0xb8, 0x13, 0x00]),
            mnemonic: "mov",
            operands: "ax, 0x13",
          },
          {
            address: 0x85,
            size: 1,
            bytes: Uint8Array.from([0xc3]),
            mnemonic: "ret",
            operands: "",
          },
          {
            address: 0x86,
            size: 2,
            bytes: Uint8Array.from([0x31, 0xc0]),
            mnemonic: "xor",
            operands: "ax, ax",
          },
          {
            address: 0x88,
            size: 1,
            bytes: Uint8Array.from([0xc3]),
            mnemonic: "ret",
            operands: "",
          },
        ],
        edges: [
          { from: 0x80, to: 0x86, kind: "branch" },
          { from: 0x80, to: 0x82, kind: "fallthrough" },
          { from: 0x82, to: 0x85, kind: "fallthrough" },
          { from: 0x86, to: 0x88, kind: "fallthrough" },
        ],
        calls: [],
        returns: [
          { address: 0x85, ax: 0x13 },
          { address: 0x88, ax: 0 },
        ],
        status: "complete",
        limitations: [],
      },
    });
  });

  it("runs on demand and exposes paths and return outcomes", async () => {
    render(
      <MantineProvider>
        <PhoenixBehaviorDialog templat={new Uint8Array(256)} item={item} />
      </MantineProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Trace callback" }));

    await waitFor(() => {
      expect(analyzePhoenixSetupCallback).toHaveBeenCalledOnce();
    });
    expect(screen.getByText("Complete static trace")).toBeInTheDocument();
    expect(screen.getByText("AX=0x0013")).toBeInTheDocument();
    expect(screen.getByText("AX=0x0000")).toBeInTheDocument();
    expect(screen.getByText(/branch → 0x0086/)).toBeInTheDocument();
    expect(screen.getByText(/fallthrough → 0x0082/)).toBeInTheDocument();
  });
});
