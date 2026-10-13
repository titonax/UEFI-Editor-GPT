import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  pathIds,
  excludedIds,
  releaseEvidenceReport,
  repositoryReferenceExists,
  runReleaseCommand,
  validateReleaseEvidence,
  validReference,
} from "./release-readiness.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  readFileSync(join(root, "docs/release-evidence.json"), "utf8"),
);
const exists = (ref) => repositoryReferenceExists(root, ref);

test("current reviewed inventory is complete but blocked, with hardware kept separate", () => {
  const original = structuredClone(manifest);
  const report = releaseEvidenceReport(manifest, exists);
  assert.equal(report.status, "blocked");
  assert.equal(report.paths.length, 7);
  assert.equal(report.excluded.length, 8);
  assert.deepEqual(
    report.paths.find((path) => path.id === "hii-p53-mirrored").missing,
    [],
  );
  assert.deepEqual(
    report.paths.find((path) => path.id === "ami-tiano-exact").missing,
    [],
  );
  assert.deepEqual(
    report.paths.find((path) => path.id === "phoenix-lh5-exact").missing,
    [],
  );
  assert.deepEqual(
    report.paths.find((path) => path.id === "ami-lzma-exact").missing,
    [],
  );
  assert.deepEqual(
    report.paths.find((path) => path.id === "ami-lzma-nested").missing,
    [],
  );
  assert.deepEqual(
    report.paths.find((path) => path.id === "ami-uncompressed").missing,
    ["realSource", "browser"],
  );
  assert.deepEqual(
    report.paths.find((path) => path.id === "hii-mixed-uncompressed").missing,
    ["realSource", "browser"],
  );
  assert.equal(report.paths[0].evidence.hardware.status, "pending");
  assert.deepEqual(manifest, original);
});
test("report/validate accept honest pending evidence; explicit release check rejects it", () => {
  assert.equal(runReleaseCommand("report", manifest, exists).exitCode, 0);
  assert.equal(runReleaseCommand("validate", manifest, exists).exitCode, 0);
  assert.equal(runReleaseCommand("check", manifest, exists).exitCode, 2);
  assert.throws(() => runReleaseCommand("ignore", manifest, exists), /expected report/);
});
test("synthetic complete records satisfy only the evidence inventory, not hardware or runtime acceptance", () => {
  const complete = structuredClone(manifest);
  for (const path of complete.paths)
    for (const gate of ["engine", "realSource", "browser"])
      path[gate].status = "recorded";
  const { report, exitCode } = runReleaseCommand("check", complete, () => true);
  assert.equal(exitCode, 0);
  assert.equal(report.status, "evidence-ready");
  assert.ok(report.paths.every((path) => path.evidence.hardware.status === "pending"));
  assert.match(report.scope, /current-commit CI and release review remain required/);
});
test("cannot hide blockers by omitting, duplicating or inventing paths and exclusions", () => {
  for (const mutate of [
    (data) => data.paths.pop(),
    (data) => {
      data.paths[0].id = data.paths[1].id;
    },
    (data) => {
      data.paths[0].id = "generic-ami";
    },
    (data) => data.excluded.pop(),
    (data) => {
      data.excluded[0].id = data.excluded[1].id;
    },
    (data) => {
      data.excluded[0].id = "anything";
    },
  ]) {
    const data = structuredClone(manifest);
    mutate(data);
    assert.throws(
      () => validateReleaseEvidence(data, exists),
      /required|unknown or duplicate/,
    );
  }
});
test("rejects unknown schema fields, versions, statuses, empty notes and invalid evidence arrays", () => {
  for (const mutate of [
    (data) => {
      data.version = 2;
    },
    (data) => {
      data.bytes = "firmware";
    },
    (data) => {
      data.paths[0].offset = 4;
    },
    (data) => {
      data.paths[0].engine.status = "passed";
    },
    (data) => {
      data.paths[0].engine.note = "";
    },
    (data) => {
      data.paths[0].scope = "x".repeat(2001);
    },
    (data) => {
      data.paths[0].engine.references = [];
    },
    (data) => {
      data.paths[0].engine.references = Array(11).fill("docs/roadmap.md");
    },
    (data) => {
      data.paths[0].engine.references.push(data.paths[0].engine.references[0]);
    },
    (data) => {
      delete data.paths[0].hardware;
    },
  ]) {
    const data = structuredClone(manifest);
    mutate(data);
    assert.throws(() => validateReleaseEvidence(data, exists));
  }
});
test("rejects external, absolute, traversal, encoded, malformed and absent references", () => {
  for (const ref of [
    "../private.md",
    "docs/../private.md",
    "/docs/roadmap.md",
    "https://example.org/evidence",
    "C:\\private.md",
    "docs/%2e%2e/private.md",
    "docs/roadmap.md?file=secret",
    "docs/roadmap.md#",
    "docs/absent.md",
    "docs/roadmap.md#absent",
  ]) {
    const data = structuredClone(manifest);
    data.paths[0].engine.references = [ref];
    assert.throws(() => validateReleaseEvidence(data, exists), /unsafe or missing/);
  }
  assert.equal(validReference("docs/roadmap.md"), true);
});
test("resolves real anchors and rejects directories, oversize documents and escaping symlinks", () => {
  const folder = mkdtempSync(join(tmpdir(), "release-evidence-"));
  try {
    mkdirSync(join(folder, "repo/docs"), { recursive: true });
    writeFileSync(join(folder, "repo/docs/good.md"), "## Test heading\n");
    writeFileSync(join(folder, "private.md"), "# private\n");
    symlinkSync(join(folder, "private.md"), join(folder, "repo/docs/link.md"));
    mkdirSync(join(folder, "repo/docs/directory.md"));
    writeFileSync(join(folder, "repo/docs/large.md"), "x".repeat(1024 * 1024 + 1));
    assert.equal(
      repositoryReferenceExists(join(folder, "repo"), "docs/good.md#test-heading"),
      true,
    );
    for (const ref of [
      "docs/good.md#absent",
      "docs/link.md",
      "docs/directory.md",
      "docs/large.md",
      "../private.md",
    ])
      assert.equal(repositoryReferenceExists(join(folder, "repo"), ref), false);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
test("CLI JSON is metadata-only and blocked checks return a distinct nonzero code", () => {
  const script = join(root, "scripts/release-readiness.mjs");
  const report = spawnSync(process.execPath, [script, "report", "--json"], {
    encoding: "utf8",
  });
  assert.equal(report.status, 0);
  assert.equal(JSON.parse(report.stdout).status, "blocked");
  assert.doesNotMatch(
    report.stdout,
    /sourceBytes|decodedBytes|[a-f0-9]{64}|\/workspace\/|C:\\/,
  );
  const blocked = spawnSync(process.execPath, [script, "check"], { encoding: "utf8" });
  assert.equal(blocked.status, 2);
  assert.match(blocked.stdout, /hii-p53-mirrored: required evidence recorded/);
  assert.match(blocked.stdout, /hii-mixed-uncompressed: pending realSource, browser/);
  const invalid = spawnSync(process.execPath, [script, "report", "--force"], {
    encoding: "utf8",
  });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /unexpected CLI arguments/);
});

test("exported scope policy cannot be mutated by a consumer", () => {
  assert.throws(() => pathIds.pop(), TypeError);
  assert.throws(() => excludedIds.pop(), TypeError);
  assert.equal(pathIds.length, 7);
  assert.equal(excludedIds.length, 8);
});
