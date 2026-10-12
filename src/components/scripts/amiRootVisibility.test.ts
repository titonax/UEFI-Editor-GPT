import { buildPe, graph, roots } from "../../test/amiRootFixture";
import { describe, expect, it } from "vitest";
import { inspectAmiRootVisibility } from "./amiRootVisibility";

describe("AMI root visibility", () => {
  it("maps a code-referenced byte vector to IFR FormSet order", () => {
    const report = inspectAmiRootVisibility(roots(3), graph(buildPe([1, 0, 1])));

    expect(report.status).toBe("detected");
    expect(report.vector).toMatchObject({
      bufferId: 1,
      offset: 4 + 0x680,
      length: 3,
      countEvidence: "immediate",
    });
    expect(report.entries.map((entry) => entry.visible)).toEqual([true, false, true]);
  });

  it("accepts a root count loaded from validated PE data", () => {
    const report = inspectAmiRootVisibility(
      roots(3),
      graph(buildPe([1, 1, 1], { dynamicCount: true })),
    );

    expect(report.status).toBe("detected");
    expect(report.vector?.countEvidence).toBe("data");
  });

  it("does not infer polarity from an unusable all-zero or non-Boolean array", () => {
    expect(inspectAmiRootVisibility(roots(3), graph(buildPe([0, 0, 0]))).status).toBe(
      "unresolved",
    );
    expect(inspectAmiRootVisibility(roots(3), graph(buildPe([1, 2, 1]))).status).toBe(
      "unresolved",
    );
  });

  it("rejects multiple matching vectors instead of choosing one", () => {
    const report = inspectAmiRootVisibility(
      roots(3),
      graph(buildPe([1, 0, 1], { secondVector: [1, 1, 0] })),
    );

    expect(report.status).toBe("ambiguous");
    expect(report.entries).toEqual([]);
  });

  it("reports a single-FormSet layout without inferring an Aptio generation", () => {
    const report = inspectAmiRootVisibility(roots(1), {
      rootBufferId: 0,
      sourceSize: 0,
      buffers: [],
      artifacts: [],
    });

    expect(report.status).toBe("not-applicable");
    expect(report.reason).toContain("does not identify or exclude an Aptio generation");
  });
});
