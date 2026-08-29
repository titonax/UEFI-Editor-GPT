import { describe, expect, it } from "vitest";
import { firmwareData, form, prompt } from "../../test/fixtures";
import { buildMenuTree } from "./menuTree";

describe("HII menu graph", () => {
  it("keeps duplicate FormIds isolated by FormSet GUID", () => {
    const guidA = "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA";
    const guidB = "BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB";
    const data = firmwareData({
      menu: [{ name: "Advanced", formId: "0x1", formSetGuid: guidA, offset: null }],
      forms: [
        form({
          name: "Advanced A",
          formSetGuid: guidA,
          children: [
            prompt({
              type: "Ref",
              name: "CPU",
              formId: "0x2",
              targetFormSetGuid: guidA,
              pageId: null,
            }),
          ],
        }),
        form({ name: "CPU", formId: "0x2", formSetGuid: guidA }),
        form({ name: "Advanced B", formSetGuid: guidB }),
      ],
    });

    const tree = buildMenuTree(data);
    expect(tree.roots[0]?.formName).toBe("Advanced A");
    expect(tree.roots[0]?.children[0]?.formName).toBe("CPU");
    expect(tree.orphans.some((node) => node.formName === "Advanced B")).toBe(true);
  });

  it("reports dangling Ref targets as broken nodes", () => {
    const data = firmwareData({
      menu: [{ name: "Main", formId: "0x1", offset: null }],
      forms: [
        form({
          children: [
            prompt({ type: "Ref", name: "Missing", formId: "0x99", pageId: null }),
          ],
        }),
      ],
    });
    expect(buildMenuTree(data).roots[0]?.children[0]?.status).toBe("broken");
  });
});
