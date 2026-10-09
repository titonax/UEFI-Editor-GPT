import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { firmwareData, form } from "../../test/fixtures";
import UefiHiiRootsTable from "./UefiHiiRootsTable";

it("shows all FormSet entries as read-only evidence and opens only a unique parsed form", () => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
  const setCurrentFormIndex = vi.fn();
  const data = firmwareData({
    firmwareFamily: "uefi-hii",
    menu: [],
    formSetRoots: [
      {
        name: "Setup",
        formId: "0x1",
        formSetGuid: "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA",
        offset: null,
      },
      { name: "Missing", formId: "0x2", offset: null },
    ],
    forms: [form({ sourceModuleName: "SetupDxe" })],
  });
  render(
    <MantineProvider>
      <UefiHiiRootsTable data={data} setCurrentFormIndex={setCurrentFormIndex} />
    </MantineProvider>,
  );
  expect(screen.getAllByText("Unproven")).toHaveLength(2);
  expect(screen.getByText("No incoming IFR Ref")).toBeInTheDocument();
  expect(screen.getByText("Entry form missing")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Missing · 0x2" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Setup · 0x1" }));
  expect(setCurrentFormIndex).toHaveBeenCalledWith(0);
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /Hide|Show|Move/ }),
  ).not.toBeInTheDocument();
});
