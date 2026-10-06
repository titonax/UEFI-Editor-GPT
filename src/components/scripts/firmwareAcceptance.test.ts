import { describe, expect, it } from "vitest";
import {
  acceptedLzmaSetupImage,
  acceptedTianoSetupImage,
  assertAcceptedCompressedArtifactEdits,
  hasAcceptedRootVisibilitySource,
} from "./firmwareAcceptance";

describe("compressed artifact acceptance scope", () => {
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
