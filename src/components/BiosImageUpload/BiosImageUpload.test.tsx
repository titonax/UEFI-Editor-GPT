import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it, vi } from "vitest";
import BiosImageUpload from "./BiosImageUpload";

const extractAmiFirmwareBytes = vi.hoisted(() => vi.fn());

vi.mock("../scripts/amiFirmwareExtractor", () => ({
  extractAmiFirmwareBytes,
}));

function validFirmwareVolumeImage() {
  const bytes = new Uint8Array(0x180);
  const view = new DataView(bytes.buffer);
  bytes.set(
    [
      0x78, 0xe5, 0x8c, 0x8c, 0x3d, 0x8a, 0x1c, 0x4f, 0x99, 0x35, 0x89, 0x61, 0x85,
      0xc3, 0x2d, 0xd3,
    ],
    0x10,
  );
  view.setBigUint64(0x20, 0x100n, true);
  bytes.set([0x5f, 0x46, 0x56, 0x48], 0x28);
  view.setUint16(0x30, 0x38, true);
  bytes.set(new TextEncoder().encode("AMITSESetup"), 0x60);
  let checksum = 0;
  for (let offset = 0; offset < 0x38; offset += 2) {
    checksum = (checksum + view.getUint16(offset, true)) & 0xffff;
  }
  view.setUint16(0x32, -checksum & 0xffff, true);
  return bytes;
}

function unifiedFormsPackage() {
  const bytes = new Uint8Array(37);
  bytes.set([37, 0, 0, 0x02, 0x0e, 0x97], 0);
  bytes.set(
    [
      0x4a, 0x10, 0x59, 0x7b, 0x0d, 0xc0, 0x58, 0x41, 0x87, 0xff, 0xf0, 0x4d, 0x63,
      0x96, 0xa9, 0x15,
    ],
    6,
  );
  bytes.set([0x01, 0x86, 0x10, 0x27, 0, 0], 27);
  bytes.set([0x29, 0x02, 0x29, 0x02], 33);
  return bytes;
}

function setupDataProfile() {
  const bytes = new Uint8Array(32);
  bytes.set(new TextEncoder().encode("$SPF"), 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(4, 0x200, true);
  view.setUint32(8, 0x210, true);
  return bytes;
}

describe("complete firmware preflight", () => {
  it("deep-scans once, reports $SPF and reuses artifacts for the HII tree", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
    const hii = unifiedFormsPackage();
    const setupData = setupDataProfile();
    extractAmiFirmwareBytes.mockResolvedValueOnce({
      hii,
      ifrText: "verbose IFR",
      amitse: new Uint8Array([1]),
      setupData,
      formPackageCount: 1,
      extractionDepth: 2,
    });
    const onExtracted = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <MantineProvider>
        <BiosImageUpload onExtracted={onExtracted} />
      </MantineProvider>,
    );
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("Expected the firmware file input.");
    expect(input).not.toHaveAttribute("accept");

    const image = validFirmwareVolumeImage();
    const file = new File([image], "board.F13d");
    Object.defineProperty(file, "arrayBuffer", {
      value: () => Promise.resolve(image.slice().buffer),
    });
    fireEvent.change(input, { target: { files: [file] } });

    expect(
      await screen.findByText("AMI Aptio V — probable HII profile"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Found · field \+0x04 0x0200/)).toBeInTheDocument();
    expect(screen.getByText(/2 nested layer/)).toBeInTheDocument();
    expect(extractAmiFirmwareBytes).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Start HII analysis" }));
    await waitFor(() => {
      expect(onExtracted).toHaveBeenCalledOnce();
    });
    expect(extractAmiFirmwareBytes).toHaveBeenCalledOnce();
  });
});
