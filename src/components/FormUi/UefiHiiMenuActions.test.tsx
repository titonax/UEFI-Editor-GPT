import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { useImmer } from "use-immer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { firmwareData, form, prompt } from "../../test/fixtures";
import type { MenuTree, MenuTreeNode } from "../Navigation/menuTree";
import UefiHiiMenuActions from "./UefiHiiMenuActions";

const node: MenuTreeNode = {
  key: "ref:0:0",
  label: "Debug Settings",
  formName: "Debug Settings",
  formId: "0x200",
  formIndex: 1,
  children: [],
  status: "visible",
  statusLabel: "Visible",
  reachability: "reachable",
  reachabilityLabel: "Reachable",
  hardwareDependent: false,
  accessDependent: false,
  uiStateDependent: false,
  incomingReferenceCount: 1,
  outgoingReferenceCount: 0,
  parentageLabel: "1 parent",
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

function Harness({ enabled = true }: { enabled?: boolean }) {
  const [data, setData] = useImmer(
    firmwareData({
      firmwareFamily: "uefi-hii",
      forms: [
        form({
          name: "Setup",
          formId: "0x100",
          children: [
            prompt({
              type: "Ref",
              name: "Debug Settings",
              formId: "0x200",
              ifrOffset: "0x10",
            }),
          ],
        }),
        form({ name: "Debug Settings", formId: "0x200" }),
      ],
    }),
  );
  return (
    <MantineProvider>
      <UefiHiiMenuActions
        data={data}
        tree={tree}
        node={node}
        originalSetupSct="000000"
        setData={setData}
        enabled={enabled}
      />
    </MantineProvider>
  );
}

describe("UEFI HII right-pane menu actions", () => {
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

  it("shows the same explicit Hide and Move controls used by the AMI view", () => {
    render(<Harness />);

    expect(
      screen.getByRole("button", { name: "Hide Debug Settings menu" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Move Debug Settings menu" }),
    ).toBeEnabled();
  });

  it("keeps navigation actions disabled when editing is not authorized", () => {
    render(<Harness enabled={false} />);

    expect(
      screen.getByRole("button", { name: "Hide Debug Settings menu" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Move Debug Settings menu" }),
    ).toBeDisabled();
  });
});
