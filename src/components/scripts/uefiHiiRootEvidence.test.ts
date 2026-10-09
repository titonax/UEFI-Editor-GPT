import { describe, expect, it } from "vitest";
import { firmwareData, form, prompt } from "../../test/fixtures";
import { analyzeUefiHiiRoots } from "./uefiHiiRootEvidence";

const guidA = "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA";
const guidB = "BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB";
const entry = {
  name: "Setup",
  formId: "0x1",
  formSetGuid: guidA,
  offset: null,
  source: "uefi-hii" as const,
};

describe("UEFI HII structural root evidence", () => {
  it("keeps unlinked entries unproven regardless of their name or cached parents", () => {
    const data = firmwareData({
      firmwareFamily: "uefi-hii",
      menu: [entry],
      forms: [
        form({
          name: "LenovoSetup",
          sourceModuleName: "SetupDxe",
          referencedIn: ["0x99"],
        }),
      ],
    });
    const before = structuredClone(data);
    expect(analyzeUefiHiiRoots(data)).toEqual([
      {
        name: "Setup",
        formId: "0x1",
        formSetGuid: guidA,
        formIndex: 0,
        moduleName: "SetupDxe",
        staticEntry: "no-incoming-ref",
        incomingReferenceCount: 0,
        runtimeRegistration: "unproven",
        runtimeVisibility: "unproven",
      },
    ]);
    expect(data).toEqual(before);
  });
  it("retains a referenced FormSet entry outside the top-level menu and counts actual cross-FormSet Refs", () => {
    const data = firmwareData({
      firmwareFamily: "uefi-hii",
      menu: [],
      formSetRoots: [entry],
      forms: [
        form(),
        form({
          formSetGuid: guidB,
          children: [
            prompt({
              type: "Ref",
              formId: "1",
              targetFormSetGuid: guidA.toLowerCase(),
            }),
            prompt({ type: "Ref", formId: "0x1", targetFormSetGuid: guidA }),
          ],
        }),
      ],
    });
    expect(analyzeUefiHiiRoots(data)[0]).toMatchObject({
      staticEntry: "referenced",
      incomingReferenceCount: 2,
      runtimeRegistration: "unproven",
      runtimeVisibility: "unproven",
    });
  });
  it("does not treat an implicit Ref in another FormSet as evidence", () => {
    const data = firmwareData({
      firmwareFamily: "uefi-hii",
      menu: [entry],
      forms: [
        form(),
        form({
          formSetGuid: guidB,
          children: [prompt({ type: "Ref", formId: "0x1" })],
        }),
      ],
    });
    expect(analyzeUefiHiiRoots(data)[0].staticEntry).toBe("no-incoming-ref");
  });
  it("reports missing and ambiguous identities without selecting a form", () => {
    const missing = { ...entry, formSetGuid: guidB };
    const data = firmwareData({
      firmwareFamily: "uefi-hii",
      menu: [entry, missing],
      forms: [form(), form()],
    });
    expect(
      analyzeUefiHiiRoots(data).map((root) => [root.staticEntry, root.formIndex]),
    ).toEqual([
      ["ambiguous", null],
      ["missing", null],
    ]);
  });
  it("deduplicates equivalent declarations and does not substitute menu entries for an explicit empty inventory", () => {
    const data = firmwareData({
      firmwareFamily: "uefi-hii",
      menu: [entry, { ...entry, formId: "1", formSetGuid: guidA.toLowerCase() }],
    });
    expect(analyzeUefiHiiRoots(data)).toHaveLength(1);
    expect(analyzeUefiHiiRoots({ ...data, formSetRoots: [] })).toEqual([]);
    expect(analyzeUefiHiiRoots({ ...data, firmwareFamily: "aptio-v" })).toEqual([]);
  });
});
