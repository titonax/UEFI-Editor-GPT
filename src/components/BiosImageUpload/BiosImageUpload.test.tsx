import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BiosImageUpload from "./BiosImageUpload";
import type { PopulatedFiles } from "../firmwareFiles";

const extractAmiFirmwareBytes = vi.hoisted(() => vi.fn());
const discoverUefiHiiModules = vi.hoisted(() => vi.fn());
const buildUefiHiiWorkspace = vi.hoisted(() => vi.fn());

vi.mock("../scripts/amiFirmwareExtractor", () => ({
  extractAmiFirmwareBytes,
}));

vi.mock("../scripts/uefiHiiDiscovery", () => ({
  discoverUefiHiiModules,
}));

vi.mock("../scripts/uefiHiiWorkspace", () => ({
  buildUefiHiiWorkspace,
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

function awardLhaMember(name: string, payload: number[]) {
  const encodedName = new TextEncoder().encode(name);
  const headerSize = 22 + encodedName.length;
  const bytes = new Uint8Array(2 + headerSize + payload.length);
  const view = new DataView(bytes.buffer);
  bytes[0] = headerSize;
  bytes.set(new TextEncoder().encode("-lh5-"), 2);
  view.setUint32(7, payload.length, true);
  view.setUint32(11, payload.length * 2, true);
  bytes[20] = 1;
  bytes[21] = encodedName.length;
  bytes.set(encodedName, 22);
  bytes.set(payload, 2 + headerSize);
  bytes[1] = bytes
    .subarray(2, 2 + headerSize)
    .reduce((sum, value) => (sum + value) & 0xff, 0);
  return bytes;
}

describe("complete firmware preflight", () => {
  beforeEach(() => {
    extractAmiFirmwareBytes.mockReset();
    discoverUefiHiiModules.mockReset();
    buildUefiHiiWorkspace.mockReset();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
      },
    );
  });

  it("recognizes AMIBIOS8 legacy without attempting an incompatible HII scan", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
    const image = new Uint8Array(0x20000).fill(0xff);
    image.set(new TextEncoder().encode("AMIBIOSC0800"), 0x17fea);
    image.set(new TextEncoder().encode("AMIBOOT ROM"), 0x1804c);
    image.set(new TextEncoder().encode("11/24/08"), image.length - 10);
    image.set([0xea, 0xaa, 0xff, 0x00, 0xf0], image.length - 16);
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
    const file = new File([image], "ASUS N10J BIOS.BIN");
    Object.defineProperty(file, "arrayBuffer", {
      value: () => Promise.resolve(image.slice().buffer),
    });
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText("AMIBIOS 8 legacy ROM recognized")).toBeVisible();
    expect(
      screen.getByRole("cell", { name: /AMIBIOS 8.*AMIBIOSC0800.*0x0?17FEA/ }),
    ).toBeVisible();
    expect(screen.getByRole("cell", { name: /BIOS date 11\/24\/08/ })).toBeVisible();
    expect(extractAmiFirmwareBytes).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Start HII analysis" }),
    ).not.toBeInTheDocument();
  });

  it("recognizes Award Legacy and shows its bounded LHA inventory", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
    const image = new Uint8Array(0x40000).fill(0xff);
    image.set(awardLhaMember("awardext.rom", [1, 2, 3]), 0x10000);
    image.set(awardLhaMember("ACPITBL.BIN", [4, 5, 6]), 0x11000);
    image.set(new TextEncoder().encode("= Award Decompression Bios ="), 0x2d000);
    image.set(new TextEncoder().encode("Award BootBlock BIOS v1.0"), 0x3e000);
    image.set(new TextEncoder().encode("6A61K00C"), image.length - 24);
    image.set([0xea, 0x5b, 0xe0, 0x00, 0xf0], image.length - 16);
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
    const file = new File([image], "eMachines EL1200 R01A2.BIN");
    Object.defineProperty(file, "arrayBuffer", {
      value: () => Promise.resolve(image.slice().buffer),
    });
    fireEvent.change(input, { target: { files: [file] } });

    expect(
      await screen.findByText("Award Legacy modular BIOS recognized"),
    ).toBeVisible();
    expect(
      screen.getByText(/2 LHA modules · 0 HII packages · 0 IFR forms/),
    ).toBeVisible();
    expect(extractAmiFirmwareBytes).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Start HII analysis" }),
    ).not.toBeInTheDocument();
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
    expect(
      screen.queryByRole("button", { name: "Start HII analysis" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("AMITSE FFS (outer image)")).not.toBeInTheDocument();
    expect(screen.queryByText("$SPF SetupData")).not.toBeInTheDocument();
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
      screen.getByText("Full-image reconstruction — fixed-size path ready"),
    ).toBeInTheDocument();
    expect(extractAmiFirmwareBytes).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Start HII analysis" }));
    await waitFor(() => {
      expect(onExtracted).toHaveBeenCalledOnce();
    });
    expect(onExtracted.mock.calls[0][0].firmwareSource?.fileName).toBe("board.F13d");
    expect(extractAmiFirmwareBytes).toHaveBeenCalledOnce();
  });

  it("offers the vendor-neutral HII view for a non-AMI UEFI image", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
    const image = validFirmwareVolumeImage();
    image.fill(0, 0x60, 0x6b);
    const inventory = {
      modules: [
        {
          id: "setup",
          name: "Setup",
          formCount: 150,
          referenceCount: 154,
          formSetGuids: ["E14F04FA-8706-4353-92F2-9C2424746F9F"],
        },
      ],
      decodedBufferCount: 2,
      uniqueBufferCount: 1,
      decodeFailures: [],
    };
    discoverUefiHiiModules.mockResolvedValue(inventory);
    const workspace = {
      data: {
        firmwareFamily: "uefi-hii",
        menu: [],
        forms: [
          { name: "Main", type: "Form", formId: "0x1", referencedIn: [], children: [] },
        ],
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
      },
      modules: [],
      warnings: [],
    };
    buildUefiHiiWorkspace.mockResolvedValue(workspace);
    const onUefiHiiExtracted = vi.fn();
    const { container } = render(
      <MantineProvider>
        <BiosImageUpload
          onExtracted={vi.fn().mockResolvedValue(undefined)}
          onUefiHiiExtracted={onUefiHiiExtracted}
        />
      </MantineProvider>,
    );
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("Expected the firmware file input.");
    const file = new File([image], "p53.bin");
    Object.defineProperty(file, "arrayBuffer", {
      value: () => Promise.resolve(image.slice().buffer),
    });
    fireEvent.change(input, { target: { files: [file] } });

    expect(
      await screen.findByText("Standard UEFI HII modules discovered"),
    ).toBeInTheDocument();
    expect(screen.getByText("Setup")).toBeInTheDocument();
    expect(extractAmiFirmwareBytes).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Start vendor-neutral HII analysis",
      }),
    );
    await waitFor(() => {
      expect(onUefiHiiExtracted).toHaveBeenCalledOnce();
    });
    expect(onUefiHiiExtracted.mock.calls[0][0]).toMatchObject({
      fileName: "p53.bin",
      workspace,
    });
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
