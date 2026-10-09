import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import React from "react";
import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { saveAs } from "file-saver";
import { acceptedUefiHiiLzmaImage } from "../src/components/scripts/firmwareAcceptance";
import {
  decodeFirmwareBuffers,
  inventoryFirmwareFiles,
} from "../src/components/scripts/aptioIvExtractor";
import { inventoryUefiHiiModules } from "../src/components/scripts/uefiHiiDiscovery";
import { buildUefiHiiWorkspace } from "../src/components/scripts/uefiHiiWorkspace";
import { analyzeIfrBinary, IFR_OPCODE } from "../src/components/scripts/ifrBinary";
import { bytesToHex } from "../src/components/scripts/hex";
import { sha256Hex } from "../src/components/scripts/checksum";
import { buildMenuTree } from "../src/components/Navigation/menuTree";
import { useDataChangeQueue } from "../src/components/ChangeQueue/useDataChangeQueue";
import UefiHiiMenuActions from "../src/components/FormUi/UefiHiiMenuActions";
import UefiHiiFooter from "../src/components/UefiHiiEditor/UefiHiiFooter";

// Retain the real components, queue, binary editor, image builder and codecs.
// Only capture the download locally instead of writing a firmware file.
vi.mock("file-saver", () => ({ saveAs: vi.fn() }));
const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollIntoView",
);
afterEach(() => {
  cleanup();
  if (originalScrollIntoView)
    Object.defineProperty(
      HTMLElement.prototype,
      "scrollIntoView",
      originalScrollIntoView,
    );
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
});

function findNode(nodes, sourceIndex, childIndex) {
  for (const node of nodes) {
    if (node.parentFormIndex === sourceIndex && node.referenceChildIndex === childIndex)
      return node;
    const found = findNode(node.children, sourceIndex, childIndex);
    if (found) return found;
  }
}

function readBlob(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not inspect local download."));
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.readAsArrayBuffer(blob);
  });
}

