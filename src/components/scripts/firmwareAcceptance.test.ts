import { describe, expect, it } from "vitest";
import {
  acceptedLzmaSetupImage,
  acceptedNestedLzmaSetupImage,
  hasAcceptedLzmaSetupSource,
  hasAcceptedNestedLzmaSetupSource,
  acceptedTianoSetupImage,
  assertAcceptedCompressedArtifactEdits,
  hasAcceptedRootVisibilitySource,
} from "./firmwareAcceptance";

describe("compressed artifact acceptance scope", () => {
  it("limits nested LZMA SPI acceptance to exact source size and reviewed artifacts", () => {
    const source = acceptedNestedLzmaSetupImage;
    expect(hasAcceptedLzmaSetupSource(source.sha256.toUpperCase(), source.size)).toBe(
      true,
    );
    expect(hasAcceptedLzmaSetupSource(source.sha256, source.size - 1)).toBe(false);
    expect(hasAcceptedLzmaSetupSource("0".repeat(64), source.size)).toBe(false);
    expect(() => {
      assertAcceptedCompressedArtifactEdits(source.sha256, source.size, ["setup-hii"]);
    }).not.toThrow();
    for (const kind of ["amitse"] as const) {
      expect(() => {
        assertAcceptedCompressedArtifactEdits(source.sha256, source.size, [
          "setup-hii",
          kind,
        ]);
      }).toThrow(`compressed ${kind} edits`);
    }
    expect(hasAcceptedRootVisibilitySource(source.sha256, source.size)).toBe(true);
  });
  it("allows nested HII/SetupData together without extending other LZMA sources", () => {
    const source = acceptedNestedLzmaSetupImage;
    expect(
      hasAcceptedNestedLzmaSetupSource(source.sha256.toUpperCase(), source.size),
    ).toBe(true);
    expect(hasAcceptedNestedLzmaSetupSource(undefined, source.size)).toBe(false);
    expect(hasAcceptedNestedLzmaSetupSource(source.sha256, source.size - 1)).toBe(
      false,
    );
    for (const kinds of [["setupdata"], ["setup-hii", "setupdata"]] as const) {
      expect(() => {
        assertAcceptedCompressedArtifactEdits(source.sha256, source.size, kinds);
      }).not.toThrow();
      for (const [hash, size] of [
        [source.sha256, source.size - 1],
        ["0".repeat(64), source.size],
        [acceptedLzmaSetupImage.sha256, acceptedLzmaSetupImage.size],
      ] as const) {
        expect(() => {
          assertAcceptedCompressedArtifactEdits(hash, size, kinds);
        }).toThrow(/No real-image acceptance.*setupdata edits/);
      }
    }
  });
  it("keeps nested root acceptance source-specific and leaves AMITSE blocked", () => {
    const source = acceptedNestedLzmaSetupImage;
    expect(
      hasAcceptedRootVisibilitySource(source.sha256.toUpperCase(), source.size),
    ).toBe(true);
    for (const [hash, size] of [
      [undefined, source.size],
      ["0".repeat(64), source.size],
      [source.sha256, source.size - 1],
      [acceptedLzmaSetupImage.sha256, acceptedLzmaSetupImage.size],
    ] as const) {
      expect(hasAcceptedRootVisibilitySource(hash, size)).toBe(false);
    }
    expect(() => {
      assertAcceptedCompressedArtifactEdits(source.sha256, source.size, [
        "setup-hii",
        "setupdata",
        "amitse",
      ]);
    }).toThrow("compressed amitse edits");
  });
  it("keeps root output separate from LZMA HII acceptance", () => {
    expect(
      hasAcceptedRootVisibilitySource(
        acceptedTianoSetupImage.sha256.toUpperCase(),
        acceptedTianoSetupImage.size,
      ),
    ).toBe(true);
    expect(
      hasAcceptedRootVisibilitySource(
        acceptedLzmaSetupImage.sha256,
        acceptedLzmaSetupImage.size,
      ),
    ).toBe(false);
    expect(
      hasAcceptedRootVisibilitySource(
        acceptedTianoSetupImage.sha256,
        acceptedTianoSetupImage.size - 1,
      ),
    ).toBe(false);
    expect(
      hasAcceptedRootVisibilitySource(undefined, acceptedTianoSetupImage.size),
    ).toBe(false);
  });

  it("accepts combined HII and SetupData only on the proven Tiano source", () => {
    expect(() => {
      assertAcceptedCompressedArtifactEdits(
        acceptedTianoSetupImage.sha256.toUpperCase(),
        acceptedTianoSetupImage.size,
        ["setup-hii", "setupdata"],
      );
    }).not.toThrow();
    expect(() => {
      assertAcceptedCompressedArtifactEdits(
        acceptedLzmaSetupImage.sha256,
        acceptedLzmaSetupImage.size,
        ["setup-hii", "setupdata"],
      );
    }).toThrow("compressed setupdata edits");
  });

  it("preserves HII-only acceptance on the proven LZMA source", () => {
    expect(() => {
      assertAcceptedCompressedArtifactEdits(
        acceptedLzmaSetupImage.sha256,
        acceptedLzmaSetupImage.size,
        ["setup-hii"],
      );
    }).not.toThrow();
  });

  it("rejects unproven AMITSE edits even alongside accepted edits", () => {
    expect(() => {
      assertAcceptedCompressedArtifactEdits(
        acceptedTianoSetupImage.sha256,
        acceptedTianoSetupImage.size,
        ["setup-hii", "setupdata", "amitse"],
      );
    }).toThrow("compressed amitse edits");
  });

  it("rejects mismatched source identity and size", () => {
    for (const [hash, size] of [
      [undefined, acceptedTianoSetupImage.size],
      ["unaccepted", acceptedTianoSetupImage.size],
      [acceptedTianoSetupImage.sha256, acceptedTianoSetupImage.size - 1],
    ] as const) {
      expect(() => {
        assertAcceptedCompressedArtifactEdits(hash, size, ["setup-hii", "setupdata"]);
      }).toThrow("No real-image acceptance");
    }
  });
});
