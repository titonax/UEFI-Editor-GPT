import { describe, expect, it } from "vitest";
import { firmwareData, form, prompt } from "../../test/fixtures";
import { buildMenuTree } from "./menuTree";

describe("HII menu graph", () => {
  it("keeps a single-FormSet hub as the root and exposes its tabs as movable Refs", () => {
    const guid = "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA";
    const data = firmwareData({
      menu: [
        {
          name: "Setup",
          formId: "0x1",
          formSetGuid: guid,
          offset: null,
          source: "ifr-hub",
        },
      ],
      forms: [
        form({
          name: "Setup",
          formSetGuid: guid,
          children: [
            prompt({ type: "Ref", name: "Main", formId: "0x2", pageId: null }),
          ],
        }),
        form({
          name: "Main",
          formId: "0x2",
          formSetGuid: guid,
          referencedIn: ["0x1"],
        }),
      ],
    });

    const tree = buildMenuTree(data);
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0]).toMatchObject({
      formId: "0x1",
      rootSource: "ifr-navigation",
      reachabilityLabel: "Single-FormSet IFR navigation hub",
    });
    expect(tree.roots[0]?.children[0]).toMatchObject({
      formId: "0x2",
      parentFormIndex: 0,
      referenceChildIndex: 0,
    });
    expect(tree.profiles[0]).toMatchObject({
      label: "Single-FormSet IFR navigation",
      confidence: "high",
    });
  });

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
    expect(tree.roots[0]?.children[0]).toMatchObject({
      formName: "CPU",
      parentFormIndex: 0,
      referenceChildIndex: 0,
    });
    expect(tree.orphans.some((node) => node.formName === "Advanced B")).toBe(true);
  });

  it("reports absent static Ref targets without assuming firmware corruption", () => {
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
    expect(buildMenuTree(data).roots[0]?.children[0]).toMatchObject({
      status: "unknown",
      reachability: "unresolved",
      reachabilityLabel: "Unresolved Ref target",
      parentFormIndex: 0,
      referenceChildIndex: 0,
    });
  });

  it("does not resolve an explicit cross-FormSet Ref in the wrong FormSet", () => {
    const guidA = "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA";
    const guidB = "BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB";
    const data = firmwareData({
      menu: [{ name: "Main", formId: "0x1", formSetGuid: guidA, offset: null }],
      forms: [
        form({
          formSetGuid: guidA,
          children: [
            prompt({
              type: "Ref",
              name: "Missing external form",
              formId: "0x2",
              targetFormSetGuid: guidB,
              pageId: null,
            }),
          ],
        }),
        form({ name: "Wrong target", formId: "0x2", formSetGuid: guidA }),
      ],
    });

    expect(buildMenuTree(data).roots[0]?.children[0]).toMatchObject({
      label: "Missing external form",
      external: true,
      status: "unknown",
      reachability: "external",
      reachabilityLabel: "External HII FormSet",
      formIndex: null,
    });
  });

  it("labels detached forms with their own title inside a shared FormSet", () => {
    const guid = "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA";
    const data = firmwareData({
      menu: [{ name: "Setup", formId: "0x1", formSetGuid: guid, offset: null }],
      forms: [
        form({ name: "Setup", formSetTitle: "Setup", formSetGuid: guid }),
        form({
          name: "Hidden chipset page",
          formId: "0x2",
          formSetTitle: "Setup",
          formSetGuid: guid,
        }),
      ],
    });

    expect(buildMenuTree(data).orphans[0]).toMatchObject({
      label: "Hidden chipset page",
      formName: "Hidden chipset page",
      reachability: "detached",
    });
  });

  it("separates an HP OEM page sequence from the full AMI fallback profile", () => {
    const definitions = [
      ["File", "0x40A", "0x0"],
      ["Storage", "0x40F", "0x40"],
      ["Security", "0x412", "0x50"],
      ["Power", "0x41B", "0x60"],
      ["Advanced", "0x41F", "0x70"],
      ["Advanced", "0x402", "0x80"],
      ["Boot", "0x406", "0x2"],
      ["Chipset", "0x405", "0x8"],
      ["Save & Exit", "0x409", "0x4"],
      ["Main", "0x400", "0x20"],
      ["Security", "0x408", "0x1"],
    ] as const;
    const menu = definitions.map(([name, formId, pageMask], index) => ({
      name,
      formId,
      offset: null,
      formSetGuid: `00000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`,
      source: "setupdata" as const,
      pageMask,
    }));
    const data = firmwareData({
      menu,
      formSetRoots: menu.map((entry) => ({ ...entry, source: "formset" as const })),
      forms: menu.map((entry) =>
        form({
          name: entry.name,
          formId: entry.formId,
          formSetGuid: entry.formSetGuid,
          formSetTitle: entry.name,
        }),
      ),
    });

    const tree = buildMenuTree(data);
    expect(tree.orphans).toHaveLength(0);
    expect(tree.profiles).toHaveLength(2);
    expect(tree.profiles[0]).toMatchObject({
      label: "OEM menu profile · probable live",
      assessment: "probable-live",
    });
    expect(tree.profiles[0]?.roots.map((root) => root.formId)).toEqual([
      "0x40A",
      "0x40F",
      "0x412",
      "0x41B",
      "0x41F",
    ]);
    expect(tree.profiles[1]).toMatchObject({
      label: "AMI full profile · probable fallback",
      assessment: "probable-fallback",
    });
    expect(tree.profiles[1]?.roots.map((root) => root.formId)).toEqual([
      "0x402",
      "0x406",
      "0x405",
      "0x409",
      "0x400",
      "0x408",
    ]);
    expect(tree.profiles[0]?.roots[0]?.reachabilityLabel).toBe(
      "Probable live SetupData root",
    );
    expect(tree.profiles[1]?.roots[0]?.reachabilityLabel).toBe(
      "Probable fallback SetupData root",
    );
  });

  it("distinguishes original and desired AMITSE root visibility", () => {
    const root = {
      name: "Advanced",
      formId: "0x402",
      formSetGuid: "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA",
      offset: null,
      source: "setupdata" as const,
    };
    const data = firmwareData({
      menu: [root],
      forms: [
        form({
          name: root.name,
          formId: root.formId,
          formSetGuid: root.formSetGuid,
        }),
      ],
      rootVisibility: {
        status: "detected",
        mechanism: "setup-pe32-root-byte-vector",
        confidence: "corroborated",
        reason: "test vector",
        vector: {
          bufferId: 3,
          offset: 0x100,
          length: 1,
          codeReferenceOffset: 0x20,
          pageTableOffset: 0x200,
          countEvidence: "immediate",
        },
        entries: [
          {
            rootIndex: 0,
            name: root.name,
            formId: root.formId,
            formSetGuid: root.formSetGuid,
            value: 0,
            visible: false,
            bufferOffset: 0x100,
          },
        ],
      },
      rootVisibilityEdits: [
        {
          kind: "set-root-visibility",
          rootIndex: 0,
          formId: root.formId,
          formSetGuid: root.formSetGuid,
          bufferId: 3,
          bufferOffset: 0x100,
          expected: 0,
          replacement: 1,
          description: "Show root FormSet Advanced",
        },
      ],
    });

    expect(buildMenuTree(data).roots[0]).toMatchObject({
      status: "visible",
      statusLabel: "Pending: root will be visible",
      rootVisibilityOriginal: 0,
      rootVisibilityDesired: 1,
      rootVisibilityPending: true,
    });
  });
});
