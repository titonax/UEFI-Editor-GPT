// Opt-in exact first-LZMA v2/v1 session acceptance. Private firmware/JSON stay local.
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
const root = fs.mkdtempSync(path.join(os.tmpdir(), "uefi-lzma-session-firefox-"));
fs.writeFileSync(root + "/source.bin", sourceBytes);
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
async function verifyByteComparisonReport(page, output) {
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
  assert.equal(changed, 4987327);
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
  assert(text.includes("16777216 bytes, 4987327 changed bytes"));
  assert(
    /5007242[\s\S]*4984931[\s\S]*22311/.test(text),
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
    const legacyPath = root + "/session-v1.json";
    fs.writeFileSync(legacyPath, JSON.stringify({ ...session, version: 1 }));
    const pausedSession = structuredClone(session);
    pausedSession.operations[0].enabled = false;
    const pausedSessionPath = root + "/session-paused-v2.json";
    fs.writeFileSync(pausedSessionPath, JSON.stringify(pausedSession));
    const invalidSemanticSession = structuredClone(session);
    invalidSemanticSession.operations[0].changes[0].conditionIndex =
      data.suppressions.length + 1;
    const invalidSemanticSessionPath = root + "/session-invalid-suppression-v2.json";
    fs.writeFileSync(
      invalidSemanticSessionPath,
      JSON.stringify(invalidSemanticSession),
    );
    const readOnlySemanticSession = structuredClone(session);
    readOnlySemanticSession.operations[0].changes[0].conditionIndex =
      readOnlyConditionIndex;
    const readOnlySemanticSessionPath = root + "/session-read-only-condition-v2.json";
    fs.writeFileSync(
      readOnlySemanticSessionPath,
      JSON.stringify(readOnlySemanticSession),
    );
    const atomicSemanticSession = structuredClone(session);
    atomicSemanticSession.operations[0].enabled = false;
    atomicSemanticSession.operations.push({
      action: "suppressions",
      changes: [{ conditionIndex: data.suppressions.length + 1, active: false }],
      enabled: false,
    });
    const atomicSemanticSessionPath = root + "/session-atomic-rejection-v2.json";
    fs.writeFileSync(atomicSemanticSessionPath, JSON.stringify(atomicSemanticSession));
    const button = page.getByRole("button", {
      name: "Modified firmware image",
      exact: true,
    });
    let baseline;
    for (const version of [2, 1]) {
      await queue.getByRole("button", { name: "Clear queue", exact: true }).click();
      assert.match(await queue.innerText(), /The queue is empty/);
      await queue
        .getByLabel("Load queue session file")
        .setInputFiles(version === 2 ? sessionPath : legacyPath);
      const restoreStarted = Date.now();
      while (
        await queue
          .getByRole("button", { name: "Apply selected", exact: true })
          .isDisabled()
      ) {
        if (Date.now() - restoreStarted > 60000)
          throw Error("Session restore did not finish within one minute");
        await page.waitForTimeout(100);
      }
      assert.match(await queue.innerText(), /1 SELECTED/);
      assert.match(await queue.innerText(), /Disable SuppressIf 0x5B2D9/);
      assert.equal(
        await page
          .getByRole("button", { name: "Check firmware output", exact: true })
          .isDisabled(),
        true,
      );
      assert.equal(await button.isDisabled(), true);
      assert.equal(
        await page
          .getByRole("button", { name: "Output details", exact: true })
          .isDisabled(),
        true,
      );
      const migratedPromise = page.waitForEvent("download");
      await queue
        .getByRole("button", { name: "Save queue session", exact: true })
        .click();
      const migratedPath = root + `/migrated-v${version}.json`;
      await (await migratedPromise).saveAs(migratedPath);
      assert.deepEqual(
        JSON.parse(fs.readFileSync(migratedPath, "utf8")),
        session,
        "Restore/migration must retain every selector and identity in metadata-only v2",
      );
      console.log("SESSION_RESTORED_IDENTICAL_V2_UNAPPLIED_NO_CACHED_OUTPUT", version);
      await queue.getByRole("button", { name: "Apply selected", exact: true }).click();
      await queue.getByRole("button", { name: "Close", exact: true }).click();
      assert.equal(
        await page
          .getByRole("button", { name: "Modified firmware image", exact: true })
          .isDisabled(),
        true,
      );
      await page
        .getByRole("button", { name: "Check firmware output", exact: true })
        .click();
      console.log("BUILD_STARTED");
      const started = Date.now();
      while (await button.isDisabled()) {
        const text = await page.locator("body").innerText();
        if (text.includes("Output check failed:"))
          throw Error(
            text.slice(
              text.indexOf("Output check failed:"),
              text.indexOf("Output check failed:") + 400,
            ),
          );
        if (Date.now() - started > 900000)
          throw Error("Output check did not finish within 15 minutes");
        await page.waitForTimeout(1000);
      }
      console.log("BUILD_READY_SECONDS", (Date.now() - started) / 1000);
      const imagePromise = page.waitForEvent("download", (d) =>
        d.suggestedFilename().endsWith(".bin"),
      );
      await button.click();
      const imageDownload = await imagePromise;
      await imageDownload.saveAs(root + `/output-v${version}.bin`);
      const original = fs.readFileSync(root + "/source.bin"),
        output = fs.readFileSync(root + `/output-v${version}.bin`);
      assert.equal(output.length, original.length);
      assert.equal(
        sha(output),
        "31973e862e1929f8791508582da5189f28355a2577fcab15f28f90056299d543",
      );
      let changed = 0,
        outside = 0;
      for (let i = 0; i < output.length; i++)
        if (output[i] !== original[i]) {
          changed++;
          if (i < 2949240 || i >= 7956530) outside++;
        }
      assert.equal(outside, 0);
      assert.equal(changed, 4987327);
      console.log(
        "DOWNLOAD_VERIFIED",
        JSON.stringify({ size: output.length, sha256: sha(output), changed, outside }),
      );
      await verifyByteComparisonReport(page, output);
      if (baseline)
        assert(
          output.equals(baseline),
          "v1 and v2 must rebuild identical complete BIOS images",
        );
      else baseline = output;
      await page.getByRole("button", { name: "Change queue (1)", exact: true }).click();
    }

    // Loading a session must remain one undoable queue replacement. Exercise
    // that shared history boundary with a real checked output so Undo and Redo
    // cannot accidentally retain bytes verified for an obsolete queue revision.
    await queue.getByRole("button", { name: "Clear queue", exact: true }).click();
    assert.match(await queue.innerText(), /The queue is empty/);
    await queue.getByLabel("Load queue session file").setInputFiles(sessionPath);
    const historyRestoreStarted = Date.now();
    while (
      await queue
        .getByRole("button", { name: "Apply selected", exact: true })
        .isDisabled()
    ) {
      if (Date.now() - historyRestoreStarted > 60000)
        throw Error("History session restore did not finish within one minute");
      await page.waitForTimeout(100);
    }
    assert.match(await queue.innerText(), /1 SELECTED/);
    await queue.getByRole("button", { name: "Apply selected", exact: true }).click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    await page
      .getByRole("button", { name: "Check firmware output", exact: true })
      .click();
    const historyReadyStarted = Date.now();
    while (await button.isDisabled()) {
      const text = await page.locator("body").innerText();
      if (text.includes("Output check failed:"))
        throw Error(
          text.slice(
            text.indexOf("Output check failed:"),
            text.indexOf("Output check failed:") + 400,
          ),
        );
      if (Date.now() - historyReadyStarted > 900000)
        throw Error("History output check did not finish within 15 minutes");
      await page.waitForTimeout(1000);
    }
    const beforeUndoPromise = page.waitForEvent("download", (d) =>
      d.suggestedFilename().endsWith(".bin"),
    );
    await button.click();
    await (await beforeUndoPromise).saveAs(root + "/history-before-undo.bin");
    const beforeUndo = fs.readFileSync(root + "/history-before-undo.bin");
    assert(beforeUndo.equals(baseline), "Loaded-session output must equal baseline");
    await verifyByteComparisonReport(page, beforeUndo);
    await page.getByRole("button", { name: "Change queue (1)", exact: true }).click();
    await queue.getByRole("button", { name: "Undo queue change", exact: true }).click();
    assert.match(await queue.innerText(), /The queue is empty/);
    for (const name of [
      "Check firmware output",
      "Modified firmware image",
      "Output details",
    ])
      assert.equal(
        await page.getByRole("button", { name, exact: true }).isDisabled(),
        true,
        `Undo must invalidate ${name}`,
      );
    await queue.getByRole("button", { name: "Redo queue change", exact: true }).click();
    assert.match(await queue.innerText(), /1 SELECTED/);
    assert.match(await queue.innerText(), /Disable SuppressIf 0x5B2D9/);
    for (const name of [
      "Check firmware output",
      "Modified firmware image",
      "Output details",
    ])
      assert.equal(
        await page.getByRole("button", { name, exact: true }).isDisabled(),
        true,
        `Redo must require a fresh check before enabling ${name}`,
      );
    const redoneSessionPromise = page.waitForEvent("download");
    await queue
      .getByRole("button", { name: "Save queue session", exact: true })
      .click();
    const redoneSessionPath = root + "/history-redone-v2.json";
    await (await redoneSessionPromise).saveAs(redoneSessionPath);
    assert.deepEqual(
      JSON.parse(fs.readFileSync(redoneSessionPath, "utf8")),
      session,
      "Redo must preserve the exact metadata-only session",
    );
    await queue.getByRole("button", { name: "Apply selected", exact: true }).click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    await page
      .getByRole("button", { name: "Check firmware output", exact: true })
      .click();
    const historyRedoStarted = Date.now();
    while (await button.isDisabled()) {
      const text = await page.locator("body").innerText();
      if (text.includes("Output check failed:"))
        throw Error(
          text.slice(
            text.indexOf("Output check failed:"),
            text.indexOf("Output check failed:") + 400,
          ),
        );
      if (Date.now() - historyRedoStarted > 900000)
        throw Error("Post-Redo output check did not finish within 15 minutes");
      await page.waitForTimeout(1000);
    }
    const afterRedoPromise = page.waitForEvent("download", (d) =>
      d.suggestedFilename().endsWith(".bin"),
    );
    await button.click();
    await (await afterRedoPromise).saveAs(root + "/history-after-redo.bin");
    const afterRedo = fs.readFileSync(root + "/history-after-redo.bin");
    assert(afterRedo.equals(baseline), "Post-Redo output must equal baseline");
    await verifyByteComparisonReport(page, afterRedo);
    console.log("SESSION_LOAD_UNDO_REDO_INVALIDATED_AND_FRESH_OUTPUT_IDENTICAL");
    await page.getByRole("button", { name: "Change queue (1)", exact: true }).click();

    // Exercise a longer shared history with three distinct queue states after
    // the ready output above: selected -> paused -> empty -> session-restored.
    // Traverse the complete sequence in both directions. Every transition must
    // invalidate the previously checked bytes, even when history returns to an
    // entry list that is structurally identical to an earlier applied plan.
    const queueCheckboxes = queue.getByRole("checkbox");
    assert.equal(
      await queueCheckboxes.count(),
      1,
      "The accepted one-operation queue must expose exactly one selector",
    );
    const selectSuppression = queueCheckboxes.first();
    await selectSuppression.uncheck();
    assert.match(await queue.innerText(), /0 SELECTED/);
    assert.match(await queue.innerText(), /Disable SuppressIf 0x5B2D9/);
    await assertVerifiedOutputUnavailable(page, "Pausing the operation");
    await queue.getByRole("button", { name: "Clear queue", exact: true }).click();
    assert.match(await queue.innerText(), /The queue is empty/);
    await assertVerifiedOutputUnavailable(page, "Clearing the paused queue");
    await queue.getByLabel("Load queue session file").setInputFiles(sessionPath);
    const longHistoryRestoreStarted = Date.now();
    while (
      await queue
        .getByRole("button", { name: "Apply selected", exact: true })
        .isDisabled()
    ) {
      if (Date.now() - longHistoryRestoreStarted > 60000)
        throw Error("Long-history session restore did not finish within one minute");
      await page.waitForTimeout(100);
    }
    assert.match(await queue.innerText(), /1 SELECTED/);
    await assertVerifiedOutputUnavailable(page, "Loading the long-history session");

    await queue.getByRole("button", { name: "Undo queue change", exact: true }).click();
    assert.match(await queue.innerText(), /The queue is empty/);
    await assertVerifiedOutputUnavailable(page, "First long-history Undo");
    await queue.getByRole("button", { name: "Undo queue change", exact: true }).click();
    assert.match(await queue.innerText(), /0 SELECTED/);
    assert.equal(await selectSuppression.isChecked(), false);
    await assertVerifiedOutputUnavailable(page, "Second long-history Undo");
    await queue.getByRole("button", { name: "Undo queue change", exact: true }).click();
    assert.match(await queue.innerText(), /1 SELECTED/);
    assert.equal(await selectSuppression.isChecked(), true);
    await assertVerifiedOutputUnavailable(page, "Third long-history Undo");

    await queue.getByRole("button", { name: "Redo queue change", exact: true }).click();
    assert.match(await queue.innerText(), /0 SELECTED/);
    assert.equal(await selectSuppression.isChecked(), false);
    await assertVerifiedOutputUnavailable(page, "First long-history Redo");
    await queue.getByRole("button", { name: "Redo queue change", exact: true }).click();
    assert.match(await queue.innerText(), /The queue is empty/);
    await assertVerifiedOutputUnavailable(page, "Second long-history Redo");
    await queue.getByRole("button", { name: "Redo queue change", exact: true }).click();
    assert.match(await queue.innerText(), /1 SELECTED/);
    assert.equal(await selectSuppression.isChecked(), true);
    await assertVerifiedOutputUnavailable(page, "Third long-history Redo");

    const longHistorySessionPromise = page.waitForEvent("download");
    await queue
      .getByRole("button", { name: "Save queue session", exact: true })
      .click();
    const longHistorySessionPath = root + "/long-history-redone-v2.json";
    await (await longHistorySessionPromise).saveAs(longHistorySessionPath);
    assert.deepEqual(
      JSON.parse(fs.readFileSync(longHistorySessionPath, "utf8")),
      session,
      "Long-history Redo must preserve the exact metadata-only session",
    );
    await queue.getByRole("button", { name: "Apply selected", exact: true }).click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    await page
      .getByRole("button", { name: "Check firmware output", exact: true })
      .click();
    const longHistoryBuildStarted = Date.now();
    while (await button.isDisabled()) {
      const text = await page.locator("body").innerText();
      if (text.includes("Output check failed:"))
        throw Error(
          text.slice(
            text.indexOf("Output check failed:"),
            text.indexOf("Output check failed:") + 400,
          ),
        );
      if (Date.now() - longHistoryBuildStarted > 900000)
        throw Error("Long-history output check did not finish within 15 minutes");
      await page.waitForTimeout(1000);
    }
    const longHistoryImagePromise = page.waitForEvent("download", (d) =>
      d.suggestedFilename().endsWith(".bin"),
    );
    await button.click();
    const longHistoryImagePath = root + "/long-history-after-redo.bin";
    await (await longHistoryImagePromise).saveAs(longHistoryImagePath);
    const longHistoryOutput = fs.readFileSync(longHistoryImagePath);
    assert(
      longHistoryOutput.equals(baseline),
      "Long-history output must equal every earlier accepted baseline",
    );
    await verifyByteComparisonReport(page, longHistoryOutput);
    console.log("THREE_STEP_UNDO_REDO_PAUSED_EMPTY_SESSION_FRESH_OUTPUT_IDENTICAL");
    await page.getByRole("button", { name: "Change queue (1)", exact: true }).click();

    // Isolate queue-revision cancellation while the dialog and source stay
    // mounted. Hold a real native File.text delivery for a valid paused session,
    // mutate selection and Undo back to the original selected shape. The stale
    // delivery must stop before AMI identity hashing, retain the current history
    // branch and never restore bytes verified for an older revision.
    const heldSessionPath = root + "/held-first-lzma-session.json";
    fs.copyFileSync(pausedSessionPath, heldSessionPath);
    const documentOrigin = await page.evaluate(() => performance.timeOrigin);
    await page.evaluate(() => {
      const textDescriptor = Object.getOwnPropertyDescriptor(File.prototype, "text");
      const digestDescriptor = Object.getOwnPropertyDescriptor(crypto.subtle, "digest");
      const nativeText = File.prototype.text;
      const nativeDigest = crypto.subtle.digest;
      const state = {
        calls: 0,
        nativeCompleted: 0,
        delivered: 0,
        hashes: 0,
        held: false,
      };
      let armed = true;
      let release;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      File.prototype.text = async function (...args) {
        const hold = armed && this.name === "held-first-lzma-session.json";
        if (hold) {
          armed = false;
          state.calls++;
        }
        const text = await nativeText.apply(this, args);
        if (hold) {
          state.nativeCompleted++;
          state.held = true;
          await gate;
          state.held = false;
          state.delivered++;
        }
        return text;
      };
      crypto.subtle.digest = function (...args) {
        state.hashes++;
        return nativeDigest.apply(this, args);
      };
      window.__firstLzmaReadProbe = {
        state,
        release,
        restore: () => {
          if (textDescriptor)
            Object.defineProperty(File.prototype, "text", textDescriptor);
          else delete File.prototype.text;
          if (digestDescriptor)
            Object.defineProperty(crypto.subtle, "digest", digestDescriptor);
          else delete crypto.subtle.digest;
        },
      };
    });
    await queue.getByLabel("Load queue session file").setInputFiles(heldSessionPath);
    await page.waitForFunction(() => window.__firstLzmaReadProbe.state.held);
    assert.deepEqual(await page.evaluate(() => window.__firstLzmaReadProbe.state), {
      calls: 1,
      nativeCompleted: 1,
      delivered: 0,
      hashes: 0,
      held: true,
    });
    assert.equal(await queue.getByText("Validating queue session…").isVisible(), true);
    await selectSuppression.uncheck();
    assert.match(await queue.innerText(), /0 SELECTED/);
    await assertVerifiedOutputUnavailable(page, "Selection during held session read");
    await queue.getByRole("button", { name: "Undo queue change", exact: true }).click();
    assert.match(await queue.innerText(), /1 SELECTED/);
    assert.equal(await selectSuppression.isChecked(), true);
    await assertVerifiedOutputUnavailable(page, "Undo during held session read");
    const redoButton = queue.getByRole("button", {
      name: "Redo queue change",
      exact: true,
    });
    assert.equal(await redoButton.isDisabled(), false);
    await page.evaluate(() => window.__firstLzmaReadProbe.release());
    await page.waitForFunction(() => window.__firstLzmaReadProbe.state.delivered === 1);
    assert.deepEqual(await page.evaluate(() => window.__firstLzmaReadProbe.state), {
      calls: 1,
      nativeCompleted: 1,
      delivered: 1,
      hashes: 0,
      held: false,
    });
    assert.equal(await page.evaluate(() => performance.timeOrigin), documentOrigin);
    assert.equal(await queue.isVisible(), true);
    assert.match(await queue.innerText(), /1 SELECTED/);
    assert.equal(await selectSuppression.isChecked(), true);
    await assertVerifiedOutputUnavailable(page, "Stale session delivery");
    assert.equal(await queue.getByRole("alert").count(), 0);
    assert.equal(await queue.getByText("Validating queue session…").count(), 0);
    assert.equal(await queue.getByText(/Queue session loaded/).count(), 0);
    assert.equal(await redoButton.isDisabled(), false);
    console.log("HELD_SESSION_READ_SELECTION_UNDO_ZERO_VALIDATION_HASHES");

    // Positive controls prove that the same paused metadata still traverses
    // current identity validation and that the exact selected session can be
    // restored and rebuilt after stale delivery was discarded.
    await queue.getByLabel("Load queue session file").setInputFiles(pausedSessionPath);
    await page.waitForFunction(() => {
      const input = document.querySelector(
        'input[aria-label="Load queue session file"]',
      );
      return input && input.files.length === 0;
    });
    assert.match(await queue.innerText(), /0 SELECTED/);
    assert.equal(await selectSuppression.isChecked(), false);
    await assertVerifiedOutputUnavailable(page, "Current paused-session load");
    assert(
      (await page.evaluate(() => window.__firstLzmaReadProbe.state.hashes)) >= 3,
      "Current AMI session load must execute its native identity hashes",
    );
    assert.equal(await redoButton.isDisabled(), true);
    await queue.getByLabel("Load queue session file").setInputFiles(sessionPath);
    await page.waitForFunction(() => {
      const input = document.querySelector(
        'input[aria-label="Load queue session file"]',
      );
      return input && input.files.length === 0;
    });
    assert.match(await queue.innerText(), /1 SELECTED/);
    assert.equal(await selectSuppression.isChecked(), true);
    await assertVerifiedOutputUnavailable(page, "Current selected-session load");
    assert.equal(await queue.getByRole("alert").count(), 0);
    await page.evaluate(() => window.__firstLzmaReadProbe.restore());
    await queue.getByRole("button", { name: "Apply selected", exact: true }).click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    await page
      .getByRole("button", { name: "Check firmware output", exact: true })
      .click();
    const asyncBuildStarted = Date.now();
    while (await button.isDisabled()) {
      const text = await page.locator("body").innerText();
      if (text.includes("Output check failed:"))
        throw Error(
          text.slice(
            text.indexOf("Output check failed:"),
            text.indexOf("Output check failed:") + 400,
          ),
        );
      if (Date.now() - asyncBuildStarted > 900000)
        throw Error("Post-async output check did not finish within 15 minutes");
      await page.waitForTimeout(1000);
    }
    const asyncImagePromise = page.waitForEvent("download", (d) =>
      d.suggestedFilename().endsWith(".bin"),
    );
    await button.click();
    const asyncImagePath = root + "/async-after-stale-read.bin";
    await (await asyncImagePromise).saveAs(asyncImagePath);
    const asyncOutput = fs.readFileSync(asyncImagePath);
    assert(
      asyncOutput.equals(baseline),
      "Post-async output must equal every earlier accepted baseline",
    );
    await verifyByteComparisonReport(page, asyncOutput);
    console.log("STALE_READ_DISCARDED_CURRENT_LOAD_FRESH_OUTPUT_IDENTICAL");
    await page.getByRole("button", { name: "Change queue (1)", exact: true }).click();

    // Exercise the later queue-revision boundary separately from File.text.
    // Native reading is unheld and the first two identity digests are delivered;
    // only the third (context) digest waits while selection changes and Undo
    // returns to byte-for-byte equal entries. The obsolete validated session
    // still must not commit or revive the output verified for an older revision.
    await page.evaluate(() => {
      const original = crypto.subtle.digest;
      let release;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const state = { calls: 0, nativeCompleted: 0, delivered: 0, held: false };
      crypto.subtle.digest = function (...args) {
        const call = ++state.calls;
        if (call === 3) crypto.subtle.digest = original;
        return original.apply(this, args).then(async (result) => {
          state.nativeCompleted++;
          if (call === 3) {
            state.held = true;
            await gate;
            state.held = false;
          }
          state.delivered++;
          return result;
        });
      };
      window.__firstLzmaFinalHashProbe = { state, release };
    });
    await queue.getByLabel("Load queue session file").setInputFiles(pausedSessionPath);
    await page.waitForFunction(() => window.__firstLzmaFinalHashProbe.state.held);
    const heldFinalHash = {
      calls: 3,
      nativeCompleted: 3,
      delivered: 2,
      held: true,
    };
    assert.deepEqual(
      await page.evaluate(() => window.__firstLzmaFinalHashProbe.state),
      heldFinalHash,
    );
    assert.equal(await queue.getByText("Validating queue session…").isVisible(), true);
    assert.match(await queue.innerText(), /1 SELECTED/);
    assert.equal(await selectSuppression.isChecked(), true);
    assert.equal(await button.isDisabled(), false);
    await selectSuppression.uncheck();
    assert.match(await queue.innerText(), /0 SELECTED/);
    await assertVerifiedOutputUnavailable(page, "Selection during final identity hash");
    await queue.getByRole("button", { name: "Undo queue change", exact: true }).click();
    assert.match(await queue.innerText(), /1 SELECTED/);
    assert.equal(await selectSuppression.isChecked(), true);
    await assertVerifiedOutputUnavailable(page, "Undo during final identity hash");
    assert.equal(await redoButton.isDisabled(), false);
    assert.deepEqual(
      await page.evaluate(() => window.__firstLzmaFinalHashProbe.state),
      heldFinalHash,
    );
    await page.evaluate(() => window.__firstLzmaFinalHashProbe.release());
    await page.waitForFunction(() => {
      const state = window.__firstLzmaFinalHashProbe.state;
      return state.delivered === 3 && !state.held;
    });
    await page.evaluate(async () => {
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    });
    assert.deepEqual(
      await page.evaluate(() => window.__firstLzmaFinalHashProbe.state),
      { ...heldFinalHash, delivered: 3, held: false },
    );
    assert.match(await queue.innerText(), /1 SELECTED/);
    assert.equal(await selectSuppression.isChecked(), true);
    assert.equal(await queue.getByRole("alert").count(), 0);
    assert.equal(await queue.getByText("Validating queue session…").count(), 0);
    assert.equal(await queue.getByText(/Queue session loaded/).count(), 0);
    assert.equal(await redoButton.isDisabled(), false);
    await assertVerifiedOutputUnavailable(page, "Stale final identity digest");
    console.log("HELD_FINAL_IDENTITY_HASH_SELECTION_UNDO_STALE_COMMIT_DISCARDED");

    // A current request must still traverse identity and restore the paused
    // metadata normally, followed by the exact selected session and a fresh
    // complete-BIOS verification after the stale digest was ignored.
    await queue.getByLabel("Load queue session file").setInputFiles(pausedSessionPath);
    await page.waitForFunction(() => {
      const input = document.querySelector(
        'input[aria-label="Load queue session file"]',
      );
      return input && input.files.length === 0;
    });
    assert.match(await queue.innerText(), /0 SELECTED/);
    assert.equal(await selectSuppression.isChecked(), false);
    await assertVerifiedOutputUnavailable(page, "Current post-hash paused load");
    await queue.getByLabel("Load queue session file").setInputFiles(sessionPath);
    await page.waitForFunction(() => {
      const input = document.querySelector(
        'input[aria-label="Load queue session file"]',
      );
      return input && input.files.length === 0;
    });
    assert.match(await queue.innerText(), /1 SELECTED/);
    assert.equal(await selectSuppression.isChecked(), true);
    assert.equal(await queue.getByRole("alert").count(), 0);
    await assertVerifiedOutputUnavailable(page, "Current post-hash selected load");
    await queue.getByRole("button", { name: "Apply selected", exact: true }).click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    await page
      .getByRole("button", { name: "Check firmware output", exact: true })
      .click();
    const finalHashBuildStarted = Date.now();
    while (await button.isDisabled()) {
      const text = await page.locator("body").innerText();
      if (text.includes("Output check failed:"))
        throw Error(
          text.slice(
            text.indexOf("Output check failed:"),
            text.indexOf("Output check failed:") + 400,
          ),
        );
      if (Date.now() - finalHashBuildStarted > 900000)
        throw Error("Post-final-hash output check did not finish within 15 minutes");
      await page.waitForTimeout(1000);
    }
    const finalHashImagePromise = page.waitForEvent("download", (d) =>
      d.suggestedFilename().endsWith(".bin"),
    );
    await button.click();
    const finalHashImagePath = root + "/after-stale-final-hash.bin";
    await (await finalHashImagePromise).saveAs(finalHashImagePath);
    const finalHashOutput = fs.readFileSync(finalHashImagePath);
    assert(
      finalHashOutput.equals(baseline),
      "Post-final-hash output must equal every earlier accepted baseline",
    );
    await verifyByteComparisonReport(page, finalHashOutput);
    console.log("FINAL_HASH_STALE_COMMIT_CURRENT_LOAD_FRESH_OUTPUT_IDENTICAL");
    await page.getByRole("button", { name: "Change queue (1)", exact: true }).click();

    // Exercise the first successful identity-digest boundary independently.
    // The two parallel source/context digests finish natively, but delivery of
    // the first result is held while a selection change and Undo return to
    // identical entries. The obsolete request must stop before its later third
    // digest and semantic replay.
    await page.evaluate(() => {
      const original = crypto.subtle.digest;
      let release;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const state = { calls: 0, nativeCompleted: 0, delivered: 0, held: false };
      crypto.subtle.digest = function (...args) {
        const call = ++state.calls;
        return original.apply(this, args).then(async (result) => {
          state.nativeCompleted++;
          if (call === 1) {
            state.held = true;
            await gate;
            state.held = false;
          }
          state.delivered++;
          return result;
        });
      };
      window.__firstLzmaFirstHashProbe = {
        state,
        release: () => {
          crypto.subtle.digest = original;
          release();
        },
      };
    });
    await queue.getByLabel("Load queue session file").setInputFiles(pausedSessionPath);
    await page.waitForFunction(() => {
      const state = window.__firstLzmaFirstHashProbe.state;
      return state.held && state.calls === 2 && state.nativeCompleted === 2;
    });
    const heldFirstHash = {
      calls: 2,
      nativeCompleted: 2,
      delivered: 1,
      held: true,
    };
    assert.deepEqual(
      await page.evaluate(() => window.__firstLzmaFirstHashProbe.state),
      heldFirstHash,
    );
    assert.equal(await queue.getByText("Validating queue session…").isVisible(), true);
    assert.match(await queue.innerText(), /1 SELECTED/);
    assert.equal(await selectSuppression.isChecked(), true);
    assert.equal(await button.isDisabled(), false);
    await selectSuppression.uncheck();
    assert.match(await queue.innerText(), /0 SELECTED/);
    await assertVerifiedOutputUnavailable(page, "Selection during first identity hash");
    await queue.getByRole("button", { name: "Undo queue change", exact: true }).click();
    assert.match(await queue.innerText(), /1 SELECTED/);
    assert.equal(await selectSuppression.isChecked(), true);
    await assertVerifiedOutputUnavailable(page, "Undo during first identity hash");
    assert.equal(await redoButton.isDisabled(), false);
    assert.deepEqual(
      await page.evaluate(() => window.__firstLzmaFirstHashProbe.state),
      heldFirstHash,
    );
    await page.evaluate(() => window.__firstLzmaFirstHashProbe.release());
    await page.waitForFunction(() => {
      const state = window.__firstLzmaFirstHashProbe.state;
      return state.delivered === 2 && !state.held;
    });
    await page.evaluate(async () => {
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    });
    assert.deepEqual(
      await page.evaluate(() => window.__firstLzmaFirstHashProbe.state),
      { ...heldFirstHash, delivered: 2, held: false },
    );
    assert.match(await queue.innerText(), /1 SELECTED/);
    assert.equal(await selectSuppression.isChecked(), true);
    assert.equal(await queue.getByRole("alert").count(), 0);
    assert.equal(await queue.getByText("Validating queue session…").count(), 0);
    assert.equal(await queue.getByText(/Queue session loaded/).count(), 0);
    assert.equal(await redoButton.isDisabled(), false);
    await assertVerifiedOutputUnavailable(page, "Stale first identity digest");
    console.log("HELD_FIRST_IDENTITY_HASH_SELECTION_UNDO_STALE_COMMIT_DISCARDED");

    await queue.getByLabel("Load queue session file").setInputFiles(pausedSessionPath);
    await page.waitForFunction(() => {
      const input = document.querySelector(
        'input[aria-label="Load queue session file"]',
      );
      return input && input.files.length === 0;
    });
    assert.match(await queue.innerText(), /0 SELECTED/);
    assert.equal(await selectSuppression.isChecked(), false);
    await assertVerifiedOutputUnavailable(page, "Current post-first-hash paused load");
    await queue.getByLabel("Load queue session file").setInputFiles(sessionPath);
    await page.waitForFunction(() => {
      const input = document.querySelector(
        'input[aria-label="Load queue session file"]',
      );
      return input && input.files.length === 0;
    });
    assert.match(await queue.innerText(), /1 SELECTED/);
    assert.equal(await selectSuppression.isChecked(), true);
    assert.equal(await queue.getByRole("alert").count(), 0);
    await assertVerifiedOutputUnavailable(
      page,
      "Current post-first-hash selected load",
    );
    await queue.getByRole("button", { name: "Apply selected", exact: true }).click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    await page
      .getByRole("button", { name: "Check firmware output", exact: true })
      .click();
    const firstHashBuildStarted = Date.now();
    while (await button.isDisabled()) {
      const text = await page.locator("body").innerText();
      if (text.includes("Output check failed:"))
        throw Error(
          text.slice(
            text.indexOf("Output check failed:"),
            text.indexOf("Output check failed:") + 400,
          ),
        );
      if (Date.now() - firstHashBuildStarted > 900000)
        throw Error("Post-first-hash output check did not finish within 15 minutes");
      await page.waitForTimeout(1000);
    }
    const firstHashImagePromise = page.waitForEvent("download", (d) =>
      d.suggestedFilename().endsWith(".bin"),
    );
    await button.click();
    const firstHashImagePath = root + "/after-stale-first-hash.bin";
    await (await firstHashImagePromise).saveAs(firstHashImagePath);
    const firstHashOutput = fs.readFileSync(firstHashImagePath);
    assert(
      firstHashOutput.equals(baseline),
      "Post-first-hash output must equal every earlier accepted baseline",
    );
    await verifyByteComparisonReport(page, firstHashOutput);
    console.log("FIRST_HASH_STALE_COMMIT_CURRENT_LOAD_FRESH_OUTPUT_IDENTICAL");
    await page.getByRole("button", { name: "Change queue (1)", exact: true }).click();

    // Exercise the other parallel identity-digest boundary independently.
    // The source and Setup digests both finish natively, but delivery of the
    // second result is held while a selection change and Undo return to
    // identical entries. The obsolete request must stop before its later third
    // context digest and semantic replay.
    await page.evaluate(() => {
      const original = crypto.subtle.digest;
      let release;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const state = { calls: 0, nativeCompleted: 0, delivered: 0, held: false };
      crypto.subtle.digest = function (...args) {
        const call = ++state.calls;
        return original.apply(this, args).then(async (result) => {
          state.nativeCompleted++;
          if (call === 2) {
            state.held = true;
            await gate;
            state.held = false;
          }
          state.delivered++;
          return result;
        });
      };
      window.__firstLzmaSecondHashProbe = {
        state,
        release: () => {
          crypto.subtle.digest = original;
          release();
        },
      };
    });
    await queue.getByLabel("Load queue session file").setInputFiles(pausedSessionPath);
    await page.waitForFunction(() => {
      const state = window.__firstLzmaSecondHashProbe.state;
      return state.held && state.calls === 2 && state.nativeCompleted === 2;
    });
    const heldSecondHash = {
      calls: 2,
      nativeCompleted: 2,
      delivered: 1,
      held: true,
    };
    assert.deepEqual(
      await page.evaluate(() => window.__firstLzmaSecondHashProbe.state),
      heldSecondHash,
    );
    assert.equal(await queue.getByText("Validating queue session…").isVisible(), true);
    assert.match(await queue.innerText(), /1 SELECTED/);
    assert.equal(await selectSuppression.isChecked(), true);
    assert.equal(await button.isDisabled(), false);
    await selectSuppression.uncheck();
    assert.match(await queue.innerText(), /0 SELECTED/);
    await assertVerifiedOutputUnavailable(
      page,
      "Selection during second identity hash",
    );
    await queue.getByRole("button", { name: "Undo queue change", exact: true }).click();
    assert.match(await queue.innerText(), /1 SELECTED/);
    assert.equal(await selectSuppression.isChecked(), true);
    await assertVerifiedOutputUnavailable(page, "Undo during second identity hash");
    assert.equal(await redoButton.isDisabled(), false);
    assert.deepEqual(
      await page.evaluate(() => window.__firstLzmaSecondHashProbe.state),
      heldSecondHash,
    );
    await page.evaluate(() => window.__firstLzmaSecondHashProbe.release());
    await page.waitForFunction(() => {
      const state = window.__firstLzmaSecondHashProbe.state;
      return state.delivered === 2 && !state.held;
    });
    await page.evaluate(async () => {
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    });
    assert.deepEqual(
      await page.evaluate(() => window.__firstLzmaSecondHashProbe.state),
      { ...heldSecondHash, delivered: 2, held: false },
    );
    assert.match(await queue.innerText(), /1 SELECTED/);
    assert.equal(await selectSuppression.isChecked(), true);
    assert.equal(await queue.getByRole("alert").count(), 0);
    assert.equal(await queue.getByText("Validating queue session…").count(), 0);
    assert.equal(await queue.getByText(/Queue session loaded/).count(), 0);
    assert.equal(await redoButton.isDisabled(), false);
    await assertVerifiedOutputUnavailable(page, "Stale second identity digest");
    console.log("HELD_SECOND_IDENTITY_HASH_SELECTION_UNDO_STALE_COMMIT_DISCARDED");

    await queue.getByLabel("Load queue session file").setInputFiles(pausedSessionPath);
    await page.waitForFunction(() => {
      const input = document.querySelector(
        'input[aria-label="Load queue session file"]',
      );
      return input && input.files.length === 0;
    });
    assert.match(await queue.innerText(), /0 SELECTED/);
    assert.equal(await selectSuppression.isChecked(), false);
    await assertVerifiedOutputUnavailable(page, "Current post-second-hash paused load");
    await queue.getByLabel("Load queue session file").setInputFiles(sessionPath);
    await page.waitForFunction(() => {
      const input = document.querySelector(
        'input[aria-label="Load queue session file"]',
      );
      return input && input.files.length === 0;
    });
    assert.match(await queue.innerText(), /1 SELECTED/);
    assert.equal(await selectSuppression.isChecked(), true);
    assert.equal(await queue.getByRole("alert").count(), 0);
    await assertVerifiedOutputUnavailable(
      page,
      "Current post-second-hash selected load",
    );
    await queue.getByRole("button", { name: "Apply selected", exact: true }).click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    await page
      .getByRole("button", { name: "Check firmware output", exact: true })
      .click();
    const secondHashBuildStarted = Date.now();
    while (await button.isDisabled()) {
      const text = await page.locator("body").innerText();
      if (text.includes("Output check failed:"))
        throw Error(
          text.slice(
            text.indexOf("Output check failed:"),
            text.indexOf("Output check failed:") + 400,
          ),
        );
      if (Date.now() - secondHashBuildStarted > 900000)
        throw Error("Post-second-hash output check did not finish within 15 minutes");
      await page.waitForTimeout(1000);
    }
    const secondHashImagePromise = page.waitForEvent("download", (d) =>
      d.suggestedFilename().endsWith(".bin"),
    );
    await button.click();
    const secondHashImagePath = root + "/after-stale-second-hash.bin";
    await (await secondHashImagePromise).saveAs(secondHashImagePath);
    const secondHashOutput = fs.readFileSync(secondHashImagePath);
    assert(
      secondHashOutput.equals(baseline),
      "Post-second-hash output must equal every earlier accepted baseline",
    );
    await verifyByteComparisonReport(page, secondHashOutput);
    console.log("SECOND_HASH_STALE_COMMIT_CURRENT_LOAD_FRESH_OUTPUT_IDENTICAL");
    await page.getByRole("button", { name: "Change queue (1)", exact: true }).click();

    // Exercise a semantic rejection only after all three real identity hashes
    // succeed. Delivery of the context digest is held while selection changes
    // and Undo returns to byte-for-byte equal entries. The invalid SuppressIf
    // selector must still be replayed, but its obsolete rejection must not
    // report against the newer queue revision or consume Redo.
    await page.evaluate(() => {
      const original = crypto.subtle.digest;
      let release;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const state = { calls: 0, nativeCompleted: 0, delivered: 0, held: false };
      crypto.subtle.digest = function (...args) {
        const call = ++state.calls;
        if (call === 3) crypto.subtle.digest = original;
        return original.apply(this, args).then(async (result) => {
          state.nativeCompleted++;
          if (call === 3) {
            state.held = true;
            await gate;
            state.held = false;
          }
          state.delivered++;
          return result;
        });
      };
      window.__firstLzmaSemanticRejectionProbe = { state, release };
    });
    await queue
      .getByLabel("Load queue session file")
      .setInputFiles(invalidSemanticSessionPath);
    await page.waitForFunction(
      () => window.__firstLzmaSemanticRejectionProbe.state.held,
    );
    const heldSemanticRejection = {
      calls: 3,
      nativeCompleted: 3,
      delivered: 2,
      held: true,
    };
    assert.deepEqual(
      await page.evaluate(() => window.__firstLzmaSemanticRejectionProbe.state),
      heldSemanticRejection,
    );
    assert.equal(await queue.getByText("Validating queue session…").isVisible(), true);
    await selectSuppression.uncheck();
    assert.match(await queue.innerText(), /0 SELECTED/);
    await assertVerifiedOutputUnavailable(page, "Selection during semantic rejection");
    await queue.getByRole("button", { name: "Undo queue change", exact: true }).click();
    assert.match(await queue.innerText(), /1 SELECTED/);
    assert.equal(await selectSuppression.isChecked(), true);
    await assertVerifiedOutputUnavailable(page, "Undo during semantic rejection");
    assert.equal(await redoButton.isDisabled(), false);
    await page.evaluate(() => window.__firstLzmaSemanticRejectionProbe.release());
    await page.waitForFunction(() => {
      const state = window.__firstLzmaSemanticRejectionProbe.state;
      return state.delivered === 3 && !state.held;
    });
    await page.evaluate(async () => {
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    });
    assert.deepEqual(
      await page.evaluate(() => window.__firstLzmaSemanticRejectionProbe.state),
      { ...heldSemanticRejection, delivered: 3, held: false },
    );
    assert.match(await queue.innerText(), /1 SELECTED/);
    assert.equal(await queue.getByRole("alert").count(), 0);
    assert.equal(await queue.getByText("Validating queue session…").count(), 0);
    assert.equal(await queue.getByText(/Queue session loaded/).count(), 0);
    assert.equal(await redoButton.isDisabled(), false);
    await assertVerifiedOutputUnavailable(page, "Stale semantic rejection");
    console.log("HELD_SEMANTIC_REJECTION_SELECTION_UNDO_STALE_ERROR_DISCARDED");

    // The same malformed metadata must reject when it belongs to the current
    // request, without replacing the selected queue or consuming its Redo.
    await queue
      .getByLabel("Load queue session file")
      .setInputFiles(invalidSemanticSessionPath);
    const semanticRejection = queue.getByRole("alert");
    await semanticRejection.waitFor();
    assert.match(
      await semanticRejection.innerText(),
      /targets a missing or read-only condition/,
    );
    assert.match(await queue.innerText(), /1 SELECTED/);
    assert.equal(await selectSuppression.isChecked(), true);
    assert.equal(await redoButton.isDisabled(), false);
    await assertVerifiedOutputUnavailable(page, "Current semantic rejection");
    console.log("CURRENT_SEMANTIC_REJECTION_RETAINED_QUEUE_REDO_AND_NO_OUTPUT");

    // A valid selector can still resolve to a condition class that sessions
    // deliberately do not edit. Hold the final real digest again so the stale
    // read-only rejection crosses the same queue revision boundary, then prove
    // the current request rejects without replacing the selected queue.
    await page.evaluate(() => {
      const original = crypto.subtle.digest;
      let release;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const state = { calls: 0, nativeCompleted: 0, delivered: 0, held: false };
      crypto.subtle.digest = function (...args) {
        const call = ++state.calls;
        if (call === 3) crypto.subtle.digest = original;
        return original.apply(this, args).then(async (result) => {
          state.nativeCompleted++;
          if (call === 3) {
            state.held = true;
            await gate;
            state.held = false;
          }
          state.delivered++;
          return result;
        });
      };
      window.__firstLzmaReadOnlyRejectionProbe = { state, release };
    });
    await queue
      .getByLabel("Load queue session file")
      .setInputFiles(readOnlySemanticSessionPath);
    await page.waitForFunction(
      () => window.__firstLzmaReadOnlyRejectionProbe.state.held,
    );
    const heldReadOnlyRejection = {
      calls: 3,
      nativeCompleted: 3,
      delivered: 2,
      held: true,
    };
    assert.deepEqual(
      await page.evaluate(() => window.__firstLzmaReadOnlyRejectionProbe.state),
      heldReadOnlyRejection,
    );
    await selectSuppression.uncheck();
    await queue.getByRole("button", { name: "Undo queue change", exact: true }).click();
    assert.match(await queue.innerText(), /1 SELECTED/);
    assert.equal(await selectSuppression.isChecked(), true);
    assert.equal(await redoButton.isDisabled(), false);
    await assertVerifiedOutputUnavailable(page, "Undo during read-only rejection");
    await page.evaluate(() => window.__firstLzmaReadOnlyRejectionProbe.release());
    await page.waitForFunction(() => {
      const state = window.__firstLzmaReadOnlyRejectionProbe.state;
      return state.delivered === 3 && !state.held;
    });
    await page.evaluate(async () => {
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    });
    assert.equal(await queue.getByRole("alert").count(), 0);
    assert.equal(await queue.getByText(/Queue session loaded/).count(), 0);
    assert.match(await queue.innerText(), /1 SELECTED/);
    assert.equal(await redoButton.isDisabled(), false);
    await assertVerifiedOutputUnavailable(page, "Stale read-only rejection");
    console.log("HELD_READ_ONLY_REJECTION_SELECTION_UNDO_STALE_ERROR_DISCARDED");

    await queue
      .getByLabel("Load queue session file")
      .setInputFiles(readOnlySemanticSessionPath);
    const readOnlyRejection = queue.getByRole("alert");
    await readOnlyRejection.waitFor();
    assert.match(
      await readOnlyRejection.innerText(),
      /targets a missing or read-only condition/,
    );
    assert.match(await queue.innerText(), /1 SELECTED/);
    assert.equal(await selectSuppression.isChecked(), true);
    assert.equal(await redoButton.isDisabled(), false);
    await assertVerifiedOutputUnavailable(page, "Current read-only rejection");
    console.log("CURRENT_READ_ONLY_REJECTION_RETAINED_QUEUE_REDO_AND_NO_OUTPUT");

    // Paused operations are still validated. A valid paused first operation
    // followed by a paused invalid target must reject the complete session,
    // without partially replacing the current selected queue or its Redo.
    await page.evaluate(() => {
      const original = crypto.subtle.digest;
      const state = { calls: 0 };
      crypto.subtle.digest = function (...args) {
        state.calls++;
        if (state.calls === 3) crypto.subtle.digest = original;
        return original.apply(this, args);
      };
      window.__firstLzmaAtomicRejectionProbe = state;
    });
    await queue
      .getByLabel("Load queue session file")
      .setInputFiles(atomicSemanticSessionPath);
    const atomicRejection = queue.getByRole("alert");
    await atomicRejection.waitFor();
    assert.match(
      await atomicRejection.innerText(),
      /targets a missing or read-only condition/,
    );
    assert.deepEqual(
      await page.evaluate(() => window.__firstLzmaAtomicRejectionProbe),
      { calls: 3 },
    );
    assert.equal(await queue.getByText(/Queue session loaded/).count(), 0);
    assert.match(await queue.innerText(), /1 SELECTED/);
    assert.equal(await selectSuppression.isChecked(), true);
    assert.equal(await redoButton.isDisabled(), false);
    await assertVerifiedOutputUnavailable(page, "Atomic paused rejection");
    console.log("PAUSED_LATER_INVALID_TARGET_REJECTED_ATOMICALLY");

    await queue.getByLabel("Load queue session file").setInputFiles(sessionPath);
    await page.waitForFunction(() => {
      const input = document.querySelector(
        'input[aria-label="Load queue session file"]',
      );
      return input && input.files.length === 0;
    });
    assert.equal(await queue.getByRole("alert").count(), 0);
    assert.match(await queue.innerText(), /1 SELECTED/);
    assert.equal(await selectSuppression.isChecked(), true);
    assert.equal(await redoButton.isDisabled(), true);
    await assertVerifiedOutputUnavailable(page, "Recovery after semantic rejection");
    await queue.getByRole("button", { name: "Apply selected", exact: true }).click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    await page
      .getByRole("button", { name: "Check firmware output", exact: true })
      .click();
    const semanticRecoveryBuildStarted = Date.now();
    while (await button.isDisabled()) {
      const text = await page.locator("body").innerText();
      if (text.includes("Output check failed:"))
        throw Error(
          text.slice(
            text.indexOf("Output check failed:"),
            text.indexOf("Output check failed:") + 400,
          ),
        );
      if (Date.now() - semanticRecoveryBuildStarted > 900000)
        throw Error("Post-semantic-rejection output check exceeded 15 minutes");
      await page.waitForTimeout(1000);
    }
    const semanticRecoveryImagePromise = page.waitForEvent("download", (d) =>
      d.suggestedFilename().endsWith(".bin"),
    );
    await button.click();
    const semanticRecoveryImagePath = root + "/after-semantic-rejection.bin";
    await (await semanticRecoveryImagePromise).saveAs(semanticRecoveryImagePath);
    const semanticRecoveryOutput = fs.readFileSync(semanticRecoveryImagePath);
    assert(
      semanticRecoveryOutput.equals(baseline),
      "Post-semantic-rejection output must equal every accepted baseline",
    );
    await verifyByteComparisonReport(page, semanticRecoveryOutput);
    console.log("SEMANTIC_REJECTION_RECOVERY_FRESH_OUTPUT_IDENTICAL");
    await page.getByRole("button", { name: "Change queue (1)", exact: true }).click();

    await queue.getByRole("button", { name: /^Remove .* from change queue$/ }).click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    assert.equal(await button.isDisabled(), true);
    assert.equal(
      await page
        .getByRole("button", { name: "Output details", exact: true })
        .isDisabled(),
      true,
    );
    console.log("REMOVAL_INVALIDATED");
    for (const [label, imagePath, sourceSessionPath] of [
      ["v2", root + "/output-v2.bin", sessionPath],
      ["v1", root + "/output-v1.bin", legacyPath],
      ["history-before-undo", root + "/history-before-undo.bin", sessionPath],
      ["history-after-redo", root + "/history-after-redo.bin", sessionPath],
      ["long-history-after-redo", root + "/long-history-after-redo.bin", sessionPath],
      ["async-after-stale-read", root + "/async-after-stale-read.bin", sessionPath],
      ["after-stale-final-hash", root + "/after-stale-final-hash.bin", sessionPath],
      ["after-stale-first-hash", root + "/after-stale-first-hash.bin", sessionPath],
      ["after-stale-second-hash", root + "/after-stale-second-hash.bin", sessionPath],
      ["after-semantic-rejection", root + "/after-semantic-rejection.bin", sessionPath],
    ]) {
      await page.reload();
      await page.locator("input[type=file]").first().setInputFiles(imagePath);
      await page
        .getByRole("button", { name: "Start HII analysis", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Change queue (0)", exact: true })
        .waitFor({ timeout: 240000 });
      const reloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: "data.json", exact: true }).nth(1).click();
      const reloadDownload = await reloadPromise;
      await reloadDownload.saveAs(root + "/reloaded.json");
      const reopened = JSON.parse(fs.readFileSync(root + "/reloaded.json", "utf8"));
      assert.equal(reopened.forms.length, 277);
      const reopenedScope = reopened.suppressions.find(
        (s) => s.offset.toLowerCase() === "0x5b2d9",
      );
      assert(reopenedScope);
      assert.equal(reopenedScope.start, "0x5B2F3");
      assert.equal(reopenedScope.end, reopenedScope.start);
      assert.equal(reopenedScope.expression, scope.expression);
      assert(Number.parseInt(scope.end, 16) > Number.parseInt(scope.start, 16));
      assert.equal(
        await page
          .getByRole("button", { name: "Modified firmware image", exact: true })
          .isDisabled(),
        true,
      );
      console.log(
        "RELOADED_SCOPE_EMPTY_EXPRESSION_UNCHANGED_EMPTY_QUEUE_DOWNLOAD_DISABLED",
        label,
      );
      await page.getByRole("button", { name: "Change queue (0)", exact: true }).click();
      const reopenedQueue = page.getByRole("dialog", {
        name: "Change queue",
        exact: true,
      });
      await reopenedQueue
        .getByLabel("Load queue session file")
        .setInputFiles(sourceSessionPath);
      const rejection = reopenedQueue.getByRole("alert");
      await rejection.waitFor();
      assert.match(
        await rejection.innerText(),
        /different firmware image or opened HII context/,
      );
      assert.match(await reopenedQueue.innerText(), /The queue is empty/);
      assert.equal(
        await page
          .getByRole("button", { name: "Modified firmware image", exact: true })
          .isDisabled(),
        true,
      );
      console.log("CHANGED_SOURCE_REJECTED_SESSION_EMPTY_QUEUE");
    }
    assert.equal(pageErrors.length, 0, "No application page errors are allowed.");
    console.log("ASSETS", [...assets]);
  } finally {
    await browser?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
