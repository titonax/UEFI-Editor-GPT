import { describe, expect, it } from "vitest";
import { analyzeIfrBinary } from "./ifrBinary";
import type { UefiHiiModule } from "./uefiHiiDiscovery";
import {
  assertUefiHiiOwnedPackageChanges,
  createUefiHiiOwnedPackageView,
} from "./uefiHiiOwnership";

function packageBytes(marker: number) {
  const bytes = new Uint8Array(4 + 23 + 6 + 4);
  bytes.set([bytes.length, 0, 0, 2, 0x0e, 0x97]);
  bytes.fill(marker, 6, 22);
  bytes.set([1, 0x86, marker, 0, 1, 0, 0x29, 2, 0x29, 2], 27);
  return bytes;
}

function moduleFixture() {
  const bytes = new Uint8Array(256).fill(0xaa);
  bytes.set(packageBytes(1), 16);
  bytes.set(packageBytes(2), 128);
  // Direct string evidence stays readable; nested strings must be masked too.
  bytes.set(new TextEncoder().encode("Direct title"), 64);
  bytes.set(new TextEncoder().encode("Nested title"), 192);
  const packages = analyzeIfrBinary(bytes).packages.filter((pkg) => pkg.valid);
  expect(packages).toHaveLength(2);
  const module: UefiHiiModule = {
    id: "mixed",
    bufferId: 0,
    duplicateBufferIds: [],
    depth: 0,
    file: {
      bufferId: 0,
      guid: "fixture",
      volumeStart: 0,
      volumeEnd: 280,
      fileStart: 0,
      bodyStart: 24,
      end: 280,
      headerSize: 24,
      depth: 0,
      fileType: 7,
      sectionTypes: [0x10, 3],
      uiNames: [],
    },
    name: "SetupCarrier",
    bytes,
    packages: [packages[0]],
    formSetGuids: ["01010101-0101-0101-0101-010101010101"],
    formCount: 1,
    referenceCount: 0,
    ownership: "mixed-direct-nested",
    nestedPayloadRanges: [{ offset: 112, end: 224 }],
  };
  return module;
}

describe("owned HII package analysis and edit boundaries", () => {
  it("masks the nested payload and strings without changing offsets or original bytes", () => {
    const module = moduleFixture();
    const original = module.bytes.slice();
    const view = createUefiHiiOwnedPackageView(module);
    expect(view.bytes).toHaveLength(original.length);
    expect(view.bytes).not.toBe(module.bytes);
    expect(module.bytes).toEqual(original);
    expect(view.ownedPackages).toEqual([{ offset: 16, end: 53 }]);
    const reread = analyzeIfrBinary(view.bytes);
    expect(reread.diagnostics).toEqual([]);
    expect(reread.packages).toHaveLength(1);
    expect(reread.packages[0]).toEqual(module.packages[0]);
    expect(view.bytes.slice(112, 224)).toEqual(new Uint8Array(112));
    expect(view.bytes.slice(0, 112)).toEqual(original.slice(0, 112));
    expect(view.bytes.slice(224)).toEqual(original.slice(224));
  });

  it("omits other Forms Packages even when no nested envelope is supplied", () => {
    const module = moduleFixture();
    delete module.nestedPayloadRanges;
    const view = createUefiHiiOwnedPackageView(module);
    expect(analyzeIfrBinary(view.bytes).packages).toHaveLength(1);
    expect(view.bytes.slice(128, 165)).toEqual(new Uint8Array(37));
    expect(view.bytes.slice(192, 204)).toEqual(module.bytes.slice(192, 204));
  });

  it("keeps independently owned ordinary modules byte-identical in their view", () => {
    const module = moduleFixture();
    module.packages = analyzeIfrBinary(module.bytes).packages;
    delete module.nestedPayloadRanges;
    delete module.ownership;
    expect(createUefiHiiOwnedPackageView(module).bytes).toEqual(module.bytes);
  });

  it.each([
    "negative",
    "fraction",
    "oversized",
    "reversed",
    "overlap",
    "owned-overlap",
  ])("rejects a %s nested envelope without mutating evidence", (problem) => {
    const module = moduleFixture();
    const original = module.bytes.slice();
    module.nestedPayloadRanges =
      problem === "negative"
        ? [{ offset: -1, end: 224 }]
        : problem === "fraction"
          ? [{ offset: 112.5, end: 224 }]
          : problem === "oversized"
            ? [{ offset: 112, end: 257 }]
            : problem === "reversed"
              ? [{ offset: 224, end: 112 }]
              : problem === "overlap"
                ? [
                    { offset: 112, end: 224 },
                    { offset: 120, end: 200 },
                  ]
                : [{ offset: 32, end: 224 }];
    expect(() => createUefiHiiOwnedPackageView(module)).toThrow(/overlap|invalid/);
    expect(module.bytes).toEqual(original);
  });

  it.each(["empty", "stale", "duplicate", "invalid-source"])(
    "rejects %s owned-package claims",
    (problem) => {
      const module = moduleFixture();
      if (problem === "empty") module.packages = [];
      if (problem === "stale") module.packages[0].end++;
      if (problem === "duplicate") module.packages.push(module.packages[0]);
      if (problem === "invalid-source") module.bytes[19] = 0;
      expect(() => createUefiHiiOwnedPackageView(module)).toThrow(/boundaries|overlap/);
    },
  );

  it("allows changed bytes inside several declared packages in their original body", () => {
    const module = moduleFixture();
    const changed = module.bytes.slice();
    changed[30] ^= 1;
    changed[140] ^= 1;
    const ranges = analyzeIfrBinary(module.bytes).packages.map(({ offset, end }) => ({
      offset,
      end,
    }));
    expect(() => {
      assertUefiHiiOwnedPackageChanges(module.bytes, changed, ranges);
    }).not.toThrow();
  });

  it.each([0, 15, 53, 64, 112, 140, 192, 255])(
    "rejects a changed non-owned byte at %s, including nested HII and strings",
    (offset) => {
      const module = moduleFixture();
      const changed = module.bytes.slice();
      changed[offset] ^= 1;
      expect(() => {
        assertUefiHiiOwnedPackageChanges(module.bytes, changed, [
          { offset: 16, end: 53 },
        ]);
      }).toThrow(/outside the owned HII packages/);
    },
  );

  it("rejects body resizing even when package boundaries remain valid", () => {
    const module = moduleFixture();
    expect(() => {
      assertUefiHiiOwnedPackageChanges(module.bytes, module.bytes.slice(0, 255), [
        { offset: 16, end: 53 },
      ]);
    }).toThrow(/changed length/);
  });

  it("derives valid package boundaries when range metadata is absent", () => {
    const module = moduleFixture();
    const modified = module.bytes.slice();
    modified[30] ^= 1;
    expect(() => {
      assertUefiHiiOwnedPackageChanges(module.bytes, modified);
    }).not.toThrow();
    modified[64] ^= 1;
    expect(() => {
      assertUefiHiiOwnedPackageChanges(module.bytes, modified);
    }).toThrow(/outside the owned HII packages/);
  });
});
