import { describe, expect, it } from "vitest";
import { findPeGuidEvidence, readPeEvidenceSections } from "./peGuidEvidence";

const guid = "12345678-9ABC-DEF0-1122-334455667788";
const encoded = [
  0x78, 0x56, 0x34, 0x12, 0xbc, 0x9a, 0xf0, 0xde, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66,
  0x77, 0x88,
];
function fixture() {
  const bytes = new Uint8Array(1024);
  const view = new DataView(bytes.buffer);
  bytes.set([0x4d, 0x5a]);
  view.setUint32(60, 64, true);
  view.setUint32(64, 0x4550, true);
  view.setUint16(68, 0x8664, true);
  view.setUint16(70, 2, true);
  view.setUint16(84, 112, true);
  view.setUint16(88, 0x20b, true);
  const table = 200;
  for (const [index, name] of [".text", ".data"].entries()) {
    const at = table + index * 40;
    bytes.set(
      Array.from(name, (c) => c.charCodeAt(0)),
      at,
    );
    view.setUint32(at + 12, index === 0 ? 0x1000 : 0x8000, true);
    view.setUint32(at + 16, 128, true);
    view.setUint32(at + 20, 512 + index * 128, true);
    view.setUint32(at + 36, index === 0 ? 0x20000000 : 0x40000000, true);
  }
  bytes.set(encoded, 656);
  bytes.set([0x48, 0x8d, 0x05], 520);
  view.setInt32(523, 0x8010 - (0x1008 + 7), true);
  return { bytes, view };
}
describe("read-only PE GUID research evidence", () => {
  it("rejects contradictory externally supplied mappings before scanning", () => {
    const { bytes } = fixture();
    const sections = readPeEvidenceSections(bytes, 0, bytes.length);
    expect(() => findPeGuidEvidence(bytes, [sections[0], sections[0]], [guid])).toThrow(
      "Ambiguous",
    );
    expect(() =>
      findPeGuidEvidence(bytes, [{ ...sections[0], rva: 0.5 }], [guid]),
    ).toThrow("bounds");
    expect(() =>
      findPeGuidEvidence(bytes, [{ ...sections[0], end: sections[0].start }], [guid]),
    ).toThrow("bounds");
  });

  it("uses PE RVAs rather than raw offsets and reports candidates without call semantics", () => {
    const { bytes } = fixture();
    const original = bytes.slice();
    const sections = readPeEvidenceSections(bytes, 0, bytes.length);
    expect(sections).toHaveLength(2);
    expect(findPeGuidEvidence(bytes, sections, [guid.toLowerCase(), guid])).toEqual([
      { guid, offset: 656, sectionName: ".data", leaByteCandidates: [520] },
    ]);
    expect(bytes).toEqual(original);
  });
  it("supports an enclosing byte buffer and signed backward displacements", () => {
    const { bytes, view } = fixture();
    view.setUint32(212, 0x8000, true);
    view.setUint32(252, 0x1000, true);
    view.setInt32(523, 0x1010 - (0x8008 + 7), true);
    const outer = new Uint8Array(1200);
    outer.set(bytes, 32);
    expect(
      findPeGuidEvidence(outer, readPeEvidenceSections(outer, 32, 1056), [guid])[0]
        .leaByteCandidates,
    ).toEqual([552]);
  });
  it.each([
    "dos",
    "pe",
    "machine",
    "optional",
    "count",
    "optional-bounds",
    "raw-bounds",
    "raw-overlap",
    "rva-overlap",
    "rva-overflow",
  ])("rejects malformed %s layouts", (kind) => {
    const { bytes, view } = fixture();
    if (kind === "dos") bytes[0] = 0;
    if (kind === "pe") view.setUint32(60, 1000, true);
    if (kind === "machine") view.setUint16(68, 0x14c, true);
    if (kind === "optional") view.setUint16(88, 0x10b, true);
    if (kind === "count") view.setUint16(70, 97, true);
    if (kind === "optional-bounds") view.setUint16(84, 1000, true);
    if (kind === "raw-bounds") view.setUint32(220, 980, true);
    if (kind === "raw-overlap") view.setUint32(260, 520, true);
    if (kind === "rva-overlap") view.setUint32(252, 0x1008, true);
    if (kind === "rva-overflow") view.setUint32(212, 0xfffffff0, true);
    expect(readPeEvidenceSections(bytes, 0, bytes.length)).toEqual([]);
  });
  it("excludes header GUIDs, incomplete GUIDs and LEAs outside executable sections", () => {
    const { bytes, view } = fixture();
    bytes.fill(0, 656, 672);
    bytes.set(encoded, 300);
    bytes.set(encoded, 768 - 8);
    bytes.set([0x48, 0x8d, 0x05], 680);
    view.setInt32(683, 0x8010 - (0x8028 + 7), true);
    expect(
      findPeGuidEvidence(bytes, readPeEvidenceSections(bytes, 0, bytes.length), [guid]),
    ).toEqual([]);
  });
  it("retains unreferenced GUIDs and ignores truncated or non-RIP LEAs", () => {
    const { bytes } = fixture();
    bytes[522] = 0xc0;
    bytes.set([0x48, 0x8d, 0x05], 635);
    expect(
      findPeGuidEvidence(bytes, readPeEvidenceSections(bytes, 0, bytes.length), [
        guid,
      ])[0].leaByteCandidates,
    ).toEqual([]);
  });
  it("handles no raw sections and rejects invalid external bounds and GUID syntax", () => {
    const { bytes, view } = fixture();
    view.setUint32(216, 0, true);
    view.setUint32(256, 0, true);
    expect(readPeEvidenceSections(bytes, 0, bytes.length)).toEqual([]);
    expect(readPeEvidenceSections(bytes, -1, bytes.length)).toEqual([]);
    expect(readPeEvidenceSections(bytes, 0, 2000)).toEqual([]);
    expect(readPeEvidenceSections(bytes, 0.5, bytes.length)).toEqual([]);
    expect(() => findPeGuidEvidence(bytes, [], ["bad"])).toThrow("Invalid GUID");
    expect(() =>
      findPeGuidEvidence(
        bytes,
        [{ name: "bad", start: -1, end: 32, rva: 0, executable: true }],
        [guid],
      ),
    ).toThrow("bounds");
  });
});
