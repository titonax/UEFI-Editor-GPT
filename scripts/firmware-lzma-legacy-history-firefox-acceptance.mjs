// Focused exact first-LZMA legacy partial-load history acceptance. Private inputs stay local.
// Requires a separately installed Playwright; CI never supplies private firmware.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { firefox } = require(
  process.env.FIRMWARE_BROWSER_PLAYWRIGHT_MODULE || "playwright",
);
const fs = require("node:fs");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const sourcePath = process.env.FIRMWARE_ACCEPTANCE_IMAGE;
assert(sourcePath, "Set FIRMWARE_ACCEPTANCE_IMAGE to the accepted private source.");
const acceptanceUrl =
  process.env.FIRMWARE_ACCEPTANCE_URL || "https://titonax.github.io/UEFI-Editor-GPT/";
const sourceBytes = fs.readFileSync(sourcePath);
assert.equal(sourceBytes.length, 16777216);
assert.equal(
  crypto.createHash("sha256").update(sourceBytes).digest("hex"),
  "fcd0a7d9f42934b92783bc569ad3f48dea8e6b9775d0fafdd7b2dee9af587b03",
);
const root = fs.mkdtempSync(path.join(os.tmpdir(), "uefi-lzma-legacy-history-"));
fs.writeFileSync(root + "/source.bin", sourceBytes);
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
async function verifyByteComparisonReport(
  page,
  output,
  expected = {
    changed: 4987327,
    rangeCount: 19458,
    rebuiltPackedBytes: 4984931,
    remainingBytes: 22311,
  },
) {
  // Independent run-based scan of the downloaded physical image. Do not import
  // the production comparison helper or derive expectations from rendered data.
  const hex = (value) => `0x${value.toString(16).toUpperCase()}`;
  const sample = (bytes, start, end) =>
    [...bytes.subarray(start, Math.min(end, start + 16))]
      .map((value) => value.toString(16).toUpperCase().padStart(2, "0"))
      .join(" ");
  const expectedRows = [];
  let changed = 0;
  let rangeCount = 0;
  let offset = 0;
  let truncatedSample = false;
  while (offset < sourceBytes.length) {
    if (sourceBytes[offset] === output[offset]) {
      offset++;
      continue;
    }
    const start = offset;
    do {
      offset++;
    } while (offset < sourceBytes.length && sourceBytes[offset] !== output[offset]);
    changed += offset - start;
    rangeCount++;
    if (expectedRows.length < 64) {
      expectedRows.push([
        `${hex(start)} / ${hex(offset)}`,
        String(offset - start),
        sample(sourceBytes, start, offset),
        sample(output, start, offset),
      ]);
      truncatedSample ||= offset - start > 16;
    }
  }
  assert.equal(changed, expected.changed);
  assert.equal(rangeCount, expected.rangeCount);
  assert(rangeCount > 64, "This exact image must exercise omitted ranges.");
  assert(truncatedSample, "This exact image must exercise bounded byte samples.");
  await page.getByRole("button", { name: "Output details", exact: true }).click();
  const report = page.getByRole("dialog", {
    name: "Verified firmware output",
    exact: true,
  });
  await report.waitFor({ state: "visible" });
  const text = (await report.innerText()).replace(/\s+/g, " ");
  assert(
    text.includes(
      `${changed} of ${output.length} bytes changed; ${output.length - changed} unchanged. ${rangeCount} contiguous changed ranges.`,
    ),
    "Whole-image totals must match an independent scan of the actual download.",
  );
  assert(text.includes(`Showing 64 of ${rangeCount} ranges.`));
  assert(text.includes("at most 16 bytes from the start of its range"));
  assert(text.includes("Offsets refer to the complete physical image."));
  assert(
    text.includes(
      "BIOS region: [0x0, 0x1000000). 0 bytes outside BIOS preserved exactly.",
    ),
  );
  assert(text.includes(`16777216 bytes, ${expected.changed} changed bytes`));
  assert(
    new RegExp(
      `5007242[\\s\\S]*${expected.rebuiltPackedBytes}[\\s\\S]*${expected.remainingBytes}`,
    ).test(text),
    "Accepted allocation and remaining capacity must match.",
  );
  const rows = await report
    .getByRole("table", { name: "Complete-image changed bytes", exact: true })
    .locator("tbody tr")
    .evaluateAll((items) =>
      items.map((row) =>
        [...row.querySelectorAll("td")].map((cell) => cell.textContent.trim()),
      ),
    );
  // Do not print source/rebuilt samples, including in assertion diagnostics.
  assert(
    JSON.stringify(rows) === JSON.stringify(expectedRows),
    "Every displayed physical boundary, length and original/rebuilt sample must match.",
  );
  await page.keyboard.press("Escape");
  await report.waitFor({ state: "hidden" });
  for (const name of [
    "Output details",
    "Check firmware output",
    "Modified firmware image",
  ])
    assert.equal(
      await page.getByRole("button", { name, exact: true }).isDisabled(),
      false,
    );
  console.log("LZMA_BYTE_REPORT_EXACT_DOWNLOAD_SCAN", {
    changed,
    unchanged: output.length - changed,
    rangeCount,
    displayedRanges: rows.length,
    sampleLimit: 16,
  });
}

