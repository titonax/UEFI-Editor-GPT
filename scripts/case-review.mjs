import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reviewedDir = join(root, "src/knowledge/cases/reviewed");
const numberFields = [
  "firmwareVolumeCount",
  "ffs2VolumeCount",
  "ffs3VolumeCount",
  "outerSetupCount",
  "outerAmitseCount",
  "guidedLzmaSectionCount",
  "formSetCount",
  "formCount",
  "legacyModuleCount",
];
const enumFields = {
  family: [
    "ami-aptio",
    "ami-legacy",
    "insyde",
    "phoenix",
    "phoenix-uefi",
    "award",
    "intel-me",
    "non-firmware",
  ],
  container: [
    "intel-flash",
    "firmware-volume-image",
    "vendor-image",
    "ami-legacy-rom",
    "award-rom",
    "phoenix-rom",
  ],
  layout: ["split-form-packages", "unified-setup-formset"],
  navigation: ["multi-formset-root-vector", "single-formset-ifr-hub"],
};
const brands = [
  "ASRock",
  "ASUS",
  "Dell",
  "eMachines",
  "Gigabyte",
  "HP",
  "Intel",
  "MSI",
  "Supermicro",
];

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function keys(value, allowed, label) {
  ensure(
    value && typeof value === "object" && !Array.isArray(value),
    `${label} must be an object`,
  );
  ensure(
    Object.keys(value).every((key) => allowed.includes(key)),
    `${label} has an unknown field`,
  );
}

function existingRelativePath(path, pattern) {
  ensure(
    typeof path === "string" && pattern.test(path) && !path.includes(".."),
    `Unsafe or invalid repository path: ${String(path)}`,
  );
  const file = resolve(root, path);
  ensure(
    file.startsWith(`${root}/`) && existsSync(file),
    `Missing repository file: ${path}`,
  );
  return file;
}

export function validateCase(entry) {
  keys(
    entry,
    [
      "id",
      "label",
      "sha256",
      "size",
      "fileNames",
      "brand",
      "source",
      "generation",
      "structure",
      "regressionTests",
      "limitations",
    ],
    "case",
  );
  ensure(
    typeof entry.id === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id),
    "Invalid case id",
  );
  ensure(
    typeof entry.label === "string" && entry.label.trim().length > 0,
    "Missing case label",
  );
  ensure(
    typeof entry.sha256 === "string" && /^[a-f0-9]{64}$/.test(entry.sha256),
    "Invalid SHA-256",
  );
  ensure(Number.isSafeInteger(entry.size) && entry.size > 0, "Invalid input size");
  ensure(
    Array.isArray(entry.fileNames) &&
      entry.fileNames.length > 0 &&
      entry.fileNames.every(
        (name) => typeof name === "string" && name.trim() && !/[\\/]/.test(name),
      ),
    "File aliases must be base names",
  );
  if (entry.brand !== undefined)
    ensure(brands.includes(entry.brand), "Unsupported brand");
  keys(
    entry.structure,
    [...numberFields, ...Object.keys(enumFields), "intelDescriptor"],
    "structure",
  );
  ensure(
    Object.keys(entry.structure).length > 0,
    "A reviewed structural observation is required",
  );
  for (const [field, value] of Object.entries(entry.structure)) {
    if (numberFields.includes(field))
      ensure(Number.isSafeInteger(value) && value >= 0, `Invalid count: ${field}`);
    else if (field === "intelDescriptor")
      ensure(typeof value === "boolean", "Invalid descriptor observation");
    else
      ensure(
        enumFields[field].includes(value),
        `Unresolved or invalid classifier: ${field}`,
      );
  }
  if (entry.generation !== undefined) {
    keys(entry.generation, ["generation", "confidence", "conflict"], "generation");
    ensure(
      ["aptio-iv", "aptio-v", "unresolved"].includes(entry.generation.generation) &&
        ["confirmed", "probable", "unresolved"].includes(entry.generation.confidence) &&
        typeof entry.generation.conflict === "boolean",
      "Invalid generation assessment",
    );
  }
  const source = existingRelativePath(entry.source, /^docs\/[a-zA-Z0-9/_-]+\.md$/);
  ensure(
    readFileSync(source, "utf8").toLowerCase().includes(entry.sha256),
    "Source record must contain the exact SHA-256",
  );
  ensure(
    Array.isArray(entry.regressionTests) && entry.regressionTests.length > 0,
    "At least one regression test is required",
  );
  entry.regressionTests.forEach((path) =>
    existingRelativePath(path, /^src\/[a-zA-Z0-9/_-]+\.test\.ts$/),
  );
  ensure(
    Array.isArray(entry.limitations) &&
      entry.limitations.length > 0 &&
      entry.limitations.every((item) => typeof item === "string" && item.trim()),
    "Explicit limitations are required",
  );
  return entry;
}

