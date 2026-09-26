import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { useImmer } from "use-immer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { firmwareData, form, prompt } from "../../test/fixtures";
import type { MenuTree, MenuTreeNode } from "../Navigation/menuTree";
import UefiHiiNavigationTable from "./UefiHiiNavigationTable";

const node: MenuTreeNode = {
  key: "root/ref:0:0",
  label: "Debug Settings",
  formName: "Debug Settings",
  formId: "0x200",
  formIndex: 1,
  children: [],
  status: "visible",
  statusLabel: "Visible",
  reachability: "reachable",
  reachabilityLabel: "Reachable through Setup",
  hardwareDependent: false,
  accessDependent: false,
  uiStateDependent: false,
  incomingReferenceCount: 1,
  outgoingReferenceCount: 0,
  parentageLabel: "Setup",
  parentFormIndex: 0,
  referenceChildIndex: 0,
};

const tree: MenuTree = {
  roots: [node],
  profiles: [],
  orphans: [],
  expandableKeys: [],
  firstKeyByFormIndex: new Map([[1, node.key]]),
  signature: "test",
};

function Harness() {
  const [data, setData] = useImmer(
    firmwareData({
      firmwareFamily: "uefi-hii",
      forms: [
        form({
          name: "Setup",
          formId: "0x100",
          sourceModuleName: "SetupUtility",
          children: [
            prompt({
              type: "Ref",
              name: "Debug Settings",
              formId: "0x200",
              ifrOffset: "0x10",
            }),
          ],
        }),
        form({
          name: "Debug Settings",
          formId: "0x200",
          sourceModuleName: "SetupUtility",
        }),
      ],
    }),
  );
  return (
    <MantineProvider>
      <UefiHiiNavigationTable
        data={data}
        tree={tree}
        originalSetupSct="000000"
        setData={setData}
        setCurrentFormIndex={() => undefined}
        enabled
      />
    </MantineProvider>
  );
}

describe("UEFI HII top-level navigation table", () => {
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

  it("lists each editable tree reference with full right-pane controls", () => {
    render(<Harness />);

    expect(screen.getByText("Actions")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Debug Settings" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Hide Debug Settings menu" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Move Debug Settings menu" }),
    ).toBeEnabled();
  });
});