async function assertVerifiedOutputUnavailable(page, transition) {
  for (const name of [
    "Check firmware output",
    "Modified firmware image",
    "Output details",
  ])
    assert.equal(
      await page.getByRole("button", { name, exact: true }).isDisabled(),
      true,
      `${transition} must leave ${name} disabled`,
    );
}

(async () => {
  let browser;
  try {
    browser = await firefox.launch({
      executablePath: process.env.FIRMWARE_BROWSER_FIREFOX_EXECUTABLE || undefined,
      headless: true,
      firefoxUserPrefs:
        process.env.FIRMWARE_BROWSER_CONTAINER_SANDBOX === "1"
          ? { "security.sandbox.content.level": 0 }
          : undefined,
      env:
        process.env.FIRMWARE_BROWSER_CONTAINER_SANDBOX === "1"
          ? { ...process.env, MOZ_DISABLE_CONTENT_SANDBOX: "1" }
          : process.env,
    });
    const page = await browser.newPage({
      viewport: { width: 1600, height: 1000 },
      acceptDownloads: true,
      ignoreHTTPSErrors: process.env.FIRMWARE_BROWSER_IGNORE_HTTPS_ERRORS === "1",
    });
    page.setDefaultTimeout(60000);
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error));
    const assets = new Set();
    page.on("response", (r) => {
      if (/\.wasm|assets\/index-/.test(r.url())) assets.add(r.url().split("/").pop());
    });
    await page.goto(acceptanceUrl);
    await page
      .locator("input[type=file]")
      .first()
      .setInputFiles(root + "/source.bin");
    await page.getByRole("button", { name: "Start HII analysis", exact: true }).click();
    await page
      .getByRole("button", { name: "Change queue (0)", exact: true })
      .waitFor({ timeout: 240000 });
    console.log("OPENED", await browser.version(), [...assets]);
    const exportJson = page
      .getByRole("button", { name: "data.json", exact: true })
      .nth(1);
    const dp = page.waitForEvent("download");
    await exportJson.click();
    const download = await dp;
    await download.saveAs(root + "/original.json");
    const data = JSON.parse(fs.readFileSync(root + "/original.json", "utf8"));
    const scope = data.suppressions.find((s) => s.offset.toLowerCase() === "0x5b2d9");
    assert(scope);
    assert.equal(scope.active, true);
    assert.equal(data.suppressions[7].offset, "0x5B448");
    assert.equal(data.suppressions[8].offset, "0x5B46F");
    for (const conditionIndex of [7, 8]) {
      assert.equal(data.suppressions[conditionIndex].kind, "SuppressIf");
      assert.equal(data.suppressions[conditionIndex].active, true);
    }
    const readOnlyConditionIndex = data.suppressions.findIndex(
      (condition) => (condition.kind ?? "SuppressIf") !== "SuppressIf",
    );
    assert.notEqual(
      readOnlyConditionIndex,
      -1,
      "The accepted source must retain a read-only non-SuppressIf condition",
    );
    console.log(
      "SOURCE_EDITOR",
      JSON.stringify({
        forms: data.forms.length,
        suppressions: data.suppressions.length,
        offset: scope.offset,
        readOnlyConditionKind: data.suppressions[readOnlyConditionIndex].kind,
      }),
    );
    const jsonInput = page.locator('input[type=file][accept=".json"]').first();
    await jsonInput.setInputFiles(root + "/original.json");
    await page.waitForFunction(
      () =>
        document.querySelector('input[type=file][accept=".json"]').files.length === 0,
    );
    await page.getByRole("button", { name: "Change queue (0)", exact: true }).waitFor();
    console.log("UNCHANGED_IMPORT_QUEUE_ZERO");
    scope.active = false;
    fs.writeFileSync(root + "/edit.json", JSON.stringify(data));
    await jsonInput.setInputFiles(root + "/edit.json");
    await page.waitForFunction(
      () =>
        document.querySelector('input[type=file][accept=".json"]').files.length === 0,
    );
    await page.getByRole("button", { name: "Change queue (1)", exact: true }).click();
    const queue = page.getByRole("dialog", { name: "Change queue", exact: true });
    assert.match(await queue.innerText(), /1 NET LOGICAL FIELD/);
    assert.match(await queue.innerText(), /Disable SuppressIf 0x5B2D9/);
    console.log("ONE_SELECTED_SUPPRESSION_FIELD");
    assert.equal(
      await page
        .getByRole("button", { name: "Check firmware output", exact: true })
        .isDisabled(),
      true,
    );
    const sessionPromise = page.waitForEvent(
      "download",
      (d) => d.suggestedFilename() === "firmware-session.json",
    );
    await queue
      .getByRole("button", { name: "Save queue session", exact: true })
      .click();
    const sessionPath = root + "/session-v2.json";
    await (await sessionPromise).saveAs(sessionPath);
    const session = JSON.parse(fs.readFileSync(sessionPath, "utf8"));
    assert.deepEqual(Object.keys(session).sort(), [
      "format",
      "kind",
      "operations",
      "source",
      "version",
    ]);
    assert.equal(session.format, "uefi-editor-queue-session");
    assert.equal(session.version, 2);
    assert.equal(session.kind, "hii-menu-actions");
    assert.deepEqual(Object.keys(session.source).sort(), [
      "contextSha256",
      "sha256",
      "size",
    ]);
    assert.equal(session.source.sha256, sha(sourceBytes));
    assert.equal(session.source.size, sourceBytes.length);
    assert.match(session.source.contextSha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(session.operations, [
      {
        action: "suppressions",
        changes: [{ conditionIndex: data.suppressions.indexOf(scope), active: false }],
        enabled: true,
      },
    ]);
    assert.doesNotMatch(
      JSON.stringify(session),
      /patches|expected|replacement|ifrBinary|history|applied|fileName|offset|source\.bin/,
    );
    console.log("V2_EXPORTED_METADATA_ONLY", JSON.stringify(session.operations));

    // Keep the broad session checker unchanged. This focused run measures only
    // the legacy partial-load history, with independently checked actual files.
    const fullSession = structuredClone(session);
    fullSession.operations.push(
      ...[7, 8].map((conditionIndex) => ({
        action: "suppressions",
        changes: [{ conditionIndex, active: false }],
        enabled: true,
      })),
    );
    const partialSession = structuredClone(fullSession);
    partialSession.operations[1].enabled = false;
    partialSession.operations[2].enabled = false;
    const fullPath = root + "/full-v2.json";
    const legacyPath = root + "/partial-v1.json";
    fs.writeFileSync(fullPath, JSON.stringify(fullSession));
    fs.writeFileSync(legacyPath, JSON.stringify({ ...partialSession, version: 1 }));
    const imageButton = page.getByRole("button", {
      name: "Modified firmware image",
      exact: true,
    });
    const fullReport = {
      changed: 4987262,
      rangeCount: 19522,
      rebuiltPackedBytes: 4985240,
      remainingBytes: 22002,
    };
    const outputs = [];
    const assertPlan = async (expected, label) => {
      const selected = expected.operations.filter((op) => op.enabled).length;
      assert.match(await queue.innerText(), new RegExp(selected + " SELECTED"));
      assert.match(
        await queue.innerText(),
        new RegExp(selected + " NET LOGICAL FIELD\\(S\\)"),
      );
      assert.equal(await queue.getByRole("alert").count(), 0);
      await assertVerifiedOutputUnavailable(page, label);
      const pending = page.waitForEvent(
        "download",
        (d) => d.suggestedFilename() === "firmware-session.json",
      );
      await queue
        .getByRole("button", { name: "Save queue session", exact: true })
        .click();
      const metadataPath = root + "/" + label + ".json";
      await (await pending).saveAs(metadataPath);
      assert(
        JSON.stringify(JSON.parse(fs.readFileSync(metadataPath, "utf8"))) ===
          JSON.stringify(expected),
        "The exact ordered v2 session and all enabled flags must match",
      );
    };
    const restore = async (filePath, expected, label) => {
      await queue.getByLabel("Load queue session file").setInputFiles(filePath);
      const selected = expected.operations.filter((op) => op.enabled).length;
      await page.waitForFunction(
        (count) => document.body.innerText.includes(count + " SELECTED"),
        selected,
        { timeout: 60000 },
      );
      const started = Date.now();
      while (
        await queue
          .getByRole("button", { name: "Apply selected", exact: true })
          .isDisabled()
      ) {
        if (Date.now() - started > 60000)
          throw Error("Session restore exceeded one minute");
        await page.waitForTimeout(100);
      }
      await assertPlan(expected, label);
    };
    const build = async (label, full, reference) => {
      await queue.getByRole("button", { name: "Apply selected", exact: true }).click();
      await queue.getByRole("button", { name: "Close", exact: true }).click();
      await page
        .getByRole("button", { name: "Check firmware output", exact: true })
        .click();
      const started = Date.now();
      while (await imageButton.isDisabled()) {
        if ((await page.locator("body").innerText()).includes("Output check failed:"))
          throw Error("Legacy partial-history output check failed");
        if (Date.now() - started > 900000)
          throw Error("Legacy partial-history output check exceeded 15 minutes");
        await page.waitForTimeout(1000);
      }
      const pending = page.waitForEvent("download", (d) =>
        d.suggestedFilename().endsWith(".bin"),
      );
      await imageButton.click();
      const imagePath = root + "/" + label + ".bin";
      await (await pending).saveAs(imagePath);
      const bytes = fs.readFileSync(imagePath);
      assert.equal(bytes.length, sourceBytes.length);
      assert.equal(
        sha(bytes),
        full
          ? "56c82468e64ba69d036c0eb7e913bd439e1f625a983f67af5445a62110bc89d6"
          : "31973e862e1929f8791508582da5189f28355a2577fcab15f28f90056299d543",
      );
      let outside = 0;
      for (let offset = 0; offset < sourceBytes.length; offset++)
        if (
          bytes[offset] !== sourceBytes[offset] &&
          (offset < 2949240 || offset >= 7956530)
        )
          outside++;
      assert.equal(outside, 0);
      if (reference)
        assert(
          bytes.equals(reference),
          "History must freshly rebuild the independent baseline bytes",
        );
      await verifyByteComparisonReport(page, bytes, full ? fullReport : undefined);
      outputs.push({
        label,
        imagePath,
        full,
        sessionPath: full ? fullPath : legacyPath,
      });
      console.log(
        "LEGACY_PARTIAL_HISTORY_FRESH_BIOS",
        label,
        full ? "three-scopes" : "one-scope",
      );
      await page.getByRole("button", { name: "Change queue (3)", exact: true }).click();
      return bytes;
    };

    await restore(fullPath, fullSession, "full-predecessor");
    const fullBaseline = await build("full-before-load", true);
    await restore(legacyPath, partialSession, "legacy-partial-load");
    const partialBaseline = await build("partial-before-undo", false);
    assert(
      !partialBaseline.equals(fullBaseline),
      "The two selected plans must produce distinct BIOS bytes",
    );
    await queue.getByRole("button", { name: "Undo queue change", exact: true }).click();
    await assertPlan(fullSession, "legacy-load-undo");
    await build("legacy-load-undo", true, fullBaseline);
    await queue.getByRole("button", { name: "Redo queue change", exact: true }).click();
    await assertPlan(partialSession, "legacy-load-redo");
    await build("legacy-load-redo", false, partialBaseline);
    // Branch from the full selection by loading the same legacy partial plan
    // again. Identical earlier metadata must not resurrect its verified bytes
    // or retain the abandoned Redo branch.
    await queue.getByRole("button", { name: "Undo queue change", exact: true }).click();
    await assertPlan(fullSession, "legacy-branch-undo");
    const redo = queue.getByRole("button", { name: "Redo queue change", exact: true });
    assert.equal(
      await redo.isDisabled(),
      false,
      "Undo must offer the old partial branch",
    );
    await restore(legacyPath, partialSession, "legacy-branch-load");
    assert.equal(
      await redo.isDisabled(),
      true,
      "A new load must discard the old Redo branch",
    );
    await build("legacy-branch-load", false, partialBaseline);
    assert.equal(
      await redo.isDisabled(),
      true,
      "Apply/Check must not restore discarded Redo",
    );
    assert.equal(outputs.length, 5);
    console.log("LEGACY_PARTIAL_HISTORY_NEW_LOAD_DISCARDS_REDO_AND_FRESH_BIOS");

    for (const output of outputs) {
      await page.reload();
      await page.locator("input[type=file]").first().setInputFiles(output.imagePath);
      await page
        .getByRole("button", { name: "Start HII analysis", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Change queue (0)", exact: true })
        .waitFor({ timeout: 240000 });
      const pending = page.waitForEvent("download");
      await page.getByRole("button", { name: "data.json", exact: true }).nth(1).click();
      const parsedPath = root + "/reopened.json";
      await (await pending).saveAs(parsedPath);
      const reopened = JSON.parse(fs.readFileSync(parsedPath, "utf8"));
      assert.equal(reopened.forms.length, 277);
      assert.equal(reopened.suppressions.length, 3548);
      for (const [index, emptyStart] of [
        [0, "0x5B2F3"],
        [7, "0x5B44C"],
        [8, "0x5B477"],
      ]) {
        const original = data.suppressions[index];
        const actual = reopened.suppressions.find(
          (condition) =>
            condition.offset.toLowerCase() === original.offset.toLowerCase(),
        );
        assert(actual);
        assert.equal(actual.expression, original.expression);
        if (output.full || index === 0) {
          assert.equal(actual.start, emptyStart);
          assert.equal(actual.end, emptyStart);
        } else {
          assert.equal(actual.start, original.start);
          assert.equal(actual.end, original.end);
          assert(
            Number.parseInt(actual.end, 16) > Number.parseInt(actual.start, 16),
            "A paused scope must retain its original nonempty body",
          );
        }
      }
      assert.equal(await imageButton.isDisabled(), true);
      await page.getByRole("button", { name: "Change queue (0)", exact: true }).click();
      const reopenedQueue = page.getByRole("dialog", {
        name: "Change queue",
        exact: true,
      });
      await reopenedQueue
        .getByLabel("Load queue session file")
        .setInputFiles(output.sessionPath);
      const rejection = reopenedQueue.getByRole("alert");
      await rejection.waitFor();
      assert.match(
        await rejection.innerText(),
        /different firmware image or opened HII context/,
      );
      assert.match(await reopenedQueue.innerText(), /The queue is empty/);
      assert.equal(await imageButton.isDisabled(), true);
      console.log(
        "LEGACY_PARTIAL_HISTORY_INDEPENDENT_REOPEN_AND_IDENTITY_REJECTION",
        output.label,
      );
    }
    assert.equal(pageErrors.length, 0, "No application page errors are allowed.");
    console.log("LEGACY_PARTIAL_HISTORY_ACCEPTED", outputs.length, [...assets]);
  } finally {
    await browser?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
