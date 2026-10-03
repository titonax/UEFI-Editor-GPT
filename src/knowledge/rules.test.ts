import { describe, expect, it } from "vitest";
import { matchFirmwareCases } from "./caseMatcher";
import { firmwareCases } from "./cases";
import { createFirmwareFingerprint } from "./fingerprint";
import { firmwareRules, referenceRulesForMatch } from "./rules";

const sourceFiles = import.meta.glob("/src/components/scripts/**/*.ts", {
  eager: true,
  query: "?raw",
  import: "default",
});
const regressionFiles = import.meta.glob("/src/**/*.test.ts");

describe("reviewed format rule registry", () => {
  it("links every rule to an actual exported implementation, regression and reviewed evidence", () => {
    expect(new Set(firmwareRules.map((rule) => rule.id)).size).toBe(
      firmwareRules.length,
    );
    for (const rule of firmwareRules) {
      expect(rule.prerequisites.length, rule.id).toBeGreaterThan(0);
      expect(rule.limitations.length, rule.id).toBeGreaterThan(0);
      expect(rule.regressionTests.length, rule.id).toBeGreaterThan(0);
      const source = sourceFiles[`/${rule.implementation.path}`];
      expect(typeof source, rule.id).toBe("string");
      expect(source, rule.id).toMatch(
        new RegExp(`export (?:async )?function ${rule.implementation.symbol}\\(`),
      );
      for (const path of rule.regressionTests) {
        expect(`/${path}` in regressionFiles, `${rule.id}: ${path}`).toBe(true);
      }
      expect(rule.caseIds.length > 0, rule.id).toBe(rule.evidence !== "synthetic-only");
      for (const id of rule.caseIds) {
        const entry = firmwareCases.find((item) => item.id === id);
        expect(entry, `${rule.id}: ${id}`).toBeDefined();
        expect(
          entry?.regressionTests.some((path) => rule.regressionTests.includes(path)),
          id,
        ).toBe(true);
      }
    }
  });

  it("offers references only for an exact uncontradicted identity", () => {
    const entry = firmwareCases.find((item) => item.id === "emachines-el1200-r01a2");
    if (!entry) throw new Error("Missing Award case");
    const known = matchFirmwareCases(
      createFirmwareFingerprint({ sha256: entry.sha256 }),
    );
    expect(referenceRulesForMatch(known).map((rule) => rule.id)).toEqual([
      "award-legacy-lha-inventory",
    ]);
    const conflict = matchFirmwareCases(
      createFirmwareFingerprint({ sha256: entry.sha256, size: entry.size + 1 }),
    );
    expect(referenceRulesForMatch(conflict)).toEqual([]);
    const similar = matchFirmwareCases(
      createFirmwareFingerprint({ sha256: "f".repeat(64), structure: entry.structure }),
    );
    expect(similar.status).toBe("similar");
    expect(referenceRulesForMatch(similar)).toEqual([]);
    expect(
      firmwareRules.find((rule) => rule.evidence === "synthetic-only")?.caseIds,
    ).toEqual([]);
  });
});
