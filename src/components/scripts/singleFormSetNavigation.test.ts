import { describe, expect, it } from "vitest";
import { form, prompt } from "../../test/fixtures";
import { inspectSingleFormSetNavigation } from "./singleFormSetNavigation";
import type { Menu } from "./types";

describe("single-FormSet IFR navigation", () => {
  it("reproduces the supplied ROG STRIX Z390-E tab graph", () => {
    const formSetGuid = "7B59104A-C00D-4158-87FF-F04D6396A915";
    const tabs = [
      ["My Favorites", "0x2712", "0x67BC1"],
      ["Main", "0x2713", "0x67BD0"],
      ["Ai Tweaker", "0x2714", "0x67BDF"],
      ["Advanced", "0x2715", "0x67BEE"],
      ["Monitor", "0x2716", "0x67BFD"],
      ["Chipset", "0x2717", "0x67C0C"],
      ["Boot", "0x2718", "0x67C1B"],
      ["Tool", "0x2719", "0x67C2A"],
      ["Exit", "0x271A", "0x67C39"],
    ] as const;
    const hub = form({
      name: "Setup",
      formId: "0x2710",
      formSetGuid,
      children: tabs.map(([name, formId, ifrOffset], index) =>
        prompt({
          type: "Ref",
          name,
          formId,
          questionId: `0x${(0x100 + index).toString(16)}`,
          ifrOffset,
          pageId: null,
        }),
      ),
    });
    const tabForms = tabs.map(([name, formId]) =>
      form({ name, formId, formSetGuid, referencedIn: [hub.formId] }),
    );
    const main = tabForms.find((candidate) => candidate.formId === "0x2713");
    if (!main) throw new Error("Expected Main in the Z390 fixture.");
    main.children.push(
      prompt({
        type: "Ref",
        name: "Security",
        formId: "0x27E5",
        questionId: "0x200",
        pageId: null,
      }),
    );
    const security = form({
      name: "Security",
      formId: "0x27E5",
      formSetGuid,
      referencedIn: [main.formId],
    });
    const detachedExit = form({
      name: "Exit",
      formId: "0x271B",
      formSetGuid,
    });
    const registrations: Menu = [hub, ...tabForms, security, detachedExit].map(
      (candidate, index) => ({
        name: candidate.name,
        formId: candidate.formId,
        formSetGuid,
        offset: `0x${(0x193000 + index * 0x20).toString(16)}`,
        source: "amitse",
      }),
    );

    const report = inspectSingleFormSetNavigation(
      [
        {
          name: "Setup",
          formId: hub.formId,
          formSetGuid,
          offset: null,
          source: "formset",
        },
      ],
      [hub, ...tabForms, security, detachedExit],
      registrations,
    );

    expect(report).toMatchObject({
      status: "detected",
      confidence: "corroborated",
      hubFormId: "0x2710",
    });
    expect(
      report.pages
        .filter((page) => page.role === "direct-tab")
        .map((page) => page.formId),
    ).toEqual(tabs.map(([, formId]) => formId));
    expect(report.pages.find((page) => page.formId === "0x27E5")).toMatchObject({
      role: "descendant",
      parentFormIds: ["0x2713"],
    });
    expect(report.pages.find((page) => page.formId === "0x271B")).toMatchObject({
      role: "registered-only",
      parentFormIds: [],
    });
  });
});
