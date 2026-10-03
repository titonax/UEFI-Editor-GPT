import { describe, expect, it } from "vitest";
import { matchFirmwareCases } from "./caseMatcher";
import { firmwareCases } from "./cases";
import { createFirmwareFingerprint } from "./fingerprint";
import type { FirmwareCase, FirmwareStructure } from "./schema";

function nestedFirmwareCase() {
  const entry = firmwareCases.find((entry) => entry.id === "ami-image2-nested-lzma");
  if (!entry) throw new Error("Missing nested firmware regression case");
  return entry;
}

const nestedCase = nestedFirmwareCase();
const knownStructure: FirmwareStructure = {
  family: "ami-aptio",
  container: "intel-flash",
  intelDescriptor: true,
  firmwareVolumeCount: 12,
  outerSetupCount: 0,
};

describe("case matching as investigation evidence", () => {
  it("recognizes all documented hashes regardless of filename or unmeasured fields", () => {
    for (const entry of firmwareCases) {
      const result = matchFirmwareCases(
        createFirmwareFingerprint({ sha256: entry.sha256.toUpperCase() }),
      );
      expect(result.status, entry.id).toBe("known");
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]).toMatchObject({
        caseId: entry.id,
        basis: "exact-sha256",
        matchedFields: [],
        conflictingFields: [],
      });
      expect(result.matches[0].missingFields.length).toBeGreaterThan(0);
    }
  });

  it("reports a partial structural lead for another hash and a different image size", () => {
    const result = matchFirmwareCases(
      createFirmwareFingerprint({
        sha256: "aa".repeat(32),
        size: nestedCase.size / 2,
        structure: knownStructure,
      }),
    );
    expect(result.status).toBe("similar");
    expect(result.matches).toEqual([
      expect.objectContaining({
        caseId: nestedCase.id,
        basis: "structural-similarity",
        missingFields: ["ffs2VolumeCount", "ffs3VolumeCount", "guidedLzmaSectionCount"],
        conflictingFields: [],
      }),
    ]);
    expect(result).not.toHaveProperty("writeEnabled");
  });

  it("keeps a zero count distinct from an unmeasured field", () => {
    const result = matchFirmwareCases(
      createFirmwareFingerprint({
        structure: { ...knownStructure, outerSetupCount: 1 },
      }),
      [nestedCase],
    );
    expect(result.status).toBe("novel");
    expect(result.matches).toEqual([]);
  });

  it("reports size and structural contradictions even for a documented hash", () => {
    const result = matchFirmwareCases(
      createFirmwareFingerprint({
        sha256: nestedCase.sha256,
        size: 1024,
        structure: { family: "award", firmwareVolumeCount: 0 },
      }),
    );
    expect(result.status).toBe("conflict");
    expect(result.matches[0].conflictingFields).toEqual([
      "family",
      "firmwareVolumeCount",
      "size",
    ]);
    expect(result.matches[0].basis).toBe("exact-sha256");
  });

  it("retains ambiguity rather than choosing the first equal structural lead", () => {
    const other: FirmwareCase = {
      ...nestedCase,
      id: "another-case",
      sha256: "bb".repeat(32),
    };
    const fingerprint = createFirmwareFingerprint({ structure: knownStructure });
    const forward = matchFirmwareCases(fingerprint, [nestedCase, other]);
    const reversed = matchFirmwareCases(fingerprint, [other, nestedCase]);
    expect(forward).toEqual(reversed);
    expect(forward.status).toBe("similar");
    expect(forward.matches).toHaveLength(2);
  });

  it("treats duplicate exact identities in a supplied catalogue as a conflict", () => {
    const result = matchFirmwareCases(
      createFirmwareFingerprint({ sha256: nestedCase.sha256 }),
      [nestedCase, { ...nestedCase, id: "duplicate" }],
    );
    expect(result.status).toBe("conflict");
    expect(result.matches).toHaveLength(2);
  });

  it("does not claim novelty or similarity from generic evidence or a new hash alone", () => {
    for (const structure of [
      {},
      { family: "ami-aptio", container: "intel-flash", intelDescriptor: true },
      { firmwareVolumeCount: 12 },
    ] as FirmwareStructure[]) {
      expect(
        matchFirmwareCases(
          createFirmwareFingerprint({ sha256: "cc".repeat(32), structure }),
        ),
      ).toMatchObject({ status: "insufficient-evidence", matches: [] });
    }
  });

  it("requires enough overlapping observations in a sparsely documented case", () => {
    const sparse: FirmwareCase = { ...nestedCase, structure: { family: "ami-aptio" } };
    expect(
      matchFirmwareCases(createFirmwareFingerprint({ structure: knownStructure }), [
        sparse,
      ]),
    ).toMatchObject({ status: "novel", matches: [] });
  });

  it("ignores a forged canonical key and leaves input and catalogue unchanged", () => {
    const fingerprint = createFirmwareFingerprint({ structure: knownStructure });
    fingerprint.structuralKey = "forged-key";
    const before = JSON.stringify({ fingerprint, firmwareCases });
    expect(matchFirmwareCases(fingerprint).status).toBe("similar");
    expect(JSON.stringify({ fingerprint, firmwareCases })).toBe(before);
  });

  it("rejects a fingerprint from an unsupported schema", () => {
    const fingerprint = createFirmwareFingerprint({});
    Object.assign(fingerprint, { schemaVersion: "99.0.0" });
    expect(() => matchFirmwareCases(fingerprint)).toThrow(/version/);
  });
});
