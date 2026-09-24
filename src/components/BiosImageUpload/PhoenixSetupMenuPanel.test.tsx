import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PhoenixSetupMenu } from "../scripts/phoenixSetupTable";
import PhoenixSetupMenuPanel from "./PhoenixSetupMenuPanel";

const item = (prompt: string) => ({
  type: "pick-field" as const,
  offset: prompt === "Boot mode" ? 20 : 40,
  length: 20,
  prompt,
  help: "Choose a mode",
  options: ["Enabled", "Disabled"],
  visibilityPatch: null,
  rawBytes: new Uint8Array(20),
});

describe("Phoenix Setup menu view", () => {
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
  it("shows verified tabs with decoded options and allows selecting a tab", () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
      },
    );
    const menu: PhoenixSetupMenu = {
      source: "root-table",
      sections: [
        { offset: 100, name: "Main", items: [item("Boot mode")] },
        { offset: 200, name: "Security", items: [item("Admin lock")] },
      ],
    };
    render(
      <MantineProvider>
        <PhoenixSetupMenuPanel menu={menu} />
      </MantineProvider>,
    );
    expect(screen.getByText("Verified tab table")).toBeInTheDocument();
    expect(screen.getByText("Boot mode")).toBeInTheDocument();
    expect(screen.getByText("Enabled · Disabled")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Security"));
    expect(screen.getByText("Admin lock")).toBeInTheDocument();
    expect(screen.queryByText("Boot mode")).not.toBeInTheDocument();
  });

  it("labels fallback sections as inferred groups", () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
      },
    );
    const menu: PhoenixSetupMenu = {
      source: "contiguous-scan",
      sections: [{ offset: 100, name: null, items: [item("Boot mode")] }],
    };
    render(
      <MantineProvider>
        <PhoenixSetupMenuPanel menu={menu} />
      </MantineProvider>,
    );
    expect(screen.getByText("Inferred item groups")).toBeInTheDocument();
    expect(screen.getByText("Group 1")).toBeInTheDocument();
  });
});
