import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BiosImageUpload from "./BiosImageUpload";
import type { PopulatedFiles } from "../firmwareFiles";

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
  beforeEach(() => {
    extractAmiFirmwareBytes.mockReset();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
      },
    );
  });

  it("shows Phoenix UEFI module evidence without attempting AMI Setup extraction", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
    const image = validFirmwareVolumeImage();
    image.fill(0, 0x60, 0x6d);
    image.set(new TextEncoder().encode("RSDS"), 0x78);
    image.set(
      new TextEncoder().encode("C:\\Build\\Phoenix\\SecCore\\Sec\\SecCore.pdb\0"),
      0x90,
    );
    const { container } = render(
      <MantineProvider>
        <BiosImageUpload
          onExtracted={vi
            .fn<(files: PopulatedFiles) => Promise<void>>()
            .mockResolvedValue(undefined)}
        />
      </MantineProvider>,
    );
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("Expected the firmware file input.");
    const file = new File([image], "phoenix.rom");
    Object.defineProperty(file, "arrayBuffer", {
      value: () => Promise.resolve(image.slice().buffer),
    });
    fireEvent.change(input, { target: { files: [file] } });

    expect(
      await screen.findByText(/Phoenix SecCore and 0 other module/),
    ).toBeInTheDocument();
    expect(extractAmiFirmwareBytes).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Start HII analysis" })).toBeDisabled();
  });

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
    const sourceImage = validFirmwareVolumeImage();
    extractAmiFirmwareBytes.mockResolvedValueOnce({
      hii,
      ifrText: "verbose IFR",
      amitse: new Uint8Array([1]),
      setupData,
      formPackageCount: 1,
      extractionDepth: 2,
      artifactSets: [
        {
          id: "buffer-0-fv-0-ffs-28",
          label: "Firmware context 1 · layer 2 · buffer 0 · FV 0x0",
          coherence: "same-firmware-volume",
          setupFile: {
            bufferId: 0,
            guid: "899407D7-99FE-43D8-9A21-79EC328CAC21",
            volumeStart: 0,
            volumeEnd: 0x100,
            fileStart: 0x28,
            bodyStart: 0x40,
            end: 0x100,
            headerSize: 24,
          },
          warnings: [],
        },
      ],
      selectedArtifactSetId: "buffer-0-fv-0-ffs-28",
      provenance: {
        rootBufferId: 0,
        sourceSize: sourceImage.length,
        buffers: [{ id: 0, bytes: sourceImage, depth: 0 }],
        artifacts: [
          {
            kind: "setup-hii",
            bufferId: 0,
            payloadStart: 0x40,
            payloadEnd: 0x40 + hii.length,
            sourceFile: {
              bufferId: 0,
              guid: "899407D7-99FE-43D8-9A21-79EC328CAC21",
              volumeStart: 0,
              volumeEnd: 0x100,
              fileStart: 0x28,
              bodyStart: 0x40,
              end: 0x100,
              headerSize: 24,
            },
          },
        ],
      },
    });
    const onExtracted = vi
      .fn<(files: PopulatedFiles) => Promise<void>>()
      .mockResolvedValue(undefined);
    const { container } = render(
      <MantineProvider>
        <BiosImageUpload onExtracted={onExtracted} />
      </MantineProvider>,
    );
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("Expected the firmware file input.");
    expect(input).not.toHaveAttribute("accept");

    const image = sourceImage;
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
    expect(screen.getByText("Reconstruction trace")).toBeInTheDocument();
    expect(
      screen.getByText("Full-image reconstruction — trace captured"),
    ).toBeInTheDocument();
    expect(extractAmiFirmwareBytes).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Start HII analysis" }));
    await waitFor(() => {
      expect(onExtracted).toHaveBeenCalledOnce();
    });
    expect(onExtracted.mock.calls[0][0].firmwareSource?.fileName).toBe("board.F13d");
    expect(extractAmiFirmwareBytes).toHaveBeenCalledOnce();
  });

  it("requires an explicit slot choice when repeated Setup contexts exist", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
    const hii = unifiedFormsPackage();
    const sourceImage = validFirmwareVolumeImage();
    const setupFile = {
      bufferId: 0,
      guid: "899407D7-99FE-43D8-9A21-79EC328CAC21",
      volumeStart: 0,
      volumeEnd: 0x100,
      fileStart: 0x28,
      bodyStart: 0x40,
      end: 0x100,
      headerSize: 24,
    };
    extractAmiFirmwareBytes.mockResolvedValueOnce({
      hii,
      ifrText: "verbose IFR",
      formPackageCount: 1,
      extractionDepth: 2,
      artifactSets: [
        {
          id: "slot-1",
          label: "Firmware context 1 · layer 2 · buffer 4 · FV 0x0",
          coherence: "same-firmware-volume",
          setupFile,
          warnings: [],
        },
        {
          id: "slot-2",
          label: "Firmware context 2 · layer 2 · buffer 9 · FV 0x0",
          coherence: "same-firmware-volume",
          setupFile: { ...setupFile, bufferId: 9 },
          warnings: [],
        },
      ],
      selectedArtifactSetId: "slot-1",
      provenance: {
        rootBufferId: 0,
        sourceSize: sourceImage.length,
        buffers: [{ id: 0, bytes: sourceImage, depth: 0 }],
        artifacts: [
          {
            kind: "setup-hii",
            bufferId: 0,
            payloadStart: 0x40,
            payloadEnd: 0x40 + hii.length,
            sourceFile: setupFile,
          },
        ],
      },
    });
    const onExtracted = vi
      .fn<(files: PopulatedFiles) => Promise<void>>()
      .mockResolvedValue(undefined);
    const { container } = render(
      <MantineProvider>
        <BiosImageUpload onExtracted={onExtracted} />
      </MantineProvider>,
    );
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("Expected the firmware file input.");
    const file = new File([sourceImage], "dual-slot.bin");
    Object.defineProperty(file, "arrayBuffer", {
      value: () => Promise.resolve(sourceImage.slice().buffer),
    });
    fireEvent.change(input, { target: { files: [file] } });

    expect(
      await screen.findByText("Multiple firmware contexts detected"),
    ).toBeInTheDocument();
    const start = screen.getByText("Start HII analysis").closest("button");
    if (!start) throw new Error("Expected the Start HII analysis button.");
    expect(start).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Firmware context / slot"), {
      target: { value: "slot-1" },
    });
    await waitFor(() => expect(start).toBeEnabled());
    expect(extractAmiFirmwareBytes).toHaveBeenCalledOnce();
  });
});
