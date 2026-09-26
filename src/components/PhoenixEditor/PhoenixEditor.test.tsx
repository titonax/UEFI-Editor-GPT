import { fireEvent, render, screen } from "@testing-library/react";
import { AppShell, MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import type { PhoenixSetupMenu } from "../scripts/phoenixSetupTable";
import {
  analyzeChangeQueue,
  setChangeQueueEntryEnabled,
  toggleChangeQueueEntry,
  type ChangeQueueEntry,
} from "../scripts/changeQueue";
import {
  phoenixShowChange,
  phoenixTemplatBufferId,
  type PhoenixVisibilityPayload,
} from "../scripts/phoenixChangeQueue";
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
  const [queue, setQueue] = React.useState<
    ChangeQueueEntry<PhoenixVisibilityPayload>[]
  >([]);
  const [appliedFingerprint, setAppliedFingerprint] = React.useState<string | null>(
    null,
  );
  const templat = new Uint8Array(0x400);
  templat[0x321] = 0x13;
  const analysis = analyzeChangeQueue(queue, {
    [phoenixTemplatBufferId]: templat,
  });
  const isApplied = analysis.canApply && appliedFingerprint === analysis.fingerprint;
  const items = menu.sections.flatMap((section) => section.items);
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
          queueEntries={queue}
          appliedFingerprint={appliedFingerprint}
          currentFingerprint={analysis.fingerprint}
          onToggleQueuedVisibility={(item) => {
            setQueue((currentQueue) =>
              toggleChangeQueueEntry(currentQueue, phoenixShowChange(item)),
            );
            setAppliedFingerprint(null);
          }}
        />
      </AppShell.Main>
      <AppShell.Footer>
        <PhoenixFooter
          templat={templat}
          entries={queue}
          analysis={analysis}
          appliedFingerprint={appliedFingerprint}
          appliedItems={
            isApplied
              ? analysis.selectedEntries.flatMap((entry) => {
                  const item = items.find(
                    (candidate) => candidate.offset === entry.payload.itemOffset,
                  );
                  return item ? [item] : [];
                })
              : []
          }
          onToggleEnabled={(id, enabled) => {
            setQueue((currentQueue) =>
              setChangeQueueEntryEnabled(currentQueue, id, enabled),
            );
            setAppliedFingerprint(null);
          }}
          onRemove={(id) => {
            setQueue((currentQueue) => currentQueue.filter((entry) => entry.id !== id));
            setAppliedFingerprint(null);
          }}
          onClear={() => {
            setQueue([]);
            setAppliedFingerprint(null);
          }}
          onApply={() => {
            setAppliedFingerprint(analysis.fingerprint);
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

  it("uses the Aptio-style shell and navigates from the tree to screen details", async () => {
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
      screen.getByRole("button", { name: "Queue Show for Boot mode Phoenix item" }),
    );
    expect(
      screen.getByRole("button", { name: "Remove Boot mode from change queue" }),
    ).toBeEnabled();
    expect(screen.getByText("Queued: Show")).toBeInTheDocument();
    expect(
      screen.getByText("Phoenix Setup editor · 1 queued · 0 applied"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Modified TEMPLAT00.ROM" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Change queue (1)" }));
    expect(await screen.findByText("2 byte(s)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Boot mode" }));
    expect(screen.getByRole("button", { name: "Apply selected" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Boot mode" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply selected" }));
    expect(screen.getByText("Plan applied")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Modified TEMPLAT00.ROM" }),
    ).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByText("Shown · applied plan")).toBeInTheDocument();
    const sataNavigation = screen
      .getAllByRole("button", { name: /SATA Port/ })
      .find((button) => !button.hasAttribute("aria-label"));
    if (!sataNavigation) throw new Error("Expected the SATA Port navigation node.");
    fireEvent.click(sataNavigation);
    expect(screen.getByText("Drive type")).toBeInTheDocument();
    expect(screen.getByText("Verified submenu link")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Change queue (1)" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear queue" }));
    expect(
      screen.getByText("Phoenix Setup editor · 0 queued · 0 applied"),
    ).toBeInTheDocument();
  });
});
