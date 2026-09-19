import { describe, expect, it } from "vitest";
import { classifyBrand, compareBrandNavigation } from "./brandKnowledge";

const asusSample = "e862e5b0fdce10e44764be6072dd5b8017544264353dbfa02c8074e0ccc15190";

describe("manufacturer evidence catalogue", () => {
  it("recognizes a documented image after renaming and retains corpus denominators", () => {
    const result = classifyBrand("renamed.bin", asusSample, []);
    expect(result).toMatchObject({
      brand: "ASUS",
      basis: "documented-hash",
      documentedSamples: 5,
      observedGenerations: [{ generation: "aptio-iv", samples: 3 }],
      observedContainers: [{ container: "vendor-image", samples: 5 }],
      observedLayouts: [{ layout: "unified-setup-formset", samples: 2 }],
      navigationPrior: [{ mechanism: "single-formset-ifr-hub", samples: 2 }],
      navigationOutcome: "unmeasured",
    });
  });

  it("records conflicting filename evidence without replacing an internal marker", () => {
    const result = classifyBrand("ASUS.CAP", "", [
      { brand: "HP", marker: "SECURE_HP_SIGNATURE", offset: 0x80 },
    ]);
    expect(result.brand).toBe("HP");
    expect(result.basis).toBe("firmware-marker");
    expect(result.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ brand: "HP", offset: 0x80 }),
        expect.objectContaining({ brand: "ASUS", source: "filename" }),
      ]),
    );
    expect(result.navigationPrior).toEqual([]);
  });

  it("accepts a declared manufacturer without a model and flags competing markers", () => {
    const result = classifyBrand(
      "firmware.bin",
      "",
      [
        { brand: "HP", marker: "SECURE_HP_SIGNATURE", offset: 0x80 },
        { brand: "ASUS", marker: "ASUSTeK COMPUTER INC.", offset: 0xa0 },
      ],
      "Supermicro",
    );
    expect(result.brand).toBe("Supermicro");
    expect(result.basis).toBe("user-supplied");
    expect(result.signals).toHaveLength(3);
    expect(
      classifyBrand(
        "firmware.bin",
        "",
        result.signals
          .filter((signal) => signal.source === "firmware-marker")
          .map((signal) => ({
            brand: signal.brand,
            marker: signal.detail,
            offset: signal.offset ?? 0,
          })),
      ).basis,
    ).toBe("conflict");
  });

  it("marks a previously unseen navigation mechanism as a new brand pattern", () => {
    const prior = classifyBrand("ASUS-board.bin", "", []);
    expect(
      compareBrandNavigation(prior, ["single-formset-ifr-hub"]).navigationOutcome,
    ).toBe("matches-prior");
    expect(
      compareBrandNavigation(prior, ["multi-formset-root-vector"]).navigationOutcome,
    ).toBe("new-pattern");
    expect(compareBrandNavigation(prior, ["unresolved"]).navigationOutcome).toBe(
      "unmeasured",
    );
    expect(classifyBrand("firmware.bin", "", []).brand).toBeNull();
  });
});
