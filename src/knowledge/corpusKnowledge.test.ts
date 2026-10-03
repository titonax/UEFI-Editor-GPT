import { describe, expect, it } from "vitest";
import {
  createCorpusInputFailure,
  createCorpusRunReport,
  corpusRunToCsv,
} from "../components/scripts/corpusReport";
import type {
  CorpusContextReport,
  CorpusFileReport,
} from "../components/scripts/corpusTypes";
import { firmwareCases } from "./cases";
import { analyzeCorpusKnowledge, withCorpusKnowledge } from "./corpusKnowledge";

function reviewedAward() {
  const entry = firmwareCases.find((item) => item.id === "emachines-el1200-r01a2");
  if (!entry) throw new Error("Missing reviewed Award case");
  return entry;
}

const award = reviewedAward();

function measuredAward(): CorpusFileReport {
  const unreadable = createCorpusInputFailure(new File([], "R01A2.BIN"), "Read failed");
  return {
    ...unreadable,
    sha256: award.sha256,
    size: award.size,
    status: "unsupported",
    family: { family: "award", confidence: "confirmed", conflict: false, signals: [] },
    outer: { ...unreadable.outer, container: "award-rom" },
    awardLegacy: {
      modules: Array.from({ length: 23 }, () => ({})),
    } as CorpusFileReport["awardLegacy"],
    stages: unreadable.stages.map((stage) =>
      stage.id === "preflight" ? { ...stage, status: "failed" } : stage,
    ),
    failure: { stage: "preflight", message: "No UEFI FV" },
  };
}

describe("corpus catalogue integration", () => {
  it("keeps a documented legacy image known even when HII extraction is blocked", () => {
    const file = withCorpusKnowledge(measuredAward());
    expect(file.knowledge?.match).toMatchObject({
      status: "known",
      matches: [{ caseId: award.id, basis: "exact-sha256", conflictingFields: [] }],
    });
    expect(file.status).toBe("unsupported");
    expect(file.stages.find((stage) => stage.id === "extraction")?.status).toBe(
      "not-run",
    );
    expect(file.knowledge?.fingerprint.structure).toMatchObject({
      firmwareVolumeCount: 0,
      legacyModuleCount: 23,
    });

    const report = createCorpusRunReport([file, { ...file, fileName: "R01A2(1).BIN" }]);
    expect(
      report.dashboard.knowledge.find((row) => row.status === "known")?.cases,
    ).toBe(1);
    expect(report.summary.duplicates).toBe(1);
    expect(report.schemaVersion).toBe("0.8.0");
    expect(JSON.stringify(report)).toContain('"knowledgeVersion":"1.0.0"');
    expect(corpusRunToCsv(report)).toContain(
      "knowledge_status,knowledge_version,knowledge_case_ids",
    );
    expect(corpusRunToCsv(report)).toContain("known,1.0.0,emachines-el1200-r01a2");
  });

  it("leaves unreadable structural fields absent and catches contradictions in an exact image", () => {
    const unreadable = createCorpusInputFailure(
      new File([], "unknown.bin"),
      "Read failed",
    );
    expect(unreadable.knowledge?.fingerprint.structure).toEqual({});
    expect(unreadable.knowledge?.match.status).toBe("insufficient-evidence");
    const conflicting = withCorpusKnowledge({
      ...measuredAward(),
      outer: { ...measuredAward().outer, firmwareVolumeOffsets: [0] },
    });
    expect(conflicting.knowledge?.match.status).toBe("conflict");
    expect(conflicting.knowledge?.match.matches[0].conflictingFields).toContain(
      "firmwareVolumeCount",
    );
    expect(conflicting.status).toBe("unsupported");
  });

  it("compares repeated Setup contexts separately without assigning an image hash to either", () => {
    const base = measuredAward();
    const context = (id: string, forms: number) =>
      ({
        id,
        hii: { formSetCount: 1, formCount: forms },
        layout: "unified-setup-formset",
        navigation: { resolved: true, mechanism: "single-formset-ifr-hub" },
      }) as CorpusContextReport;
    const file = {
      ...base,
      contexts: [context("slot-1", 205), context("slot-2", 229)],
    };
    const result = analyzeCorpusKnowledge(file);
    expect(result.fingerprint.structure.formCount).toBeUndefined();
    expect(result.contexts.map((item) => item.fingerprint.structure.formCount)).toEqual(
      [205, 229],
    );
    expect(result.contexts.map((item) => item.fingerprint.sha256)).toEqual([
      null,
      null,
    ]);
    expect(result.contexts.map((item) => item.contextId)).toEqual(["slot-1", "slot-2"]);
    expect(result.match.status).toBe("known");
  });

  it("distinguishes structural similarity from novelty on a different hash", () => {
    const similar = { ...measuredAward(), sha256: "f".repeat(64) };
    expect(analyzeCorpusKnowledge(similar).match.status).toBe("similar");
    const novel = {
      ...similar,
      outer: { ...similar.outer, container: "vendor-image" as const },
      family: { ...similar.family, family: "phoenix" as const },
    };
    expect(analyzeCorpusKnowledge(novel).match.status).toBe("novel");
  });
});
