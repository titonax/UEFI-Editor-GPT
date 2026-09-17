import { describe, expect, it } from "vitest";
import { form, prompt } from "../../test/fixtures";
import { analyzeMenuDiscovery, discoverMenu } from "./menuDiscovery";

describe("menu discovery", () => {
  const guid = "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE";
  const root = {
    name: "Setup",
    formId: "0x1",
    offset: null,
    formSetGuid: guid,
    source: "formset" as const,
  };

  it("maps an AMITSE entry to the matching form", () => {
    expect(
      discoverMenu({
        amitseSct: "DDDDEEEEEEEEEEEE0100",
        setupData: "",
        formSetIds: new Set(["DDDDEEEEEEEEEEEE"]),
        formSetMetadata: new Map([["DDDDEEEEEEEEEEEE", { guid, title: "Setup" }]]),
        formSetRoots: [root],
        forms: [form({ name: "Main", formSetGuid: guid })],
      }),
    ).toEqual([
      {
        name: "Main",
        formId: "0x1",
        offset: "0x8",
        formSetGuid: guid,
        source: "amitse",
      },
    ]);
  });

  it("matches AMITSE GUID bytes regardless of hexadecimal casing", () => {
    expect(
      discoverMenu({
        amitseSct: "ddddeeeeeeeeeeee0100",
        setupData: "",
        formSetIds: new Set(["DDDDEEEEEEEEEEEE"]),
        formSetMetadata: new Map([["DDDDEEEEEEEEEEEE", { guid, title: "Setup" }]]),
        formSetRoots: [root],
        forms: [form({ name: "Main", formSetGuid: guid })],
      }),
    ).toEqual([
      {
        name: "Main",
        formId: "0x1",
        offset: "0x8",
        formSetGuid: guid,
        source: "amitse",
      },
    ]);
  });

  it("falls back to form-set roots when no executable menu is found", () => {
    expect(
      discoverMenu({
        amitseSct: "",
        setupData: "",
        formSetIds: new Set(),
        formSetMetadata: new Map(),
        formSetRoots: [root],
        forms: [],
      }),
    ).toEqual([root]);
  });

  it("rejects signature-shaped AMITSE data that points to no form", () => {
    expect(
      discoverMenu({
        amitseSct: "DDDDEEEEEEEEEEEEFFFF",
        setupData: "",
        formSetIds: new Set(["DDDDEEEEEEEEEEEE"]),
        formSetMetadata: new Map([["DDDDEEEEEEEEEEEE", { guid, title: "Setup" }]]),
        formSetRoots: [root],
        forms: [form({ name: "Main", formSetGuid: guid })],
      }),
    ).toEqual([root]);
  });

  it("does not borrow a matching form ID from another FormSet", () => {
    expect(
      discoverMenu({
        amitseSct: "DDDDEEEEEEEEEEEE0100",
        setupData: "",
        formSetIds: new Set(["DDDDEEEEEEEEEEEE"]),
        formSetMetadata: new Map([["DDDDEEEEEEEEEEEE", { guid, title: "Setup" }]]),
        formSetRoots: [root],
        forms: [
          form({
            name: "Other Main",
            formSetGuid: "11111111-2222-3333-4444-555555555555",
          }),
        ],
      }),
    ).toEqual([root]);
  });

  it("uses the FormSet entry Ref fan-out as the single-FormSet tab source", () => {
    const hub = form({
      name: "Setup",
      formId: "0x1",
      formSetGuid: guid,
      children: [
        prompt({
          type: "Ref",
          name: "Main",
          formId: "0x2",
          ifrOffset: "0x100",
          pageId: null,
        }),
        prompt({
          type: "Ref",
          name: "Advanced",
          formId: "0x3",
          ifrOffset: "0x10F",
          pageId: null,
        }),
      ],
    });
    const main = form({
      name: "Main",
      formId: "0x2",
      formSetGuid: guid,
      referencedIn: ["0x1"],
      children: [
        prompt({ type: "Ref", name: "Security", formId: "0x4", pageId: null }),
      ],
    });
    const advanced = form({
      name: "Advanced",
      formId: "0x3",
      formSetGuid: guid,
      referencedIn: ["0x1"],
    });
    const security = form({
      name: "Security",
      formId: "0x4",
      formSetGuid: guid,
      referencedIn: ["0x2"],
    });
    const result = analyzeMenuDiscovery({
      amitseSct:
        "DDDDEEEEEEEEEEEE0100" +
        "DDDDEEEEEEEEEEEE0200" +
        "DDDDEEEEEEEEEEEE0200" +
        "DDDDEEEEEEEEEEEE0300" +
        "DDDDEEEEEEEEEEEE0400",
      setupData: "",
      formSetIds: new Set(["DDDDEEEEEEEEEEEE"]),
      formSetMetadata: new Map([["DDDDEEEEEEEEEEEE", { guid, title: "Setup" }]]),
      formSetRoots: [root],
      forms: [hub, main, advanced, security],
    });

    expect(result.menu).toEqual([
      {
        name: "Setup",
        formId: "0x1",
        offset: null,
        formSetGuid: guid,
        source: "ifr-hub",
      },
    ]);
    expect(result.singleFormSetNavigation).toMatchObject({
      status: "detected",
      confidence: "corroborated",
      hubFormId: "0x1",
    });
    expect(result.singleFormSetNavigation.pages).toEqual([
      expect.objectContaining({ formId: "0x1", role: "hub" }),
      expect.objectContaining({
        formId: "0x2",
        role: "direct-tab",
        ifrReferenceOffset: "0x100",
        registrationOffsets: ["0x12", "0x1C"],
      }),
      expect.objectContaining({ formId: "0x3", role: "direct-tab" }),
      expect.objectContaining({ formId: "0x4", role: "descendant" }),
    ]);
  });
});
