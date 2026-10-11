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
import {
  readGuid,
  readUint16,
  readUint32,
} from "../src/components/scripts/binaryReader";
import { acceptedUefiHiiLzmaImage } from "../src/components/scripts/firmwareAcceptance";

const protocolGuids = {
  browser: "B9D4C360-BCFB-4F9B-9298-53C136982258",
  database: "EF9FC172-A1B2-4693-B327-6D32FC416042",
  configAccess: "330D4706-F2A0-4E4F-A369-B66FA8D54385",
  guidList: "F5261E18-F373-40BA-87FD-7F1C300CBBFF",
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
        const assertAt = (instructions, rva, mnemonic, operands) => {
          const instruction = instructions.find((item) => Number(item.address) === rva);
          expect(instruction?.mnemonic).toBe(mnemonic);
          expect(instruction?.op_str).toBe(operands);
          return instruction;
        };
        const assertRip = (instructions, rva, mnemonic, operands, target) => {
          const instruction = assertAt(instructions, rva, mnemonic, operands);
          const displacement = /\[rip ([-+]) (0x[0-9a-f]+)\]/.exec(instruction.op_str);
          expect(displacement).not.toBeNull();
          expect(
            rva +
              instruction.size +
              (displacement[1] === "+" ? 1 : -1) * Number(displacement[2]),
          ).toBe(target);
        };
        const dataAtRva = (rva, size) => {
          const owner = sections.find(
            (section) =>
              !section.executable &&
              rva >= section.rva &&
              rva + size <= section.rva + section.end - section.start,
          );
          expect(owner).toBeDefined();
          return owner.start + rva - owner.rva;
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
          const peStart = executable.start + executable.headerSize;
          const peHeader = peStart + readUint32(node.bytes, peStart + 0x3c);
          const entryRva = readUint32(node.bytes, peHeader + 0x28);
          expect(entryRva).toBe(768);
          const initialization = traceRva(entryRva, 113);
          const list = traceRva(976, 187);
          const inspect = traceRva(1840, 749);
          const selection = traceRva(2844, 1652);
          // EFI entry RDX reaches the initialization call unchanged. The x64
          // System Table's BootServices field is retained in the service global.
          assertAt(initialization, 777, "call", "0x31c");
          assertAt(initialization, 800, "mov", "r9, qword ptr [rdx + 0x60]");
          assertRip(initialization, 831, "mov", "qword ptr [rip + 0x4002], r9", 17224);
          assertRip(initialization, 852, "mov", "rax, qword ptr [rip + 0x3fed]", 17224);
          assertRip(initialization, 859, "lea", "r8, [rip + 0x3ffe]", 17248);
          assertAt(initialization, 866, "xor", "edx, edx");
          assertRip(initialization, 868, "lea", "rcx, [rip + 0x3645]", 14768);
          assertAt(initialization, 875, "call", "qword ptr [rax + 0x140]");
          expect(readGuid(node.bytes, dataAtRva(14768, 16))).toBe(
            protocolGuids.database,
          );
          // Two GUID-presence accumulators, not one visibility byte per root.
          const conditionGuids = [
            {
              guidRva: 14736,
              byteRva: 17153,
              guid: "F5261E19-F373-40BA-87FD-7F1C300CBBFF",
            },
            {
              guidRva: 15728,
              byteRva: 17154,
              guid: "F5261E1A-F373-40BA-87FD-7F1C300CBBFF",
            },
          ];
          for (const item of conditionGuids) {
            expect(readGuid(node.bytes, dataAtRva(item.guidRva, 16))).toBe(item.guid);
            expect(node.bytes[dataAtRva(item.byteRva, 1)]).toBe(0);
            expect(
              inventory.modules.some((module) =>
                module.formSetGuids.includes(item.guid),
              ),
            ).toBe(false);
          }
          expect(readGuid(node.bytes, dataAtRva(17136, 16))).toBe(
            "00000000-0000-0000-0000-000000000000",
          );
          assertRip(selection, 3200, "mov", "r13, qword ptr [rip + 0x36a1]", 17192);
          assertRip(selection, 3210, "mov", "r11, qword ptr [rip + 0x30e7]", 15736);
          assertRip(selection, 3220, "mov", "r10, qword ptr [rip + 0x2cfd]", 14744);
          assertAt(selection, 3227, "mov", "edi, 1");
          assertRip(selection, 3232, "mov", "r8b, byte ptr [rip + 0x365b]", 17154);
          assertRip(selection, 3239, "mov", "dl, byte ptr [rip + 0x3654]", 17153);
          assertRip(selection, 3252, "cmp", "qword ptr [rip + 0x3635], r9", 17136);
          assertRip(selection, 3265, "cmp", "qword ptr [rip + 0x3630], rax", 17144);
          assertAt(selection, 3272, "je", "0xd08");
          assertRip(selection, 3274, "cmp", "r9, qword ptr [rip + 0x309f]", 15728);
          assertAt(selection, 3283, "cmp", "qword ptr [rcx + 8], r11");
          assertAt(selection, 3291, "cmove", "r8d, edi");
          assertRip(selection, 3295, "mov", "byte ptr [rip + 0x361c], r8b", 17154);
          assertRip(selection, 3302, "cmp", "r9, qword ptr [rip + 0x2ca3]", 14736);
          assertAt(selection, 3311, "cmp", "qword ptr [rcx + 8], r10");
          assertAt(selection, 3318, "cmove", "edx, edi");
          assertRip(selection, 3321, "mov", "byte ptr [rip + 0x3602], dl", 17153);
          assertAt(selection, 3330, "add", "rcx, 0x10");
          assertAt(selection, 3341, "jne", "0xd18");
          assertAt(selection, 3346, "je", "0x1181");
          const initialGuidList = Array.from({ length: 6 }, (_, index) =>
            readGuid(node.bytes, dataAtRva(15440 + index * 16, 16)),
          );
          expect(readGuid(node.bytes, dataAtRva(15536, 16))).toBe(
            "00000000-0000-0000-0000-000000000000",
          );
          expect(initialGuidList).toEqual([
            "59BFC760-3A82-4656-B1E1-D90A499AEA84",
            "61912FA5-D42A-4F3F-955D-BB07B8DD1F57",
            "480B3204-C23C-4AE1-BB16-A73FADDA475F",
            "2C0EEABD-4107-44A8-A787-2E38FFC52B2B",
            "348CA223-637B-4430-BAF3-1CE5D322B3FD",
            "A7F26116-CFDC-4296-8224-ED7D140170C7",
          ]);
          expect(readGuid(node.bytes, dataAtRva(15552, 16))).toBe(
            conditionGuids[0].guid,
          );
          for (const item of conditionGuids)
            expect(initialGuidList).not.toContain(item.guid);
          assertRip(code, 4607, "lea", "rdx, [rip + 0x2a4a]", 15440);
          assertAt(code, 4619, "mov", "r8d, 0x90");
          assertAt(code, 4628, "call", "0x280");
          assertRip(code, 4633, "mov", "qword ptr [rip + 0x3108], rbx", 17192);
          record.interfaceInitialization = {
            entryRva,
            routineRva: 796,
            locateCallRva: 875,
            databaseGuidRva: 14768,
            serviceGlobalRva: 17224,
            interfaceGlobalRva: 17248,
            interpretation:
              "static EFI entry-to-HiiDatabase LocateProtocol output chain; lookup success remains unproven",
          };
          record.guidConditions = {
            conditionGuids,
            initialGuidList,
            initialListSentinelRva: 15536,
            interpretation:
              "GUID-presence accumulators with zero source bytes; neither is a per-FormSet visibility vector",
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
          const browserRoutine = traceRva(4516, 459);
          const published = hits.find((hit) => hit.guid === protocolGuids.guidList);
          expect(published?.offset - file.bodyStart).toBe(14868);
          expect(published?.leaByteCandidates.map((at) => at - file.bodyStart)).toEqual(
            [4666, 4924],
          );
          assertRip(
            browserRoutine,
            4531,
            "mov",
            "rax, qword ptr [rip + 0x318e]",
            17224,
          );
          assertAt(browserRoutine, 4538, "lea", "r8, [rbp - 0x18]");
          assertAt(browserRoutine, 4545, "xor", "esi, esi");
          assertAt(browserRoutine, 4547, "xor", "edx, edx");
          assertAt(browserRoutine, 4569, "js", "0x135f");
          assertAt(browserRoutine, 4811, "mov", "qword ptr [rsp + 0x28], rsi");
          assertAt(browserRoutine, 4819, "mov", "word ptr [rsp + 0x20], si");
          assertRip(code, 4645, "mov", "rax, qword ptr [rip + 0x311c]", 17224);
          assertRip(code, 4652, "lea", "r9, [rip + 0x30f5]", 17192);
          assertAt(code, 4659, "xor", "r8d, r8d");
          assertRip(code, 4662, "lea", "rdx, [rip + 0x27d3]", 14864);
          assertRip(code, 4669, "lea", "rcx, [rip + 0x30dc]", 17184);
          assertAt(code, 4676, "call", "qword ptr [rax + 0x80]");
          assertRip(browserRoutine, 4906, "lea", "r8, [rip + 0x2ff7]", 17192);
          assertRip(browserRoutine, 4920, "lea", "rdx, [rip + 0x26d1]", 14864);
          assertAt(browserRoutine, 4927, "call", "qword ptr [rax + 0x90]");
          // Conditional Ref construction leads to an export/Forms/update path.
          const refBuilder = traceRva(13092, 219);
          const update = traceRva(13852, 505);
          assertAt(selection, 4173, "call", "0x3324");
          assertAt(selection, 4181, "call", "0x361c");
          assertAt(refBuilder, 13123, "mov", "esi, 0x23");
          assertAt(refBuilder, 13236, "call", "0x280");
          assertAt(refBuilder, 13268, "mov", "r8b, 0xf");
          assertAt(refBuilder, 13279, "call", "0x327c");
          assertRip(update, 13902, "mov", "rax, qword ptr [rip + 0xd0b]", 17248);
          assertAt(update, 13934, "call", "qword ptr [rax + 0x20]");
          assertAt(update, 14008, "call", "qword ptr [rax + 0x20]");
          assertAt(update, 14178, "cmp", "byte ptr [rbx + 3], 2");
          assertAt(update, 14195, "call", "0x3400");
          assertRip(update, 14315, "mov", "rax, qword ptr [rip + 0xb6e]", 17248);
          assertAt(update, 14325, "call", "qword ptr [rax + 0x10]");
          const replacement = traceRva(13312, 540);
          const targetGuid = "1D81A238-03F1-4F4A-A413-CBBB008E1F0F";
          const labelGuid = "0F0B1735-87A0-4193-B266-538C38AF48CE";
          expect(readGuid(node.bytes, dataAtRva(15584, 16))).toBe(targetGuid);
          expect(readGuid(node.bytes, dataAtRva(14576, 16))).toBe(labelGuid);
          assertAt(replacement, 13353, "mov", "eax, 1");
          assertAt(replacement, 13358, "mov", "word ptr [rbp - 0x10], ax");
          assertAt(replacement, 13492, "cmp", "al, 0xe");
          assertRip(replacement, 13496, "mov", "rax, qword ptr [rip + 0x821]", 15584);
          assertAt(replacement, 13503, "cmp", "qword ptr [rbx + 2], rax");
          assertRip(replacement, 13509, "mov", "rax, qword ptr [rip + 0x81c]", 15592);
          assertAt(replacement, 13516, "cmp", "qword ptr [rbx + 0xa], rax");
          assertAt(replacement, 13534, "cmp", "al, 1");
          assertAt(replacement, 13538, "cmp", "al, 0x5d");
          assertAt(replacement, 13542, "lea", "rcx, [rbx + 2]");
          assertAt(replacement, 13561, "lea", "rdx, [rbp - 0x10]");
          assertAt(replacement, 13565, "call", "0x2e0");
          assertAt(replacement, 13630, "call", "0x2e0");
          assertAt(replacement, 13682, "lea", "rdx, [rax + r14]");
          assertAt(replacement, 13699, "call", "0x280");
          assertAt(replacement, 13816, "movabs", "rax, 0x800000000000000e");
          assertAt(selection, 4085, "mov", "ecx, 0x3e9");
          assertAt(selection, 4090, "mov", "word ptr [rax + 0x13], cx");
          assertAt(selection, 4123, "mov", "ecx, 0x3ea");
          assertAt(selection, 4132, "mov", "word ptr [rax + 0x13], cx");
          const ownedModule = inventory.modules.find(
            (module) => module.bufferId === node.id && module.file.guid === file.guid,
          );
          expect(ownedModule?.formSetGuids).toEqual([targetGuid]);
          const labels = ownedModule.packages
            .flatMap((pkg) => pkg.opcodes)
            .filter((opcode) => opcode.opcode === 0x5f)
            .map((opcode) => {
              expect(opcode.length).toBe(21);
              expect(opcode.ownerFormSetGuid).toBe(targetGuid);
              expect(opcode.ownerFormId).toBe(1);
              expect(readGuid(ownedModule.bytes, opcode.offset + 2)).toBe(labelGuid);
              expect(ownedModule.bytes[opcode.offset + 18]).toBe(0);
              return {
                bodyOffset: opcode.offset,
                number: readUint16(ownedModule.bytes, opcode.offset + 19),
              };
            });
          expect(labels).toEqual([
            { bodyOffset: 15685, number: 1001 },
            { bodyOffset: 15706, number: 1002 },
          ]);
          // Follow output pointers through the package inspector and Ref builder.
          assertAt(inspect, 1847, "mov", "qword ptr [rax + 0x20], r9");
          assertAt(inspect, 1851, "mov", "qword ptr [rax + 0x10], rdx");
          assertAt(inspect, 1870, "lea", "rbp, [rax - 0x57]");
          assertAt(inspect, 1894, "mov", "r12, r8");
          assertAt(inspect, 1917, "mov", "rdi, qword ptr [rbp + 0x7f]");
          assertAt(inspect, 2052, "mov", "word ptr [rdi], ax");
          assertAt(inspect, 2214, "mov", "rbx, qword ptr [rbp + 0x77]");
          assertAt(inspect, 2301, "mov", "rcx, qword ptr [rbp + 0x67]");
          assertAt(inspect, 2314, "mov", "r8d, 0x10");
          assertAt(inspect, 2320, "call", "0x280");
          assertAt(inspect, 2328, "movzx", "ecx, word ptr [rdi + 0x12]");
          assertAt(inspect, 2337, "mov", "word ptr [r12], cx");
          assertAt(inspect, 2345, "je", "0x940");
          assertAt(inspect, 2368, "movzx", "ecx, word ptr [rdi + 2]");
          assertAt(inspect, 2372, "mov", "word ptr [rbx], cx");
          assertRip(inspect, 2494, "cmp", "byte ptr [rip + 0x393c], 1", 17153);
          assertAt(inspect, 2529, "mov", "word ptr [r12], ax");
          assertAt(selection, 3998, "mov", "rcx, qword ptr [r15 + rbx*8]");
          assertAt(selection, 4002, "lea", "rax, [rbp + 0x67]");
          assertAt(selection, 4006, "lea", "r9, [rbp + 0x77]");
          assertAt(selection, 4010, "mov", "qword ptr [rsp + 0x20], rax");
          assertAt(selection, 4015, "lea", "r8, [rbp + 0x6f]");
          assertAt(selection, 4019, "lea", "rdx, [rbp - 1]");
          assertAt(selection, 4023, "call", "0x730");
          assertAt(selection, 4034, "js", "0x10a0");
          assertAt(selection, 4118, "movzx", "r8d, word ptr [rbp + 0x6f]");
          assertAt(selection, 4128, "movzx", "edx, word ptr [rbp + 0x77]");
          assertAt(selection, 4136, "mov", "ecx, 0x2000");
          assertAt(selection, 4145, "add", "ecx, ebx");
          assertAt(selection, 4147, "movzx", "eax, word ptr [rbp + 0x67]");
          assertAt(selection, 4151, "mov", "word ptr [rsp + 0x40], ax");
          assertAt(selection, 4156, "lea", "rax, [rbp - 1]");
          assertAt(selection, 4160, "mov", "qword ptr [rsp + 0x38], rax");
          assertAt(selection, 4165, "mov", "word ptr [rsp + 0x28], cx");
          assertAt(selection, 4170, "mov", "rcx, r13");
          assertAt(refBuilder, 13111, "push", "r14");
          assertAt(refBuilder, 13113, "sub", "rsp, 0x60");
          assertAt(refBuilder, 13117, "movzx", "edi, dx");
          assertAt(refBuilder, 13134, "movzx", "ebx, r8w");
          assertAt(refBuilder, 13143, "xor", "r14d, r14d");
          assertAt(refBuilder, 13146, "mov", "word ptr [rsp + 0x32], bx");
          assertAt(refBuilder, 13151, "mov", "rbx, qword ptr [rsp + 0xa8]");
          assertAt(refBuilder, 13159, "lea", "eax, [rsi - 0x1f]");
          assertAt(refBuilder, 13162, "mov", "word ptr [rsp + 0x34], ax");
          assertAt(refBuilder, 13167, "movzx", "eax, word ptr [rsp + 0x98]");
          assertAt(refBuilder, 13175, "mov", "word ptr [rsp + 0x3d], di");
          assertAt(refBuilder, 13180, "movzx", "edi, word ptr [rsp + 0xb0]");
          assertAt(refBuilder, 13188, "mov", "word ptr [rsp + 0x36], ax");
          assertAt(refBuilder, 13193, "mov", "byte ptr [rsp + 0x3c], r14b");
          assertAt(refBuilder, 13198, "mov", "word ptr [rsp + 0x3f], r14w");
          assertAt(refBuilder, 13204, "mov", "word ptr [rsp + 0x51], di");
          assertAt(refBuilder, 13231, "lea", "rcx, [rsp + 0x41]");
          assertAt(refBuilder, 13241, "test", "di, di");
          assertAt(refBuilder, 13244, "jne", "0x33cc");
          assertAt(refBuilder, 13246, "mov", "esi, 0xf");
          assertAt(refBuilder, 13254, "lea", "eax, [rsi + 0x12]");
          assertAt(refBuilder, 13257, "cmovne", "esi, eax");
          // After the start match, insert and copy the original remainder directly.
          assertAt(replacement, 13666, "mov", "rax, qword ptr [rcx]");
          assertAt(replacement, 13669, "mov", "r8, qword ptr [rcx + 0x10]");
          assertAt(replacement, 13686, "sub", "r8, r14");
          assertAt(replacement, 13708, "mov", "rax, qword ptr [rcx + 0x10]");
          assertAt(replacement, 13716, "sub", "rax, r14");
          assertAt(replacement, 13740, "add", "r12, rax");
          assertAt(replacement, 13743, "lea", "rdx, [r12 + r15]");
          assertAt(replacement, 13747, "sub", "r8, r12");
          assertAt(replacement, 13760, "call", "0x280");
          assertAt(replacement, 13814, "jmp", "0x3602");
          assertAt(replacement, 13849, "ret", "");
          record.refSourceFlow = {
            sourceHandleLoadRva: 3998,
            inspectionCallRva: 4023,
            formSetGuidOutput: "FormSet opcode +2, 16 bytes",
            formIdOutput: "first Form opcode +2 within a scanned Forms package",
            promptOutput: "FormSet title at +18, with conditional string processing",
            devicePathOutput:
              "fifth inspector output, used as optional Ref DevicePath string ID",
            questionIdExpression: "low16(0x2000 + selected-handle index)",
            helpStringId: 4,
            refQuestionId: 0,
            questionFlags: 0,
            refSizeWithDevicePath: 35,
            refSizeWithoutDevicePath: 33,
            mutationMode:
              "insert after start anchor, then preserve original package remainder",
            interpretation:
              "bounded static field flow; actual selected handles, resolved device path and executed navigation unproven",
          };
          record.packageMutationTarget = {
            formSetGuid: targetGuid,
            formId: 1,
            labelGuid,
            labels,
            replacementHelperRva: 13312,
            interpretation:
              "static FormSet/Form match, Ref field flow and insertion with original remainder corroborated; runtime effects unproven",
          };
          record.guidListPublication = {
            guid: protocolGuids.guidList,
            guidBodyOffset: 14868,
            listPointerGlobalRva: 17192,
            installCallRva: 4676,
            uninstallCallRva: 4927,
            selectionCallBeforePublicationRva: 4640,
            interpretation:
              "static publication/unpublication of the list-pointer address; notification execution and selection re-entry unproven",
          };
          record.conditionalPackageUpdate = {
            refBuilderRva: 13092,
            refOpcode: 15,
            updateRoutineRva: 13852,
            exportCallRvas: [13934, 14008],
            formsReplacementCallRva: 14195,
            databaseUpdateCallRva: 14325,
            interpretation:
              "conditional Ref construction and HiiDatabase package-update path; matched form and executed effects unresolved",
          };
          // EFI entry tail-jumps to the wrapper; its browser call returns a reset flag.
          const invocation = traceRva(5336, 489);
          assertAt(initialization, 790, "jmp", "0x14d8");
          assertAt(initialization, 811, "mov", "rax, qword ptr [rdx + 0x58]");
          assertRip(initialization, 838, "mov", "qword ptr [rip + 0x4003], rax", 17232);
          assertAt(invocation, 5336, "mov", "qword ptr [rsp + 8], rbx");
          assertAt(invocation, 5369, "mov", "byte ptr [rbp + 0x18], 0");
          assertAt(invocation, 5715, "lea", "rcx, [rbp + 0x18]");
          assertAt(invocation, 5719, "call", "0x11a4");
          assertAt(invocation, 5730, "js", "0x16b3");
          assertAt(invocation, 5744, "cmp", "byte ptr [rbp + 0x18], 0");
          assertAt(invocation, 5748, "je", "0x168b");
          assertRip(invocation, 5750, "mov", "rax, qword ptr [rip + 0x2cd3]", 17232);
          assertAt(invocation, 5757, "xor", "edx, edx");
          assertAt(invocation, 5759, "xor", "r9d, r9d");
          assertAt(invocation, 5762, "xor", "r8d, r8d");
          assertAt(invocation, 5765, "lea", "ecx, [rdx + 1]");
          assertAt(invocation, 5768, "call", "qword ptr [rax + 0x68]");
          assertAt(invocation, 5824, "ret", "");
          assertAt(browserRoutine, 4542, "mov", "rdi, rcx");
          assertAt(browserRoutine, 4640, "call", "0xb1c");
          assertAt(browserRoutine, 4788, "lea", "rax, [rbp - 8]");
          assertAt(browserRoutine, 4802, "mov", "qword ptr [rsp + 0x30], rax");
          assertAt(browserRoutine, 4826, "cmp", "qword ptr [rbp - 8], 1");
          assertAt(browserRoutine, 4831, "jne", "0x12e4");
          assertAt(browserRoutine, 4833, "mov", "byte ptr [rdi], 1");
          assertAt(browserRoutine, 4974, "ret", "");
          expect(Number(invocation.at(-1)?.address)).toBe(5824);
          expect(Number(browserRoutine.at(-1)?.address)).toBe(4974);
          const directCalls = (instructions, target) =>
            instructions
              .filter(
                (instruction) =>
                  instruction.mnemonic === "call" && instruction.op_str === target,
              )
              .map((instruction) => Number(instruction.address));
          expect(directCalls(invocation, "0x11a4")).toEqual([5719]);
          expect(directCalls(invocation, "0xb1c")).toEqual([]);
          expect(directCalls(browserRoutine, "0xb1c")).toEqual([4640]);
          expect(directCalls(browserRoutine, "0x11a4")).toEqual([]);
          record.invocationFlow = {
            entryTailJumpRva: 790,
            wrapperRva: 5336,
            browserRoutineRva: 4516,
            browserCallRva: 5719,
            selectionCallRva: 4640,
            publicationCallRva: 4676,
            sendFormCallRva: 4824,
            resetRequestValue: 1,
            resetFlagWriteRva: 4833,
            runtimeServicesGlobalRva: 17232,
            resetSystemCallRva: 5768,
            resetType: 1,
            interpretation:
              "bounded entry/wrapper/browser chain selects before publication, then propagates browser reset request to ResetSystem; no second direct selector call in these wrappers, indirect re-entry unproven",
          };
          record.browserPath = {
            browserGuidBodyOffset: browser.offset - file.bodyStart,
            candidateCodeBodyOffset: 4557,
            firstSlotCallRva: 4824,
            handlePreparationCallTargetRva: 2844,
            interpretation:
              "candidate LocateProtocol/SendForm sequence; array/count globals linked to enumeration, database lookup output linked; lookup success, callbacks and runtime conditions unresolved",
          };
        }
        if (name === "LenovoSetupMainDxe") {
          const published = hits.find((hit) => hit.guid === protocolGuids.guidList);
          expect(published?.offset - file.bodyStart).toBe(43900);
          expect(published?.leaByteCandidates.map((at) => at - file.bodyStart)).toEqual(
            [1406, 2426],
          );
          const callback = traceRva(1184, 286);
          const notification = traceRva(2108, 142);
          const entry = traceRva(980, 199);
          expect(
            readUint32(
              node.bytes,
              executable.start +
                executable.headerSize +
                readUint32(
                  node.bytes,
                  executable.start + executable.headerSize + 0x3c,
                ) +
                40,
            ),
          ).toBe(980);
          assertAt(entry, 984, "call", "0x3e8");
          assertAt(entry, 989, "call", "0x688");
          assertAt(entry, 1006, "mov", "rbx, qword ptr [rdx + 0x60]");
          assertRip(entry, 1014, "mov", "qword ptr [rip + 0xb0c3], rbx", 46272);
          assertRip(entry, 1028, "mov", "qword ptr [rip + 0xb0ad], rdx", 46264);
          for (const [rva, displacement] of [
            [1188, "0xb015"],
            [1224, "0xaff1"],
          ])
            assertRip(
              callback,
              rva,
              "mov",
              `rax, qword ptr [rip + ${displacement}]`,
              46272,
            );
          const guardGuid = "B68D09CD-E5D8-49B4-AF9F-419F7A3B5B10";
          expect(readGuid(node.bytes, dataAtRva(35264, 16))).toBe(guardGuid);
          assertAt(callback, 1231, "lea", "r8, [rsp + 0x50]");
          assertAt(callback, 1236, "xor", "edx, edx");
          assertRip(callback, 1238, "lea", "rcx, [rip + 0x84e3]", 35264);
          assertAt(callback, 1245, "call", "qword ptr [rax + 0x140]");
          assertAt(callback, 1254, "js", "0x5b9");
          assertAt(callback, 1260, "xor", "r8d, r8d");
          assertAt(callback, 1263, "lea", "rcx, [rsp + 0x20]");
          assertAt(callback, 1268, "lea", "edx, [r8 + 0xf]");
          assertAt(callback, 1272, "call", "0x2e0");
          const zeroBuffer = traceRva(736, 17);
          assertAt(zeroBuffer, 737, "mov", "rax, r8");
          assertAt(zeroBuffer, 740, "mov", "rdi, rcx");
          assertAt(zeroBuffer, 743, "xchg", "rdx, rcx");
          assertAt(zeroBuffer, 746, "rep stosb", "byte ptr [rdi], al");
          assertAt(callback, 1277, "mov", "rax, qword ptr [rsp + 0x50]");
          assertAt(callback, 1282, "lea", "rcx, [rsp + 0x20]");
          assertAt(callback, 1287, "call", "qword ptr [rax]");
          assertAt(callback, 1292, "js", "0x5b9");
          assertAt(callback, 1298, "cmp", "byte ptr [rsp + 0x20], 0");
          assertAt(callback, 1309, "cmp", "byte ptr [rsp + 0x25], 0");
          assertRip(callback, 1320, "cmp", "byte ptr [rip + 0xb5c9], 0", 47864);
          assertAt(notification, 2117, "mov", "ebx, 8");
          assertAt(notification, 2195, "mov", "edx, ebx");
          assertAt(notification, 2173, "xor", "r9d, r9d");
          assertAt(notification, 2168, "lea", "rax, [rsp + 0x48]");
          assertAt(notification, 2176, "mov", "qword ptr [rsp + 0x20], rax");
          assertAt(notification, 2212, "lea", "r8, [rsp + 0x40]");
          assertAt(notification, 2217, "mov", "rdx, qword ptr [rsp + 0x48]");
          assertAt(notification, 2242, "mov", "rcx, qword ptr [rsp + 0x48]");
          assertAt(notification, 2247, "call", "qword ptr [rax + 0x68]");
          for (const [rva, displacement] of [
            [2188, "0xac2d"],
            [2205, "0xac1c"],
            [2235, "0xabfe"],
          ])
            assertRip(
              notification,
              rva,
              "mov",
              `rax, qword ptr [rip + ${displacement}]`,
              46272,
            );
          record.notificationGuards = {
            bootServicesGlobalRva: 46272,
            systemTableGlobalRva: 46264,
            guardProtocolGuid: guardGuid,
            guardProtocolGuidRva: 35264,
            guardLocateCallRva: 1245,
            guardMethodCallRva: 1287,
            initializedOutputBytes: 15,
            requiredNonzeroByteOffsets: [0, 5],
            eventType: 0x200,
            notifyTpl: 8,
            initialSignalCallRva: 2247,
            interpretation:
              "Boot Services initialization and create/register/explicit signal order corroborated; OEM output semantics, callback delivery and selector re-entry unproven",
          };
          assertAt(callback, 1195, "lea", "r8, [rsp + 0x58]");
          assertAt(callback, 1200, "xor", "edx, edx");
          assertRip(callback, 1202, "lea", "rcx, [rip + 0xa5f7]", 43696);
          assertAt(callback, 1209, "call", "qword ptr [rax + 0x140]");
          assertAt(callback, 1218, "js", "0x5b9");
          assertAt(callback, 1303, "je", "0x5b9");
          assertAt(callback, 1314, "je", "0x5b9");
          assertAt(callback, 1327, "je", "0x5b9");
          assertAt(callback, 1333, "mov", "rax, qword ptr [rsp + 0x58]");
          assertAt(callback, 1359, "mov", "rcx, qword ptr [rax]");
          assertRip(callback, 1338, "mov", "rdx, qword ptr [rip + 0x8e87]", 37832);
          assertRip(callback, 1345, "mov", "r8, qword ptr [rip + 0x8e78]", 37824);
          assertRip(callback, 1352, "mov", "r9, qword ptr [rip + 0xaf11]", 46176);
          assertRip(callback, 1362, "mov", "rax, qword ptr [rip + 0xaf0f]", 46184);
          assertAt(callback, 1378, "je", "0x58c");
          assertAt(callback, 1385, "cmp", "qword ptr [rcx + 8], rax");
          assertAt(callback, 1389, "je", "0x575");
          expect(readGuid(node.bytes, dataAtRva(46176, 16))).toBe(
            "00000000-0000-0000-0000-000000000000",
          );
          const copy = traceRva(640, 60);
          assertAt(copy, 642, "mov", "rsi, rdx");
          assertAt(copy, 645, "mov", "rdi, rcx");
          assertAt(copy, 677, "rep movsq", "qword ptr [rdi], qword ptr [rsi]");
          assertAt(callback, 1391, "add", "rcx, 0x10");
          assertRip(callback, 1397, "lea", "rdx, [rip + 0x8e44]", 37824);
          assertAt(callback, 1409, "mov", "r8d, 0x10");
          assertAt(callback, 1415, "call", "0x280");
          assertAt(notification, 2197, "mov", "ecx, 0x200");
          assertRip(notification, 2181, "lea", "r8, [rip - 0x3ec]", 1184);
          assertAt(notification, 2202, "call", "qword ptr [rax + 0x50]");
          assertRip(notification, 2222, "lea", "rcx, [rip + 0xa1fb]", 43696);
          assertAt(notification, 2229, "call", "qword ptr [rax + 0xa8]");
          const formSet = "821D8B77-246D-4E96-8E10-3467D56AB1BA";
          expect(readGuid(node.bytes, dataAtRva(37824, 16))).toBe(formSet);
          expect(
            hits.some(
              (hit) => hit.guid === formSet && hit.offset - file.bodyStart === 38028,
            ),
          ).toBe(true);
          // The appended target belongs to a different HII module, not this consumer.
          const advanced = inventory.modules.find(
            (module) => module.name === "SystemSetupAdvancedDxe",
          );
          const main = inventory.modules.find(
            (module) => module.bufferId === node.id && module.file.guid === file.guid,
          );
          expect(advanced?.formSetGuids).toEqual([formSet]);
          expect(main?.formSetGuids).toEqual(["1247C8E8-307C-4C6B-8812-CA054F9963F8"]);
          const keyboard = traceRva(1524, 134);
          const keyCallback = traceRva(1472, 51);
          const textInputGuid = "DD9E7534-7762-4698-8C14-F58517A625AA";
          expect(readGuid(node.bytes, dataAtRva(35280, 16))).toBe(textInputGuid);
          assertRip(keyboard, 1545, "lea", "r8, [rip + 0xb4f0]", 47872);
          assertRip(keyboard, 1559, "lea", "rdx, [rip + 0x83b2]", 35280);
          assertAt(keyboard, 1566, "mov", "rcx, qword ptr [rcx + 0x28]");
          assertAt(keyboard, 1570, "call", "qword ptr [rax + 0x98]");
          assertRip(keyboard, 1606, "mov", "rax, qword ptr [rip + 0xb4b3]", 47872);
          assertRip(keyboard, 1613, "lea", "r9, [rip + 0xb4b4]", 47880);
          assertRip(keyboard, 1620, "lea", "r8, [rip - 0x9b]", 1472);
          assertAt(keyboard, 1648, "call", "qword ptr [rax + 0x20]");
          assertRip(keyCallback, 1483, "mov", "byte ptr [rip + 0xb526], 1", 47864);
          assertAt(keyCallback, 1505, "call", "qword ptr [rax + 0x28]");
          assertRip(callback, 1420, "mov", "rax, qword ptr [rip + 0xb56d]", 47872);
          assertRip(callback, 1432, "mov", "rdx, qword ptr [rip + 0xb569]", 47880);
          assertAt(callback, 1447, "call", "qword ptr [rax + 0x28]");
          assertRip(callback, 1458, "mov", "byte ptr [rip + 0xb53f], 0", 47864);
          record.keyboardGate = {
            protocolGuid: textInputGuid,
            interfaceGlobalRva: 47872,
            notifyHandleGlobalRva: 47880,
            gateByteRva: 47864,
            registrationCallRva: 1648,
            keyCallbackRva: 1472,
            unregisterCallRvas: [1505, 1447],
            interpretation:
              "key callback sets the guarded append flag; tail +0x28 matches UnregisterKeyNotify, not selection re-entry",
          };
          record.guidListConsumer = {
            publicationGuid: protocolGuids.guidList,
            publicationGuidBodyOffset: 43900,
            callbackRva: 1184,
            locateCallRva: 1209,
            createEventCallRva: 2202,
            registerNotifyCallRva: 2229,
            formSetGuid: formSet,
            targetModuleName: advanced.name,
            consumerFormSetGuid: main.formSetGuids[0],
            copyCallRva: 1415,
            interpretation:
              "guarded notification callback locates and dereferences the published pointer, then copies a FormSet GUID into the sentinel slot; execution and re-entry unproven",
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
