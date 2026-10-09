import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { createHash } from "node:crypto";
import createCapstone from "@alexaltea/capstone-js";
import { expect, it, vi } from "vitest";
import {
  decodeFirmwareBuffers,
  inventoryFirmwareFiles,
} from "../src/components/scripts/aptioIvExtractor";
import { inventoryUefiHiiModules } from "../src/components/scripts/uefiHiiDiscovery";
import { readFirmwareSection } from "../src/components/scripts/firmwareSections";
import {
  readPeEvidenceSections,
  findPeGuidEvidence,
} from "../src/components/scripts/peGuidEvidence";
import { readGuid, readUint16 } from "../src/components/scripts/binaryReader";
import { acceptedUefiHiiLzmaImage } from "../src/components/scripts/firmwareAcceptance";

const protocolGuids = {
  browser: "B9D4C360-BCFB-4F9B-9298-53C136982258",
  database: "EF9FC172-A1B2-4693-B327-6D32FC416042",
  configAccess: "330D4706-F2A0-4E4F-A369-B66FA8D54385",
};
const driverGuids = {
  Setup: "E6A7A1CE-5881-4B49-80BE-69C91811685C",
  SystemBiosSetupDxe: "721C8B66-426C-4E86-8E99-3457C46AB0B9",
  SystemFormBrowserMetroViewDxe: "C7351A96-9215-4026-BCBD-12D6E7DB36E9",
  LenovoSetupMainDxe: "37AFCF55-2E8C-4722-B950-B48B9165C56B",
};
const metroFormSets = [
  "1247C8E8-307C-4C6B-8812-CA054F9963F8",
  "3E59F6A2-AA28-42F4-BCC0-AEDFE88106AD",
  "3DC1FE64-37B5-4BF6-9BCF-4F0689299E53",
  "7FE80B2D-FEE9-4671-A0F4-F7C7C7D59EF4",
  "9C796776-68F7-4A45-A57D-B9E1CE61197E",
  "A7F26116-CFDC-4296-8224-ED7D140170C7",
  "821D8B77-246D-4E96-8E10-3467D56AB1BA",
];
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

