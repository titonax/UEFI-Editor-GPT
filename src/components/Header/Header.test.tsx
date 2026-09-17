import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Data } from "../scripts/types";
import Header from "./Header";

const data: Data = {
  firmwareFamily: "ami-aptio",
  menu: [],
  forms: [],
  varStores: [],
  suppressions: [],
  version: "0.7.0",
  hashes: {
    setupTxt: "",
    setupSct: "",
    amitseSct: "",
    setupdataBin: "",
    offsetChecksum: "",
  },
};

describe("Header", () => {
  it("shows the loaded firmware name while the menu root is selected", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
    render(
      <MantineProvider>
        <Header
          data={data}
          fileName="ROG-STRIX-Z390-E-GAMING.CAP"
          currentFormIndex={-1}
          setCurrentFormIndex={vi.fn()}
        />
      </MantineProvider>,
    );

    expect(screen.getByText("Loaded firmware")).toBeInTheDocument();
    expect(screen.getByText("ROG-STRIX-Z390-E-GAMING.CAP")).toBeInTheDocument();
  });
});
