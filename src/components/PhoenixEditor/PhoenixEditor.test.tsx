import { fireEvent, render, screen } from "@testing-library/react";
import { AppShell, MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import type { PhoenixSetupMenu } from "../scripts/phoenixSetupTable";
import PhoenixFooter from "./PhoenixFooter";
import PhoenixFormUi from "./PhoenixFormUi";
import PhoenixHeader from "./PhoenixHeader";
import PhoenixNavigation from "./PhoenixNavigation";

const menu: PhoenixSetupMenu = {
  source: "root-table",
  sections: [
    {
      offset: 0x120,
      name: "Main",
      parentOffset: null,
      depth: 0,
      placement: "root",
      items: [
        {
          type: "pick-field",
          offset: 0x220,
          length: 20,
          prompt: "Boot mode",
          help: "Select the startup mode",
          options: ["Enabled", "Disabled"],
          visibilityPatch: {
            callbackOffset: 0x300,
            hidePatchOffset: 0x320,
            hiddenImmediate: 0x13,
          },
          submenuOffset: null,
          rawBytes: new Uint8Array(20),
        },
        {
          type: "information",
          offset: 0x240,
          length: 12,
          prompt: "CPU Type",
          help: null,
          options: [],
          visibilityPatch: null,
          submenuOffset: null,
          rawBytes: new Uint8Array(12),
        },
        {
          type: "information",
          offset: 0x250,
          length: 12,
          prompt: "SATA Port",
          help: null,
          options: [],
          visibilityPatch: null,
          submenuOffset: 0x180,
          rawBytes: new Uint8Array(12),
        },
      ],
    },
    {
      offset: 0x180,
      name: "SATA Port",
      parentOffset: 0x120,
      depth: 1,
      placement: "submenu",
      items: [
        {
          type: "information",
          offset: 0x260,
          length: 12,
          prompt: "Drive type",
          help: null,
          options: [],
          visibilityPatch: null,
          submenuOffset: null,
          rawBytes: new Uint8Array(12),
        },
      ],
    },
  ],
};

function Workspace() {
  const [current, setCurrent] = React.useState(-1);
  const [forcedVisibleOffsets, setForcedVisibleOffsets] = React.useState<number[]>([]);
  const templat = new Uint8Array(0x400);
  return (
    <AppShell
      navbar={{ width: 360, breakpoint: 0 }}
      header={{ height: 60 }}
      footer={{ height: 40 }}
    >
      <AppShell.Navbar>
        <PhoenixNavigation
          menu={menu}
          currentSectionIndex={current}
          setCurrentSectionIndex={setCurrent}
        />
      </AppShell.Navbar>
      <AppShell.Header>
        <PhoenixHeader
          fileName="phoenix.bin"
          menu={menu}
          currentSectionIndex={current}
        />
      </AppShell.Header>
      <AppShell.Main>
        <PhoenixFormUi
          menu={menu}
          templat={templat}
          currentSectionIndex={current}
          forcedVisibleOffsets={forcedVisibleOffsets}
          onToggleVisibility={(item) => {
            setForcedVisibleOffsets((offsets) =>
              offsets.includes(item.offset)
                ? offsets.filter((offset) => offset !== item.offset)
                : [...offsets, item.offset],
            );
          }}
        />
      </AppShell.Main>
      <AppShell.Footer>
        <PhoenixFooter
          templat={templat}
          forcedVisibleItems={menu.sections
            .flatMap((section) => section.items)
            .filter((item) => forcedVisibleOffsets.includes(item.offset))}
          onReset={() => {
            setForcedVisibleOffsets([]);
          }}
          onClose={vi.fn()}
        />
      </AppShell.Footer>
    </AppShell>
  );
}

describe("Phoenix full editor workspace", () => {
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
  });

  it("uses the Aptio-style shell and navigates from the tree to screen details", () => {
    render(
      <MantineProvider>
        <Workspace />
      </MantineProvider>,
    );
    expect(screen.getByText("Loaded firmware")).toBeInTheDocument();
    expect(screen.getByText("phoenix.bin")).toBeInTheDocument();
    expect(screen.getByText("BIOS menu tree")).toBeInTheDocument();
    expect(screen.getByText("Top-level menu")).toBeInTheDocument();
    expect(screen.getByText("Verified root/tab table")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Main/ }));
    expect(screen.getByText("Boot mode")).toBeInTheDocument();
    expect(screen.getByText("Enabled · Disabled")).toBeInTheDocument();
    expect(screen.getByText("Information")).toBeInTheDocument();
    expect(screen.getByText("Submenu")).toBeInTheDocument();
    expect(screen.getByText("Registered root screen")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Show Boot mode Phoenix item" }),
    );
    expect(
      screen.getByRole("button", { name: "Hide Boot mode Phoenix item" }),
    ).toBeEnabled();
    expect(screen.getByText("Shown · pending change")).toBeInTheDocument();
    expect(
      screen.getByText("Phoenix Setup editor · 1 staged edit(s)"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Modified TEMPLAT00.ROM" }),
    ).toBeEnabled();
    const sataNavigation = screen
      .getAllByRole("button", { name: /SATA Port/ })
      .find((button) => !button.hasAttribute("aria-label"));
    if (!sataNavigation) throw new Error("Expected the SATA Port navigation node.");
    fireEvent.click(sataNavigation);
    expect(screen.getByText("Drive type")).toBeInTheDocument();
    expect(screen.getByText("Verified submenu link")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset changes" }));
    expect(
      screen.getByText("Phoenix Setup editor · 0 staged edit(s)"),
    ).toBeInTheDocument();
  });
});
