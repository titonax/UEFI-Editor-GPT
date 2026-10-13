import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const pathIds = Object.freeze([
  "ami-uncompressed",
  "ami-lzma-exact",
  "ami-lzma-nested",
  "ami-tiano-exact",
  "hii-p53-mirrored",
  "hii-mixed-uncompressed",
  "phoenix-lh5-exact",
]);
export const excludedIds = Object.freeze([
  "efi-variant",
  "mixed-compressed",
  "capsule-output",
  "award-output",
  "amibios8-output",
  "p53-dynamic-roots",
  "amitse-retarget-output",
  "allocation-growth",
]);
const requiredGates = ["engine", "realSource", "browser"];
const evidenceGates = [...requiredGates, "hardware"];
function ensure(condition, message) {
  if (!condition) throw new Error(`Release evidence: ${message}.`);
}
function keys(value, expected, label) {
  ensure(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === expected.length &&
      expected.every((key) => Object.hasOwn(value, key)),
    `${label} has missing or unknown fields`,
  );
}
function text(value, label) {
  ensure(
    typeof value === "string" && value.trim().length > 0 && value.length <= 2000,
    `${label} must be bounded nonempty text`,
  );
}
export function validReference(ref) {
  return (
    typeof ref === "string" &&
    /^docs\/[A-Za-z0-9/-]+\.md(?:#[a-z0-9-]+)?$/.test(ref) &&
    !ref.split("/").includes("..")
  );
}
export function validateReleaseEvidence(input, referenceExists) {
  keys(input, ["version", "paths", "excluded"], "manifest");
  ensure(input.version === 1, "unsupported manifest version");
  ensure(
    Array.isArray(input.paths) && input.paths.length === pathIds.length,
    "all tracked write paths are required",
  );
  const ids = new Set();
  for (const path of input.paths) {
    keys(path, ["id", "scope", ...evidenceGates], "write path");
    ensure(
      pathIds.includes(path.id) && !ids.has(path.id),
      "unknown or duplicate write path",
    );
    ids.add(path.id);
    text(path.scope, "scope");
    for (const gate of evidenceGates) {
      const evidence = path[gate];
      keys(evidence, ["status", "references", "note"], gate);
      ensure(
        ["recorded", "pending"].includes(evidence.status),
        `${gate} has an invalid status`,
      );
      text(evidence.note, `${gate} note`);
      ensure(
        Array.isArray(evidence.references) &&
          evidence.references.length > 0 &&
          evidence.references.length <= 10 &&
          new Set(evidence.references).size === evidence.references.length,
        `${gate} requires unique bounded references`,
      );
      for (const ref of evidence.references) {
        ensure(
          validReference(ref) && referenceExists(ref),
          `${gate} has an unsafe or missing reference`,
        );
      }
    }
  }
  ensure(
    Array.isArray(input.excluded) && input.excluded.length === excludedIds.length,
    "all exclusions are required",
  );
  const excluded = new Set();
  for (const entry of input.excluded) {
    keys(entry, ["id", "reason", "reference"], "excluded path");
    ensure(
      excludedIds.includes(entry.id) && !excluded.has(entry.id),
      "unknown or duplicate exclusion",
    );
    excluded.add(entry.id);
    text(entry.reason, "exclusion reason");
    ensure(
      validReference(entry.reference) && referenceExists(entry.reference),
      "unsafe or missing exclusion reference",
    );
  }
  return input;
}
export function releaseEvidenceReport(input, referenceExists) {
  const manifest = validateReleaseEvidence(input, referenceExists);
  const paths = manifest.paths.map((path) => ({
    id: path.id,
    scope: path.scope,
    missing: requiredGates.filter((gate) => path[gate].status !== "recorded"),
    evidence: Object.fromEntries(evidenceGates.map((gate) => [gate, path[gate]])),
  }));
  return {
    version: 1,
    status: paths.every((path) => path.missing.length === 0)
      ? "evidence-ready"
      : "blocked",
    scope:
      "Reviewed evidence inventory only; current-commit CI and release review remain required. No writer or firmware acceptance is enabled.",
    paths,
    excluded: manifest.excluded,
  };
}
export function repositoryReferenceExists(root, ref) {
  if (!validReference(ref)) return false;
  const [file, anchor] = ref.split("#");
  const target = resolve(root, file);
  if (
    !existsSync(target) ||
    !statSync(target).isFile() ||
    statSync(target).size > 1024 * 1024
  )
    return false;
  const rel = relative(realpathSync(root), realpathSync(target));
  if (isAbsolute(rel) || rel.split(/[\\/]/)[0] === "..") return false;
  if (!anchor) return true;
  const headings = readFileSync(target, "utf8")
    .split("\n")
    .filter((line) => /^#{1,6} /.test(line))
    .map((line) =>
      line
        .replace(/^#{1,6} /, "")
        .trim()
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s/g, "-"),
    );
  return headings.includes(anchor);
}
export function runReleaseCommand(command, input, referenceExists) {
  ensure(
    ["report", "check", "validate"].includes(command),
    "expected report, check or validate",
  );
  const report = releaseEvidenceReport(input, referenceExists);
  return {
    report,
    exitCode: command === "check" && report.status === "blocked" ? 2 : 0,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    ensure(
      process.argv.length <= 4 && (!process.argv[3] || process.argv[3] === "--json"),
      "unexpected CLI arguments",
    );
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const file = resolve(root, "docs/release-evidence.json");
    const manifestRelative = relative(realpathSync(root), realpathSync(file));
    ensure(
      !isAbsolute(manifestRelative) && manifestRelative.split(/[\\/]/)[0] !== "..",
      "manifest must remain inside the repository",
    );
    ensure(
      statSync(file).isFile() && statSync(file).size <= 1024 * 1024,
      "manifest must be a file of at most 1 MiB",
    );
    const input = JSON.parse(readFileSync(file, "utf8"));
    const { report, exitCode } = runReleaseCommand(
      process.argv[2] ?? "report",
      input,
      (ref) => repositoryReferenceExists(root, ref),
    );
    if (process.argv[3] === "--json") console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`Release evidence: ${report.status}`);
      console.log(report.scope);
      for (const path of report.paths)
        console.log(
          `${path.id}: ${path.missing.length ? "pending " + path.missing.join(", ") : "required evidence recorded"}; hardware ${path.evidence.hardware.status}`,
        );
      console.log(
        `${report.excluded.length} excluded scopes retain their existing blockers.`,
      );
    }
    process.exitCode = exitCode;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Invalid release evidence.");
    process.exitCode = 1;
  }
}
