import { describe, expect, it } from "vitest";
import { discoverSetupDataMenu, findVarStoreName } from "./setupData";

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

  it("prefers the var store in the current form set", () => {
    const stores = [
      { varStoreId: "0x1", size: "4", name: "Other", formSetGuid: "B" },
      { varStoreId: "1", size: "4", name: "Setup", formSetGuid: "A" },
    ];
    expect(findVarStoreName(stores, "0x1", "A")).toBe("Setup");
  });
});
