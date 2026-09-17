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
});
