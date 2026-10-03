import { describe, expect, it } from "vitest";
import { inspectAmiFirmwareBytes } from "../components/scripts/amiFirmwareImage";
import { createFirmwareFingerprint, fingerprintFirmwareImage } from "./fingerprint";

describe("firmware fingerprints", () => {
  it("normalizes hashes and canonicalizes field order without using filenames", () => {
    const first = createFirmwareFingerprint({
      sha256: "AB".repeat(32),
      structure: {
        firmwareVolumeCount: 5,
        family: "ami-aptio",
        intelDescriptor: false,
      },
    });
    const second = createFirmwareFingerprint({
      sha256: "cd".repeat(32),
      size: 1024,
      structure: {
        intelDescriptor: false,
        family: "ami-aptio",
        firmwareVolumeCount: 5,
      },
    });
    expect(first.sha256).toBe("ab".repeat(32));
    expect(first.structuralKey).toBe(second.structuralKey);
    expect(first.structure).toEqual(second.structure);
    expect(first.size).toBeNull();
  });

  it("preserves zero/false observations while omitting unmeasured classifications", () => {
    const result = createFirmwareFingerprint({
      structure: {
        family: "uefi-unidentified",
        container: "unknown",
        layout: "unresolved",
        navigation: "menu-evidence-only",
        intelDescriptor: false,
        outerSetupCount: 0,
      },
    });
    expect(result.structure).toEqual({ intelDescriptor: false, outerSetupCount: 0 });
    expect(result.structuralKey).not.toBe(createFirmwareFingerprint({}).structuralKey);
    expect(
      createFirmwareFingerprint({ structure: { family: "unidentified" } }).structure,
    ).toEqual({});
    expect(
      createFirmwareFingerprint({ structure: { navigation: "unresolved" } }).structure,
    ).toEqual({});
  });

  it.each(["not-a-hash", "a".repeat(63), "g".repeat(64)])(
    "rejects malformed identity %s",
    (sha256) => {
      expect(() => createFirmwareFingerprint({ sha256 })).toThrow(/SHA-256/);
    },
  );

  it.each([-1, 0, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid input size %s",
    (size) => {
      expect(() => createFirmwareFingerprint({ size })).toThrow(/size/);
    },
  );

  it.each([-1, NaN, Infinity, 0.5])("rejects invalid structural count %s", (count) => {
    expect(() =>
      createFirmwareFingerprint({ structure: { formCount: count } }),
    ).toThrow(/count/);
  });

  it("copies measurements without changing the caller's structure", () => {
    const structure = { firmwareVolumeCount: 5 };
    const fingerprint = createFirmwareFingerprint({ structure, sha256: "" });
    structure.firmwareVolumeCount = 7;
    expect(fingerprint.structure.firmwareVolumeCount).toBe(5);
    expect(fingerprint.sha256).toBeNull();
  });

  it("keeps legacy identification separate from absent UEFI/HII measurements", () => {
    const bytes = new Uint8Array(0x20000).fill(0xff);
    bytes.set(new TextEncoder().encode("AMIBIOSC0800"), 0x17fea);
    bytes.set(new TextEncoder().encode("AMIBOOT ROM"), 0x1804c);
    bytes.set([0xea, 0xaa, 0xff, 0x00, 0xf0], bytes.length - 16);
    const report = inspectAmiFirmwareBytes(bytes);
    const result = fingerprintFirmwareImage(report);
    expect(result.structure).toMatchObject({
      family: "ami-legacy",
      container: "ami-legacy-rom",
      firmwareVolumeCount: 0,
      outerSetupCount: 0,
      outerAmitseCount: 0,
    });
    expect(result.structure).not.toHaveProperty("formCount");
    expect(result.structure).not.toHaveProperty("legacyModuleCount");
    expect(result.structure).not.toHaveProperty("navigation");
  });

  it("does not promote weak or conflicting vendor evidence to family proof", () => {
    const report = inspectAmiFirmwareBytes(new TextEncoder().encode("PhoenixBIOS"));
    expect(fingerprintFirmwareImage(report).structure).not.toHaveProperty("family");
    report.family = { ...report.family, confidence: "confirmed", conflict: true };
    expect(fingerprintFirmwareImage(report).structure).not.toHaveProperty("family");
  });
});