it("moves a real P53 Ref through the UI, verifies and explicitly downloads the complete SPI", async () => {
  const started = Date.now();
  const progress = (stage) =>
    console.info(
      `Real HII UI acceptance: ${stage} (${String(Date.now() - started)} ms).`,
    );
  const imagePath = process.env.FIRMWARE_ACCEPTANCE_IMAGE;
  const wasmDirectory = process.env.FIRMWARE_ACCEPTANCE_WASM_DIR;
  if (!imagePath || !wasmDirectory)
    throw new Error("Set FIRMWARE_ACCEPTANCE_IMAGE and FIRMWARE_ACCEPTANCE_WASM_DIR.");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  // jsdom has no layout. Keep the real Select and its handlers, but supply a
  // fixed test geometry and disable only automatic dropdown placement.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    width: 300,
    height: 32,
    top: 0,
    right: 300,
    bottom: 32,
    left: 0,
    toJSON() {
      return {};
    },
  });
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(300);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(32);
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  vi.stubGlobal("fetch", async (url) => {
    const name = basename(String(url));
    if (
      ![
        "firmware-decompress.wasm",
        "tiano-decompress.wasm",
        "ifrextractor.wasm",
      ].includes(name)
    )
      throw new Error("Unexpected acceptance asset.");
    return new Response(readFileSync(join(wasmDirectory, name)), {
      headers: { "Content-Type": "application/wasm" },
    });
  });
  const image = new Uint8Array(readFileSync(imagePath));
  expect(await sha256Hex(image)).toBe(acceptedUefiHiiLzmaImage.sha256);
  expect(image.length).toBe(acceptedUefiHiiLzmaImage.size);
  const inventory = inventoryUefiHiiModules(await decodeFirmwareBuffers(image));
  expect(inventory.decodeFailures).toEqual([]);
  const workspace = await buildUefiHiiWorkspace(inventory);
  progress("workspace parsed");
  const base = workspace.data;
  const sourceIndex = base.forms.findIndex(
    (form) =>
      form.name === "Intel Advanced Menu" &&
      form.sourceModuleId === workspace.modules[0].id,
  );
  const childIndex = base.forms[sourceIndex].children.findIndex(
    (child) => child.type === "Ref" && child.ifrOffset.toLowerCase() === "0x6ab87",
  );
  const source = base.forms[sourceIndex];
  expect(source.children[childIndex].name).toBe("Debug Settings");
  const destination = base.forms.find(
    (form) =>
      form.name === "PCI Subsystem Settings" &&
      form.sourceModuleId === workspace.modules[0].id,
  );
  expect(destination).toBeDefined();
  const originalHex = bytesToHex(workspace.editorBytes ?? workspace.sourceBytes);

  function Editor() {
    const queue = useDataChangeQueue(base);
    const tree = React.useMemo(
      () => buildMenuTree(queue.previewData),
      [queue.previewData],
    );
    const node = findNode([...tree.roots, ...tree.orphans], sourceIndex, childIndex);
    return React.createElement(
      MantineProvider,
      {
        env: "test",
        theme: {
          components: {
            Select: {
              defaultProps: {
                comboboxProps: {
                  width: 300,
                  middlewares: { flip: false, shift: false, size: false },
                },
              },
            },
          },
        },
      },
      node &&
        React.createElement(UefiHiiMenuActions, {
          data: queue.previewData,
          tree,
          node,
          originalSetupSct: originalHex,
          setData: queue.enqueueData,
          enabled: true,
        }),
      React.createElement(UefiHiiFooter, {
        fileName: "accepted-source.bin",
        sourceImage: image,
        moduleCount: workspace.modules.length,
        warningCount: workspace.warnings.length,
        data: queue.previewData,
        appliedData: queue.appliedData,
        changeQueue: queue,
        workspace,
        onClose: () => {},
      }),
    );
  }
  render(React.createElement(Editor));
  progress("controls rendered");
  const click = (name) => fireEvent.click(screen.getByRole("button", { name }));
  expect(screen.getByRole("button", { name: "Check firmware output" })).toBeDisabled();
  click("Move Debug Settings menu");
  progress("move dialog opened");
  fireEvent.click(screen.getByPlaceholderText("Choose the new parent menu"));
  progress("destination selector opened");
  fireEvent.click(screen.getByText(/^Safe · PCI Subsystem Settings ·/));
  progress("destination selected");
  click("Move menu");
  progress("Ref move requested");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(), {
    timeout: 30000,
  });
  progress("Ref move staged");
  expect(screen.getByRole("button", { name: "Check firmware output" })).toBeDisabled();
  click("Change queue (1)");
  fireEvent.click(await screen.findByRole("button", { name: "Apply selected" }));
  click("Close");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  click("Check firmware output");
  progress("full-image check requested");
  expect(
    screen.getByRole("button", { name: "Modified firmware image" }),
  ).toBeDisabled();
  await waitFor(
    () =>
      expect(
        screen.getByRole("button", { name: "Modified firmware image" }),
      ).toBeEnabled(),
    { timeout: 480000, interval: 1000 },
  );
  expect(saveAs).not.toHaveBeenCalled();
  progress("complete-image check succeeded");
  click("Output details");
  expect(await screen.findByText(/2 physical copy\/copies verified/)).toHaveTextContent(
    "buffer 2",
  );
  expect(screen.getByText(/2 physical copy\/copies verified/)).toHaveTextContent(
    "buffer 4",
  );
  expect(
    screen.getByText(/10485760 bytes outside BIOS preserved exactly/),
  ).toBeInTheDocument();
  expect(screen.getAllByText("22320")).toHaveLength(2);
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  click("Modified firmware image");
  expect(saveAs).toHaveBeenCalledOnce();
  const [blob, name] = vi.mocked(saveAs).mock.calls[0];
  expect(name).toBe("accepted-source-modified.bin");
  expect(blob).toBeInstanceOf(Blob);
  const downloaded = await readBlob(blob);
  progress("download captured");
  expect(downloaded.length).toBe(33554432);
  expect(await sha256Hex(downloaded)).toBe(
    "4c52549b9df88a7763eedf4fa0cf842909d800431b10a88c76d73c851792d10b",
  );
  expect(
    Buffer.compare(
      Buffer.from(downloaded.subarray(0, 10485760)),
      Buffer.from(image.subarray(0, 10485760)),
    ),
  ).toBe(0);
  const reopened = await decodeFirmwareBuffers(downloaded);
  expect(reopened.decodeFailures).toEqual([]);
  expect(inventoryUefiHiiModules(reopened).modules).toHaveLength(25);
  for (const id of [2, 4]) {
    const buffer = reopened.buffers.find((buffer) => buffer.id === id);
    const file = inventoryFirmwareFiles(buffer).find(
      (file) => file.guid === acceptedUefiHiiLzmaImage.fileGuid,
    );
    const model = analyzeIfrBinary(buffer.bytes.subarray(file.bodyStart, file.end));
    const refs = model.packages
      .flatMap((pkg) => pkg.opcodes)
      .filter(
        (span) =>
          span.opcode === IFR_OPCODE.REF &&
          span.formId === 0x1006 &&
          span.ownerFormSetGuid === source.formSetGuid,
      );
    expect(refs).toHaveLength(1);
    expect(refs[0].ownerFormId).toBe(Number.parseInt(destination.formId));
  }
  click("Change queue (1)");
  fireEvent.click(
    await screen.findByRole("button", { name: /Remove .* from change queue/ }),
  );
  click("Close");
  expect(
    screen.getByRole("button", { name: "Modified firmware image" }),
  ).toBeDisabled();
  expect(screen.getByRole("button", { name: "Output details" })).toBeDisabled();
  expect(saveAs).toHaveBeenCalledOnce();
}, 900000);
