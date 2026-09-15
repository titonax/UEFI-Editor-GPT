import { describe, expect, it } from "vitest";
import { inspectAmiSetupProfile, reconcileAmiGeneration } from "./amiFirmwareImage";

function reverseHexBytes(value: string) {
  return value.match(/../g)?.reverse().join("") ?? "";
}

function guidBytes(value: string) {
  const parts = value.split("-");
  const encoded =
    reverseHexBytes(parts[0] ?? "") +
    reverseHexBytes(parts[1] ?? "") +
    reverseHexBytes(parts[2] ?? "") +
    (parts[3] ?? "") +
    (parts[4] ?? "");
  return Uint8Array.from(encoded.match(/../g) ?? [], (pair) =>
    Number.parseInt(pair, 16),
  );
}

function formsPackage(guid: string, formId: number) {
  const bytes = new Uint8Array(37);
  bytes.set([37, 0, 0, 0x02], 0);
  bytes.set([0x0e, 0x97], 4);
  bytes.set(guidBytes(guid), 6);
  bytes.set([0x01, 0x86, formId & 0xff, formId >> 8, 0, 0], 27);
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

describe("AMI deep Setup profile inspection", () => {
  it("recognizes the unified Aptio V Setup FormSet profile", () => {
    const report = inspectAmiSetupProfile(
      formsPackage("7B59104A-C00D-4158-87FF-F04D6396A915", 0x2710),
      setupDataProfile(),
    );

    expect(report).toMatchObject({
      spfPresent: true,
      spfField04: 0x200,
      spfField08: 0x210,
      formPackageCount: 1,
      layout: "unified-setup-formset",
      generation: "aptio-v",
      confidence: "probable",
    });
    expect(report.evidence).toContainEqual(
      expect.objectContaining({ code: "spf-profile", supports: "ami-aptio" }),
    );
  });

  it("recognizes the split multi-FormSet Aptio IV profile", () => {
    const first = formsPackage("AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA", 0x400);
    const second = formsPackage("BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB", 0x401);
    const hii = Uint8Array.from([...first, ...second]);

    expect(inspectAmiSetupProfile(hii, setupDataProfile())).toMatchObject({
      formPackageCount: 2,
      layout: "split-form-packages",
      generation: "aptio-iv",
      confidence: "probable",
    });
  });

  it("leaves an unknown single FormSet unresolved", () => {
    expect(
      inspectAmiSetupProfile(formsPackage("AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA", 1)),
    ).toMatchObject({
      spfPresent: false,
      formPackageCount: 1,
      layout: "unresolved",
      generation: "unresolved",
      confidence: "unresolved",
    });
  });

  it("does not hide a conflict between outer metadata and the deep HII profile", () => {
    expect(
      reconcileAmiGeneration(
        { generation: "aptio-iv", confidence: "probable" },
        { generation: "aptio-v", confidence: "probable" },
      ),
    ).toEqual({
      generation: "unresolved",
      confidence: "unresolved",
      conflict: true,
    });
  });
});
