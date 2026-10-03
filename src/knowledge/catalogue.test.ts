import { describe, expect, it } from "vitest";
import { classifyBrand } from "../components/scripts/brandKnowledge";
import { firmwareCases } from "./cases";
import { createFirmwareFingerprint } from "./fingerprint";

const sourceRecords = import.meta.glob("/docs/**/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
});
const regressionFiles = import.meta.glob("/src/**/*.test.ts");

function caseById(id: string) {
  const entry = firmwareCases.find((entry) => entry.id === id);
  if (!entry) throw new Error(`Missing firmware case: ${id}`);
  return entry;
}

describe("reviewed firmware case records", () => {
  it("has unique stable IDs and exact input hashes, with explicit limitations", () => {
    expect(firmwareCases.length).toBeGreaterThanOrEqual(17);
    expect(new Set(firmwareCases.map((entry) => entry.id)).size).toBe(
      firmwareCases.length,
    );
    expect(new Set(firmwareCases.map((entry) => entry.sha256)).size).toBe(
      firmwareCases.length,
    );
    for (const entry of firmwareCases) {
      expect(entry.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(entry.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(entry.fileNames.length).toBeGreaterThan(0);
      expect(entry.limitations.length).toBeGreaterThan(0);
      expect(() => createFirmwareFingerprint(entry)).not.toThrow();
    }
  });

  it("links every identity to a source record containing its hash and existing tests", () => {
    for (const entry of firmwareCases) {
      expect(entry.source).toMatch(/^docs\/.+\.md$/);
      const source = sourceRecords[`/${entry.source}`];
      if (typeof source !== "string")
        throw new Error(`Missing source: ${entry.source}`);
      expect(source.toLowerCase(), entry.id).toContain(entry.sha256);
      expect(entry.regressionTests.length).toBeGreaterThan(0);
      for (const path of entry.regressionTests) {
        expect(path).toMatch(/^src\/.+\.test\.ts$/);
        expect(`/${path}` in regressionFiles, `${entry.id}: ${path}`).toBe(true);
      }
    }
  });

  it("preserves all 15 existing brand identities and does not turn probable V into proof", () => {
    const branded = firmwareCases.filter((entry) => entry.brand);
    expect(branded.length).toBeGreaterThanOrEqual(15);
    for (const entry of branded) {
      expect(classifyBrand("renamed.bin", entry.sha256, []).brand).toBe(entry.brand);
    }
    const intel = caseById("intel-nuc10i5fnh-0067");
    expect(intel.generation?.confidence).toBe("probable");
    expect(classifyBrand("renamed.bin", intel.sha256, []).observedGenerations).toEqual(
      [],
    );
  });

  it("records byte-identical image2/image3 as one identity without guessing a brand", () => {
    const nested = caseById("ami-image2-nested-lzma");
    expect(nested.fileNames).toEqual(["image2.bin", "image3.bin"]);
    expect(nested.generation).toBeUndefined();
    expect(nested.brand).toBeUndefined();
  });
});
