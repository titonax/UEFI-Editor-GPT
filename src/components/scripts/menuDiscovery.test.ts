import { describe, expect, it } from "vitest";
import { form } from "../../test/fixtures";
import { discoverMenu } from "./menuDiscovery";

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
});
