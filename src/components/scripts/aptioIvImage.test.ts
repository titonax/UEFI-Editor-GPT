import { describe, expect, it } from "vitest";
import { inspectAmiFirmwareBytes } from "./amiFirmwareImage";

function validFirmwareVolumeImage(...payloads: { offset: number; bytes: number[] }[]) {
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
  bytes.set(
    [
      0xd7, 0x07, 0x94, 0x89, 0xfe, 0x99, 0xd8, 0x43, 0x9a, 0x21, 0x79, 0xec, 0x32,
      0x8c, 0xac, 0x21,
    ],
    0x40,
  );
  bytes.set(new TextEncoder().encode("AMITSESetup"), 0x58);
  for (const payload of payloads) bytes.set(payload.bytes, payload.offset);

  let checksum = 0;
  for (let offset = 0; offset < 0x38; offset += 2) {
    checksum = (checksum + view.getUint16(offset, true)) & 0xffff;
  }
  view.setUint16(0x32, -checksum & 0xffff, true);
  return bytes;
}

describe("AMI firmware image inspection", () => {
  it("detects AMI evidence without pretending that shared GUIDs prove IV", () => {
    const report = inspectAmiFirmwareBytes(validFirmwareVolumeImage());

    expect(report.firmwareVolumes).toEqual([0]);
    expect(report.ffs2Volumes).toEqual([0]);
    expect(report.setupFfs).toEqual([0x40]);
    expect(report.amiAptioCandidate).toBe(true);
    expect(report.generation).toBe("unresolved");
    expect(report.confidence).toBe("unresolved");
  });

  it("accepts an explicit Aptio V marker as probable evidence", () => {
    const report = inspectAmiFirmwareBytes(
      validFirmwareVolumeImage({
        offset: 0x80,
        bytes: [...new TextEncoder().encode("Aptio V")],
      }),
    );

    expect(report.generation).toBe("aptio-v");
    expect(report.confidence).toBe("probable");
  });

  it("treats the $SPF SetupData combination as shared AMI evidence", () => {
    const report = inspectAmiFirmwareBytes(
      validFirmwareVolumeImage(
        { offset: 0x80, bytes: [...new TextEncoder().encode("$SPF")] },
        {
          offset: 0x90,
          bytes: [
            0x72, 0x2b, 0x61, 0xfe, 0x3c, 0x20, 0xb1, 0x47, 0x85, 0x60, 0xa6, 0x6d,
            0x94, 0x6e, 0xb3, 0x71,
          ],
        },
      ),
    );

    expect(report.generation).toBe("unresolved");
    expect(report.confidence).toBe("unresolved");
    expect(report.evidence).toContainEqual(
      expect.objectContaining({
        code: "spf-profile",
        supports: "ami-aptio",
        strength: "strong",
      }),
    );
  });

  it("rejects signature-shaped data with an invalid FV checksum", () => {
    const bytes = validFirmwareVolumeImage();
    bytes[0] = 1;

    const report = inspectAmiFirmwareBytes(bytes);
    expect(report.firmwareVolumes).toEqual([]);
  });

  it("marks GUID-defined LZMA nesting for the deep HII scan", () => {
    const bytes = validFirmwareVolumeImage({
      offset: 0x7c,
      bytes: [
        0x28, 0x00, 0x00, 0x02, 0x98, 0x58, 0x4e, 0xee, 0x14, 0x39, 0x59, 0x42, 0x9d,
        0x6e, 0xdc, 0x7b, 0xd7, 0x94, 0x03, 0xcf, 0x18, 0x00, 0x01, 0x00, 0x5d, 0x00,
        0x00, 0x80, 0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00,
        0x00,
      ],
    });
    bytes.fill(0, 0x40, 0x50);

    const report = inspectAmiFirmwareBytes(bytes);

    expect(report.guidedLzmaSections).toEqual([0x7c]);
    expect(report.deepScanRequired).toBe(true);
    expect(report.evidence.some((entry) => entry.code === "guided-lzma")).toBe(true);
  });
});
