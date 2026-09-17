import { describe, expect, it } from "vitest";
import { firmwareData } from "../../test/fixtures";
import {
  assertAmiRootVisibilityEditsMatch,
  desiredAmiRootVisibility,
  toggleAmiRootVisibility,
} from "./amiRootVisibilityEditing";
import type { AmiRootVisibilityReport, Data } from "./types";

const guid = "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA";

function report(): AmiRootVisibilityReport {
  return {
    status: "detected",
    mechanism: "setup-pe32-root-byte-vector",
    confidence: "corroborated",
    reason: "test vector",
    vector: {
      bufferId: 7,
      offset: 0x100,
      length: 2,
      codeReferenceOffset: 0x20,
      pageTableOffset: 0x200,
      countEvidence: "immediate",
    },
    entries: [
      {
        rootIndex: 0,
        name: "Hidden Advanced",
        formId: "0x402",
        formSetGuid: guid,
        value: 0,
        visible: false,
        bufferOffset: 0x100,
      },
      {
        rootIndex: 1,
        name: "Visible Main",
        formId: "0x400",
        formSetGuid: "BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB",
        value: 1,
        visible: true,
        bufferOffset: 0x101,
      },
    ],
  };
}

function state(overrides: Partial<Data> = {}) {
  return firmwareData({ rootVisibility: report(), ...overrides });
}

describe("AMI root visibility edit plans", () => {
  it("records a desired state without changing the original evidence", () => {
    const data = state();
    const edits = toggleAmiRootVisibility(data, 0);

    expect(edits).toEqual([
      expect.objectContaining({
        rootIndex: 0,
        bufferId: 7,
        bufferOffset: 0x100,
        expected: 0,
        replacement: 1,
      }),
    ]);
    expect(data.rootVisibility?.entries[0]).toMatchObject({
      value: 0,
      visible: false,
    });
    expect(
      desiredAmiRootVisibility(
        { ...data, rootVisibilityEdits: edits },
        report().entries[0],
      ),
    ).toBe(1);
  });

  it("removes the pending edit when toggled back to the original state", () => {
    const data = state();
    const first = toggleAmiRootVisibility(data, 1);
    const second = toggleAmiRootVisibility({ ...data, rootVisibilityEdits: first }, 1);

    expect(first?.[0]).toMatchObject({ expected: 1, replacement: 0 });
    expect(second).toBeUndefined();
  });

  it("rejects a saved plan whose byte provenance does not match", () => {
    const edits = toggleAmiRootVisibility(state(), 0);
    if (!edits) throw new Error("Expected a root visibility edit.");
    edits[0].bufferOffset = 0x999;

    expect(() => {
      assertAmiRootVisibilityEditsMatch(edits, report());
    }).toThrow(/does not match the opened firmware/);
  });
});
