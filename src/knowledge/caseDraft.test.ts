import { describe, expect, it } from "vitest";
import { createCorpusInputFailure } from "../components/scripts/corpusReport";
import type { CorpusContextReport } from "../components/scripts/corpusTypes";
import { caseDraftBlocker, createCaseDraft } from "./caseDraft";
import { withCorpusKnowledge } from "./corpusKnowledge";

describe("local case draft", () => {
  it("exports only reviewable measurements, keeping different Setup contexts separate", () => {
    const failure = createCorpusInputFailure(new File([], "sample.bin"), "Read failed");
    const context = {
      id: "slot-2",
      hii: { formSetCount: 2, formCount: 10 },
      navigation: { resolved: false, mechanism: "unresolved" },
    } as CorpusContextReport;
    const file = withCorpusKnowledge({
      ...failure,
      sha256: "a".repeat(64),
      size: 1024,
      contexts: [
        context,
        {
          ...context,
          id: "slot-3",
          hii: { ...context.hii, formSetCount: 1, formCount: 3 },
        },
      ],
    });
    const draft = createCaseDraft(file);
    expect(draft).toMatchObject({
      schemaVersion: "1.0.0",
      status: "draft",
      case: {
        sha256: "a".repeat(64),
        size: 1024,
        structure: {},
        source: "",
        regressionTests: [],
        limitations: [],
      },
      observations: {
        contexts: [
          { id: "slot-2", structure: { formCount: 10 } },
          { id: "slot-3", structure: { formCount: 3 } },
        ],
      },
    });
    expect(JSON.stringify(draft)).not.toContain("Read failed");
    expect(JSON.stringify(draft)).not.toContain("hiiBytes");
    expect(draft.case.structure.formCount).toBeUndefined();
  });

  it("refuses incomplete reads and already documented exact hashes", () => {
    const failure = createCorpusInputFailure(
      new File([], "unreadable.bin"),
      "Read failed",
    );
    expect(caseDraftBlocker(failure)).toMatch(/SHA-256/);
    expect(() => createCaseDraft(failure)).toThrow(/SHA-256/);
    const documented = withCorpusKnowledge({
      ...failure,
      sha256: "d7ec1c70607c9186fbdd9d30e657b32e139fee2cf144c2f59b36fb48bec42c71",
      size: 1048576,
    });
    expect(caseDraftBlocker(documented)).toMatch(/already documented/);
    expect(() => createCaseDraft(documented)).toThrow(/already documented/);
  });
});
