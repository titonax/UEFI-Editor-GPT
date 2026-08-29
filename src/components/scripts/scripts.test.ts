import { describe, expect, it } from "vitest";
import type { PopulatedFiles } from "../FileUploads/fileModel";
import { hashFile } from "./checksum";
import { dataSchemaVersion, parseData } from "./scripts";

function binaryFile(content: string | Uint8Array, name: string): File {
  const bytes =
    typeof content === "string" ? new TextEncoder().encode(content) : content;
  return {
    name,
    arrayBuffer: () => Promise.resolve(bytes.slice().buffer),
  } as File;
}

function container(file: File, textContent: string) {
  return { file, textContent, isWrongFile: false };
}

describe("data-model assembly", () => {
  it("validates the extractor output and assembles parsed data", async () => {
    const setupSctFile = binaryFile(new Uint8Array(), "setup.sct");
    const setupSctHash = await hashFile(setupSctFile);
    const setupTxt = [
      "Program version: 1.6.1",
      "Extraction mode: UEFI",
      `SHA256: ${setupSctHash}`,
      '0x000: FormSet Guid: AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE, Title: "Setup", Help: "" { 0E 82 }',
      '0x010:\tForm FormId: 0x1, Title: "Main" { 01 82 }',
      "0x020:\t{ 29 02 }",
    ].join("\n");
    const files: PopulatedFiles = {
      setupSctContainer: container(setupSctFile, ""),
      setupTxtContainer: container(binaryFile(setupTxt, "setup.txt"), setupTxt),
      amitseSctContainer: container(binaryFile("", "amitse.sct"), ""),
      setupdataBinContainer: container(binaryFile("", "setupdata.bin"), ""),
    };

    const data = await parseData(files);
    expect(data.version).toBe(dataSchemaVersion);
    expect(data.forms).toEqual([
      expect.objectContaining({ name: "Main", formId: "0x1" }),
    ]);
    expect(data.menu).toEqual([
      expect.objectContaining({ name: "Setup", source: "formset" }),
    ]);
    expect(data.hashes.setupSct).toBe(setupSctHash);
  });

  it("rejects incompatible extractor output before parsing", async () => {
    const empty = binaryFile("", "empty.bin");
    const files: PopulatedFiles = {
      setupSctContainer: container(empty, ""),
      setupTxtContainer: container(binaryFile("invalid", "setup.txt"), "invalid"),
      amitseSctContainer: container(empty, ""),
      setupdataBinContainer: container(empty, ""),
    };

    await expect(parseData(files)).rejects.toThrow(/Wrong IFRExtractor-RS version/);
  });
});
