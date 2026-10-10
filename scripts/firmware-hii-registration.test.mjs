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
          const traceRva = (rva, count) => {
            const owner = sections.find(
              (section) =>
                section.executable &&
                rva >= section.rva &&
                rva + count <= section.rva + section.end - section.start,
            );
            expect(owner).toBeDefined();
            return trace(owner.start + rva - owner.rva - file.bodyStart, count);
          };
          const list = traceRva(976, 187);
          const inspect = traceRva(1840, 749);
          const selection = traceRva(2844, 1652);
          const assertAt = (instructions, rva, mnemonic, operands) => {
            const instruction = instructions.find(
              (item) => Number(item.address) === rva,
            );
            expect(instruction?.mnemonic).toBe(mnemonic);
            expect(instruction?.op_str).toBe(operands);
            return instruction;
          };
          const assertRip = (instructions, rva, mnemonic, operands, target) => {
            const instruction = assertAt(instructions, rva, mnemonic, operands);
            const displacement = /\[rip \+ (0x[0-9a-f]+)\]/.exec(instruction.op_str);
            expect(displacement).not.toBeNull();
            expect(rva + instruction.size + Number(displacement[1])).toBe(target);
          };
          // Both enumeration calls use type 2, a null GUID filter and the same
          // interface global. The returned byte size is divided by eight.
          assertRip(list, 1041, "mov", "rax, qword ptr [rip + 0x3f48]", 17248);
          assertAt(list, 1038, "xor", "r8d, r8d");
          assertAt(list, 1048, "mov", "dl, 2");
          assertAt(list, 1053, "call", "qword ptr [rax + 0x18]");
          assertAt(list, 1059, "movabs", "rax, 0x8000000000000005");
          assertRip(list, 1084, "mov", "qword ptr [rip + 0x3ecd], rax", 17168);
          assertRip(list, 1118, "mov", "rax, qword ptr [rip + 0x3efb]", 17248);
          assertAt(list, 1125, "xor", "r8d, r8d");
          assertAt(list, 1128, "mov", "dl, 2");
          assertAt(list, 1133, "call", "qword ptr [rax + 0x18]");
          assertAt(list, 1144, "shr", "rax, 3");
          assertRip(list, 1148, "mov", "qword ptr [rip + 0x3eb5], rax", 17208);
          assertRip(code, 4781, "mov", "r8, qword ptr [rip + 0x3084]", 17208);
          assertRip(code, 4792, "mov", "rdx, qword ptr [rip + 0x3051]", 17168);
          // The temporary filtered array is not published as the browser array.
          assertRip(selection, 2953, "mov", "rax, qword ptr [rip + 0x3780]", 17168);
          assertAt(selection, 2985, "mov", "r12, qword ptr [rax + rdi*8]");
          assertAt(selection, 2996, "call", "0x730");
          assertAt(selection, 3166, "mov", "qword ptr [r15 + rsi*8], rcx");
          assertAt(selection, 3170, "add", "rsi, r13");
          assertRip(selection, 3573, "cmp", "byte ptr [rip + 0x3506], r12b", 17154);
          assertRip(selection, 3933, "cmp", "byte ptr [rip + 0x339d], r12b", 17153);
          assertAt(selection, 3770, "call", "qword ptr [rax + 0x80]");
          assertAt(selection, 4253, "xor", "r12d, r12d");
          assertAt(selection, 4304, "call", "0x3d0");
          assertRip(selection, 4290, "mov", "qword ptr [rip + 0x3247], r12", 17168);
          assertRip(selection, 4297, "mov", "qword ptr [rip + 0x3268], r12", 17208);
          // Package export and IFR landmarks corroborate the helper's role;
          // callback interfaces and all runtime conditions remain unresolved.
          assertRip(inspect, 2076, "mov", "rax, qword ptr [rip + 0x3b3d]", 17248);
          assertRip(inspect, 2130, "mov", "r10, qword ptr [rip + 0x3b07]", 17248);
          assertAt(inspect, 2103, "call", "qword ptr [rax + 0x20]");
          assertAt(inspect, 2153, "call", "qword ptr [r10 + 0x20]");
          assertAt(inspect, 2267, "cmp", "ecx, 0x2000000");
          assertAt(inspect, 2296, "cmp", "byte ptr [rdi], 0xe");
          assertAt(inspect, 2305, "lea", "rdx, [rdi + 2]");
          assertAt(inspect, 2342, "cmp", "byte ptr [rdi], 1");
          record.handleSelection = {
            routineRva: 2844,
            enumerationRoutineRva: 976,
            inspectionRoutineRva: 1840,
            interfaceGlobalRva: 17248,
            handleArrayGlobalRva: 17168,
            handleCountGlobalRva: 17208,
            packageType: 2,
            packageGuidFilter: null,
            handleWidth: 8,
            conditionByteRvas: [17153, 17154],
            refreshCallRva: 4304,
            interpretation:
              "candidate forms-package enumeration feeds SendForm; temporary filtering and conditional mutations precede re-enumeration",
          };
          record.browserPath = {
            browserGuidBodyOffset: browser.offset - file.bodyStart,
            candidateCodeBodyOffset: 4557,
            firstSlotCallRva: 4824,
            handlePreparationCallTargetRva: 2844,
            interpretation:
              "candidate LocateProtocol/SendForm sequence; array/count globals linked to enumeration, interface origin and runtime conditions unresolved",
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
