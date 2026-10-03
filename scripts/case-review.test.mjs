import assert from "node:assert/strict";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { addDraft, checkReviewedCases, validateCase } from "./case-review.mjs";

const existing = {
  id: "emachines-el1200-r01a2",
  label: "eMachines EL1200 R01A2",
  sha256: "d7ec1c70607c9186fbdd9d30e657b32e139fee2cf144c2f59b36fb48bec42c71",
  size: 1048576,
  fileNames: ["R01A2.BIN"],
  source: "docs/award/emachines-el1200-r01a2.md",
  structure: { family: "award", firmwareVolumeCount: 0 },
  regressionTests: ["src/components/scripts/awardFirmware.test.ts"],
  limitations: ["Editing remains unsupported."],
};

test("accepts a fully reviewed metadata record and preserves measured zeros", () => {
  assert.equal(validateCase(existing), existing);
  assert.ok(checkReviewedCases() >= 0);
});

test("rejects fabricated evidence and unsafe paths", () => {
  assert.throws(() => validateCase({ ...existing, source: "../private.md" }), /path/);
  assert.throws(
    () => validateCase({ ...existing, sha256: "0".repeat(64) }),
    /exact SHA-256/,
  );
  assert.throws(
    () => validateCase({ ...existing, structure: { formCount: -1 } }),
    /Invalid count/,
  );
  assert.throws(
    () => validateCase({ ...existing, structure: {} }),
    /structural observation/,
  );
  assert.throws(
    () => validateCase({ ...existing, fileNames: ["C:\\Users\\user\\BIOS.bin"] }),
    /base names/,
  );
  assert.throws(
    () => validateCase({ ...existing, regressionTests: [] }),
    /regression test/,
  );
  assert.throws(
    () => validateCase({ ...existing, unexpected: "binary" }),
    /unknown field/,
  );
});

test("does not add a known exact sample from a browser draft", () => {
  const folder = mkdtempSync(join(tmpdir(), "uefi-case-draft-"));
  try {
    const file = join(folder, "case.json");
    writeFileSync(
      file,
      JSON.stringify({ schemaVersion: "1.0.0", status: "draft", case: existing }),
    );
    assert.throws(() => addDraft(file), /already documented/);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test("installs a reviewed draft in an isolated repository and strips observations", async () => {
  const root = mkdtempSync(join(tmpdir(), "uefi-review-worktree-"));
  const script = join(root, "scripts/case-review.mjs");
  const source = "docs/knowledge/synthetic-test.md";
  const regression = "src/components/scripts/firmware.test.ts";
  const hash = "a".repeat(64);
  try {
    for (const folder of [
      "scripts",
      "docs/knowledge",
      "src/components/scripts",
      "src/knowledge/cases",
    ]) {
      mkdirSync(join(root, folder), { recursive: true });
    }
    copyFileSync(new URL("./case-review.mjs", import.meta.url), script);
    writeFileSync(join(root, source), `Synthetic review fixture ${hash}\n`);
    writeFileSync(join(root, regression), "// Synthetic test placeholder\n");
    writeFileSync(
      join(root, "src/knowledge/cases/ami.ts"),
      "export const amiCases = [];\n",
    );
    writeFileSync(
      join(root, "src/knowledge/cases/legacy.ts"),
      "export const legacyCases = [];\n",
    );
    const draft = {
      schemaVersion: "1.0.0",
      status: "draft",
      case: {
        ...existing,
        id: "synthetic-review-fixture",
        label: "Synthetic review fixture",
        sha256: hash,
        source,
        regressionTests: [regression],
      },
      observations: { comparison: "novel", contexts: [{ id: "slot-2" }] },
    };
    const input = join(root, "case.json");
    writeFileSync(input, JSON.stringify(draft));
    const isolated = await import(pathToFileURL(script).href);
    const output = isolated.addDraft(input);
    assert.equal(isolated.checkReviewedCases(), 1);
    const installed = JSON.parse(readFileSync(output, "utf8"));
    assert.deepEqual(installed, draft.case);
    assert.equal(installed.observations, undefined);
    assert.throws(() => isolated.addDraft(input), /already exists/);
    writeFileSync(
      input,
      JSON.stringify({ ...draft, case: { ...draft.case, id: "another-id" } }),
    );
    assert.throws(() => isolated.addDraft(input), /already exists/);
    assert.equal(isolated.checkReviewedCases(), 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