it("reproduces bounded P53 browser landmarks without granting root registration", async () => {
  const imagePath = process.env.FIRMWARE_ACCEPTANCE_IMAGE;
  const wasmDirectory = process.env.FIRMWARE_ACCEPTANCE_WASM_DIR;
  if (!imagePath || !wasmDirectory)
    throw Error("Set firmware acceptance input and WASM directory.");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    async (url) =>
      new Response(readFileSync(join(wasmDirectory, basename(String(url)))), {
        headers: { "Content-Type": "application/wasm" },
      }),
  );
  const image = new Uint8Array(readFileSync(imagePath));
  expect(digest(image)).toBe(acceptedUefiHiiLzmaImage.sha256);
  expect(image.length).toBe(acceptedUefiHiiLzmaImage.size);
  const decoded = await decodeFirmwareBuffers(image);
  const inventory = inventoryUefiHiiModules(decoded);
  expect(inventory.decodeFailures).toEqual([]);
  const targets = [
    ...Object.values(protocolGuids),
    ...new Set(inventory.modules.flatMap((module) => module.formSetGuids)),
  ];
  const capstone = await createCapstone({
    wasmBinary: readFileSync("node_modules/@alexaltea/capstone-js/dist/capstone.wasm"),
  });
  const decoder = new capstone.Capstone(capstone.ARCH_X86, capstone.MODE_64);
  const seen = new Set();
  const records = [];
  try {
    for (const node of decoded.buffers) {
      const hash = digest(node.bytes);
      if (seen.has(hash)) continue;
      seen.add(hash);
      for (const file of inventoryFirmwareFiles(node)) {
        const name = Object.keys(driverGuids).find(
          (name) => driverGuids[name] === file.guid,
        );
        if (!name) continue;
        // Let the test worker deliver updates between independent driver scans.
        await new Promise((resolve) => setTimeout(resolve, 0));
        const bodyDigest = digest(node.bytes.subarray(file.bodyStart, file.end));
        let cursor = file.bodyStart;
        const executableSections = [];
        while (cursor < file.end) {
          const section = readFirmwareSection(node.bytes, cursor, file.end);
          if (!section) break;
          if (section.type === 0x10) executableSections.push(section);
          cursor = Math.ceil(section.end / 4) * 4;
        }
        expect(executableSections).toHaveLength(1);
        const executable = executableSections[0];
        const sections = readPeEvidenceSections(
          node.bytes,
          executable.start + executable.headerSize,
          executable.end,
        );
        expect(sections.length).toBeGreaterThan(0);
        const hits = findPeGuidEvidence(node.bytes, sections, targets);
        const trace = (bodyOffset, count) => {
          const at = file.bodyStart + bodyOffset;
          const code = sections.find(
            (section) =>
              section.executable && at >= section.start && at + count <= section.end,
          );
          expect(code).toBeDefined();
          return decoder.disasm(
            node.bytes.slice(at, at + count),
            code.rva + at - code.start,
          );
        };
        const record = {
          name,
          fileGuid: file.guid,
          bufferId: node.id,
          fileStart: file.fileStart,
          bodySha256: bodyDigest,
          hits: hits.map((hit) => ({
            guid: hit.guid,
            section: hit.sectionName,
            bodyOffset: hit.offset - file.bodyStart,
            leaByteCandidates: hit.leaByteCandidates.map(
              (offset) => offset - file.bodyStart,
            ),
          })),
        };
        if (name === "SystemFormBrowserMetroViewDxe") {
          const first = hits.find(
            (hit) =>
              hit.offset - file.bodyStart === 267716 && hit.guid === metroFormSets[0],
          );
          expect(
            first?.leaByteCandidates.map((offset) => offset - file.bodyStart),
          ).toEqual([19224]);
          const segment = sections.find(
            (section) =>
              first.offset >= section.start && first.offset + 7 * 24 <= section.end,
          );
          expect(segment?.executable).toBe(false);
          const entries = metroFormSets.map((guid, index) => {
            const at = first.offset + index * 24;
            expect(readGuid(node.bytes, at)).toBe(guid);
            return {
              guid,
              bodyOffset: at - file.bodyStart,
              fields16: [16, 18, 20, 22].map((delta) =>
                readUint16(node.bytes, at + delta),
              ),
            };
          });
          expect(entries.map((entry) => entry.fields16)).toEqual([
            [14, 15, 15, 0],
            [16, 17, 17, 0],
            [18, 19, 19, 0],
            [20, 21, 21, 0],
            [22, 23, 23, 0],
            [24, 25, 25, 0],
            [16, 17, 17, 0],
          ]);
          const code = trace(19224, 160);
          expect(code[0].mnemonic).toBe("lea");
          expect(
            code.some(
              (instruction) =>
                instruction.mnemonic === "cmp" && instruction.op_str === "r9b, 7",
            ),
          ).toBe(true);
          expect(
            code.some(
              (instruction) =>
                instruction.mnemonic === "lea" &&
                instruction.op_str === "rcx, [rax + rax*2]",
            ),
          ).toBe(true);
          for (const delta of ["0x10", "0x12", "0x14"])
            expect(
              code.some(
                (instruction) =>
                  instruction.mnemonic === "movzx" &&
                  instruction.op_str === `eax, word ptr [rbx + rcx*8 + ${delta}]`,
              ),
            ).toBe(true);
          record.metroTable = {
            entries,
            candidateCodeBodyOffset: 19224,
            recordStride: 24,
            interpretation:
              "GUID lookup plus three 16-bit selectors; field meanings unresolved",
          };
        }
        if (name === "SystemBiosSetupDxe") {
          const browser = hits.find((hit) => hit.guid === protocolGuids.browser);
          expect(
            browser?.leaByteCandidates.map((offset) => offset - file.bodyStart),
          ).toEqual([4557]);
          const code = trace(4557, 400);
          expect(code[0].mnemonic).toBe("lea");
          expect(code[1].mnemonic).toBe("call");
          expect(code[1].op_str).toBe("qword ptr [rax + 0x140]");
          const send = code.find((instruction) => Number(instruction.address) === 4824);
          expect(send?.mnemonic).toBe("call");
          expect(send?.op_str).toBe("qword ptr [rax]");
          expect(
            code.some(
              (instruction) =>
                instruction.mnemonic === "xor" && instruction.op_str === "r9d, r9d",
            ),
          ).toBe(true);
          expect(
            code.some(
              (instruction) =>
                instruction.mnemonic === "call" && instruction.op_str === "0xb1c",
            ),
          ).toBe(true);
          record.browserPath = {
            browserGuidBodyOffset: browser.offset - file.bodyStart,
            candidateCodeBodyOffset: 4557,
            firstSlotCallRva: 4824,
            handlePreparationCallTargetRva: 2844,
            interpretation:
              "candidate LocateProtocol/SendForm sequence; interface and handle dataflow remain unresolved",
          };
        }
        records.push(record);
        expect(digest(node.bytes.subarray(file.bodyStart, file.end))).toBe(bodyDigest);
      }
    }
    expect(records.map((record) => record.name).sort()).toEqual(
      Object.keys(driverGuids).sort(),
    );
    expect(digest(image)).toBe(acceptedUefiHiiLzmaImage.sha256);
    console.info(
      JSON.stringify({
        sourceSha256: digest(image),
        records,
        runtimeRegistration: "unproven",
        runtimeVisibility: "unproven",
      }),
    );
  } finally {
    decoder.close();
  }
}, 120000);
