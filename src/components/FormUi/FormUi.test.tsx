import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { useImmer } from "use-immer";
import { describe, expect, it, vi } from "vitest";
import { firmwareData, form } from "../../test/fixtures";
import type { Data } from "../scripts/types";
import FormUi from "./FormUi";

const hiddenGuid = "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA";
const visibleGuid = "BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB";

function rootData() {
  const roots = [
    {
      name: "Advanced",
      formId: "0x402",
      formSetGuid: hiddenGuid,
      offset: null,
      source: "setupdata" as const,
    },
    {
      name: "Main",
      formId: "0x400",
      formSetGuid: visibleGuid,
      offset: null,
      source: "setupdata" as const,
    },
  ];
  return firmwareData({
    menu: roots,
    forms: roots.map((root) =>
      form({
        name: root.name,
        formId: root.formId,
        formSetGuid: root.formSetGuid,
      }),
    ),
    rootVisibility: {
      status: "detected",
      mechanism: "setup-pe32-root-byte-vector",
      confidence: "corroborated",
      reason: "test vector",
      vector: {
        bufferId: 5,
        offset: 0x100,
        length: 2,
        codeReferenceOffset: 0x20,
        pageTableOffset: 0x200,
        countEvidence: "immediate",
      },
      entries: roots.map((root, index) => ({
        rootIndex: index,
        name: root.name,
        formId: root.formId,
        formSetGuid: root.formSetGuid,
        value: index === 0 ? (0 as const) : (1 as const),
        visible: index === 1,
        bufferOffset: 0x100 + index,
      })),
    },
  });
}

function Harness({ initial }: { initial: Data }) {
  const [data, setData] = useImmer(initial);
  return (
    <MantineProvider>
      <FormUi
        data={data}
        setData={setData}
        currentFormIndex={-1}
        setCurrentFormIndex={() => undefined}
      />
    </MantineProvider>
  );
}

describe("root visibility controls", () => {
  it("toggles a desired state while retaining the original BIOS state", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
    render(<Harness initial={rootData()} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Desired root state for Advanced: hidden",
      }),
    );

    expect(
      screen.getByRole("button", {
        name: "Desired root state for Advanced: visible",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("1 pending")).toBeInTheDocument();
    expect(screen.getByText("Pending change")).toBeInTheDocument();
    expect(screen.getByText("Hidden (00)")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reset root changes" }));
    expect(
      screen.getByRole("button", {
        name: "Desired root state for Advanced: hidden",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Pending change")).not.toBeInTheDocument();
  });

  it("separates direct IFR tabs from AMITSE-registered descendants", () => {
    const guid = "7B59104A-C00D-4158-87FF-F04D6396A915";
    const data = firmwareData({
      menu: [
        {
          name: "Setup",
          formId: "0x2711",
          formSetGuid: guid,
          offset: null,
          source: "ifr-hub",
        },
      ],
      forms: [
        form({ name: "Setup", formId: "0x2711", formSetGuid: guid }),
        form({ name: "Main", formId: "0x2714", formSetGuid: guid }),
        form({ name: "Security", formId: "0x2716", formSetGuid: guid }),
      ],
      singleFormSetNavigation: {
        status: "detected",
        mechanism: "single-formset-ifr-hub",
        confidence: "corroborated",
        reason: "The Setup entry is the IFR hub.",
        formSetGuid: guid,
        hubFormId: "0x2711",
        hubName: "Setup",
        pages: [
          {
            name: "Setup",
            formId: "0x2711",
            formSetGuid: guid,
            role: "hub",
            registeredInAmitse: true,
            registrationOffsets: ["0x100"],
            parentFormIds: [],
          },
          {
            name: "Main",
            formId: "0x2714",
            formSetGuid: guid,
            role: "direct-tab",
            registeredInAmitse: true,
            registrationOffsets: ["0x120"],
            ifrReferenceOffset: "0x44953",
            parentFormIds: ["0x2711"],
          },
          {
            name: "Security",
            formId: "0x2716",
            formSetGuid: guid,
            role: "descendant",
            registeredInAmitse: true,
            registrationOffsets: ["0x140"],
            parentFormIds: ["0x2714"],
          },
        ],
      },
    });

    render(<Harness initial={data} />);

    expect(
      screen.getByText("Single-FormSet navigation — IFR hub detected"),
    ).toBeInTheDocument();
    expect(screen.getByText("Current top-level tab")).toBeInTheDocument();
    expect(screen.getByText("Registered descendant")).toBeInTheDocument();
    expect(screen.getAllByText("IFR navigation hub").length).toBeGreaterThan(0);
  });
});
