import { describe, expect, it } from "vitest";
import {
  discoverSetupDataMenu,
  findVarStoreName,
  getAdditionalData,
  indexSetupData,
} from "./setupData";

describe("SetupData discovery", () => {
  it("recognizes a contiguous page list and records its masks and offsets", () => {
    const root = {
      name: "Setup",
      formId: "0x1",
      offset: null,
      formSetGuid: "00112233-4455-6677-8899-AABBCCDDEEFF",
      source: "formset" as const,
    };
    const encodedGuid = "33221100554477668899AABBCCDDEEFF";
    const setupData =
      `01000000${encodedGuid}` + `02000000${encodedGuid}` + `04000000${encodedGuid}`;

    expect(discoverSetupDataMenu([root], setupData)).toEqual([
      {
        ...root,
        offset: null,
        source: "setupdata",
        pageMask: "0x1",
        pageInfoOffset: "0x0",
      },
      {
        ...root,
        offset: null,
        source: "setupdata",
        pageMask: "0x2",
        pageInfoOffset: "0x14",
      },
      {
        ...root,
        offset: null,
        source: "setupdata",
        pageMask: "0x4",
        pageInfoOffset: "0x28",
      },
    ]);
  });

  it("keeps a complete OEM and AMI page list with non-bitmask selectors", () => {
    const selectors = [
      0x00, 0x40, 0x50, 0x60, 0x70, 0x80, 0x02, 0x08, 0x04, 0x20, 0x01,
    ];
    const roots = selectors.map((_, index) => ({
      name: `Root ${String(index)}`,
      formId: `0x${(0x400 + index).toString(16).toUpperCase()}`,
      offset: null,
      formSetGuid: `${(index + 1).toString(16).padStart(8, "0")}-1111-2222-3333-${(index + 1).toString(16).padStart(12, "0")}`,
      source: "formset" as const,
    }));
    const reverseBytes = (value: string) =>
      value.match(/../g)?.reverse().join("") ?? "";
    const encodeGuid = (value: string) => {
      const parts = value.split("-");
      return (
        reverseBytes(parts[0]) +
        reverseBytes(parts[1]) +
        reverseBytes(parts[2]) +
        parts[3] +
        parts[4]
      );
    };
    const encodeUint32 = (value: number) =>
      reverseBytes(value.toString(16).padStart(8, "0"));
    const setupData = roots
      .map(
        (entry, index) =>
          encodeUint32(selectors[index]) + encodeGuid(entry.formSetGuid),
      )
      .join("")
      .toLowerCase();

    const discovered = discoverSetupDataMenu(roots, setupData);
    expect(discovered).toHaveLength(11);
    expect(discovered.map((entry) => entry.pageMask)).toEqual(
      selectors.map((value) => `0x${value.toString(16).toUpperCase()}`),
    );
    expect(discovered.every((entry) => entry.source === "setupdata")).toBe(true);
  });

  it("prefers the var store in the current form set", () => {
    const stores = [
      { varStoreId: "0x1", size: "4", name: "Other", formSetGuid: "B" },
      { varStoreId: "1", size: "4", name: "Setup", formSetGuid: "A" },
    ];
    expect(findVarStoreName(stores, "0x1", "A")).toBe("Setup");
  });

  it("indexes question metadata once and resolves an unaligned unique record", () => {
    const record = new Uint8Array(3 + 54);
    record.set([0xee, 0xff], 3);
    record.set([0x12, 0x34], 3 + 12);
    record[3 + 16] = 0x05;
    record.set([0xcc, 0xdd], 3 + 20);
    record.set([0xaa, 0xbb], 3 + 48);
    record[3 + 52] = 0x01;
    record[3 + 53] = 0x02;
    const setupData = Array.from(record, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");

    expect(
      getAdditionalData("00 00 AA BB CC DD EE FF", indexSetupData(setupData), true),
    ).toEqual({
      pageId: "1234",
      accessLevel: "05",
      failsafe: "01",
      optimal: "02",
      offsets: {
        pageId: "0xF",
        accessLevel: "0x13",
        failsafe: "0x37",
        optimal: "0x38",
      },
    });
  });

  it("keeps duplicate question metadata ambiguous", () => {
    const record = new Uint8Array(54);
    record.set([0xee, 0xff], 0);
    record.set([0xcc, 0xdd], 20);
    record.set([0xaa, 0xbb], 48);
    const bytes = new Uint8Array(108);
    bytes.set(record, 0);
    bytes.set(record, 54);
    const setupData = Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");

    expect(
      getAdditionalData("00 00 AA BB CC DD EE FF", indexSetupData(setupData), false),
    ).toEqual({
      pageId: null,
      accessLevel: null,
      failsafe: null,
      optimal: null,
      offsets: null,
    });
  });
});