function curatedIdentities() {
  const identities = [];
  for (const path of ["ami.ts", "legacy.ts"]) {
    const text = readFileSync(join(root, "src/knowledge/cases", path), "utf8");
    for (const match of text.matchAll(
      /id: "([a-z0-9-]+)"[\s\S]*?sha256: "([a-f0-9]{64})"/g,
    )) {
      identities.push({ id: match[1], sha256: match[2] });
    }
  }
  return identities;
}

export function checkReviewedCases() {
  const cases = existsSync(reviewedDir)
    ? readdirSync(reviewedDir)
        .filter((name) => name.endsWith(".json"))
        .sort()
    : [];
  const ids = new Set();
  const hashes = new Set();
  for (const entry of curatedIdentities()) {
    ids.add(entry.id);
    hashes.add(entry.sha256);
  }
  for (const name of cases) {
    const entry = validateCase(
      JSON.parse(readFileSync(join(reviewedDir, name), "utf8")),
    );
    ensure(name === `${entry.id}.json`, `Case filename must match its id: ${name}`);
    ensure(
      !ids.has(entry.id) && !hashes.has(entry.sha256),
      `Duplicate case identity: ${entry.id}`,
    );
    ids.add(entry.id);
    hashes.add(entry.sha256);
  }
  return cases.length;
}

export function addDraft(path) {
  ensure(typeof path === "string", "Usage: npm run case:add -- path/to/case.json");
  const draft = JSON.parse(readFileSync(resolve(path), "utf8"));
  keys(draft, ["schemaVersion", "status", "case", "observations"], "draft");
  ensure(
    draft.schemaVersion === "1.0.0" && draft.status === "draft",
    "Unsupported case draft version",
  );
  const entry = validateCase(draft.case);
  checkReviewedCases();
  const known = curatedIdentities();
  ensure(
    !known.some((item) => item.id === entry.id || item.sha256 === entry.sha256),
    "This case is already documented",
  );
  const reviewed = existsSync(reviewedDir)
    ? readdirSync(reviewedDir)
        .filter((name) => name.endsWith(".json"))
        .map((name) => JSON.parse(readFileSync(join(reviewedDir, name), "utf8")))
    : [];
  ensure(
    !reviewed.some((item) => item.id === entry.id || item.sha256 === entry.sha256),
    `Case already exists: ${entry.id}`,
  );
  mkdirSync(reviewedDir, { recursive: true });
  const destination = join(reviewedDir, `${entry.id}.json`);
  ensure(!existsSync(destination), `Case already exists: ${entry.id}`);
  // Only the reviewed case fields are shipped; context observations remain in the draft.
  writeFileSync(destination, `${JSON.stringify(entry, null, 2)}\n`, { flag: "wx" });
  checkReviewedCases();
  return destination;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const command = process.argv[2];
    if (command === "check")
      console.log(`Validated ${checkReviewedCases()} reviewed JSON cases.`);
    else if (command === "add") console.log(`Added ${addDraft(process.argv[3])}`);
    else throw new Error("Usage: node scripts/case-review.mjs check|add [case.json]");
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
