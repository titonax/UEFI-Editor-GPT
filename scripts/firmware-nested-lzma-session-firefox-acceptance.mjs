// Opt-in deployed Firefox acceptance for exact nested-LZMA combined v2/v1 sessions.
// Firmware, sessions and exported editor JSON remain local; CI never supplies private input.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { firefox } = require(
  process.env.FIRMWARE_BROWSER_PLAYWRIGHT_MODULE || "playwright",
);
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const sourcePath = process.env.FIRMWARE_ACCEPTANCE_IMAGE;
assert(sourcePath, "Set FIRMWARE_ACCEPTANCE_IMAGE to the accepted private source.");
const sourceBytes = fs.readFileSync(sourcePath);
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
assert.equal(sourceBytes.length, 4194304);
assert.equal(
  sha256(sourceBytes),
  "cd22f87daee0d50bf82520aaa6669a6731bdaaf3692690649533790c8e027f9a",
);

// Independently accepted exact-source engine results, not values read from UI.
const combinedOutput = Object.freeze({
  sha: "014af11ec7d614471d873974b83b90c1ae5583adb51beeeda68d3c6940bd64e6",
  changed: 850394,
  packed: 1493440,
  remaining: 668,
});
const moveOnlyOutput = Object.freeze({
  sha: "354ca2cef157221679ce55783ff4370e4a9cdd6968415c6b0abf639c0b4514e0",
  changed: 140925,
  packed: 1494099,
  remaining: 9,
});
const work = fs.mkdtempSync(
  path.join(os.tmpdir(), "uefi-nested-lzma-session-firefox-"),
);
fs.writeFileSync(path.join(work, "source.bin"), sourceBytes);

function assertMetadataOnly(session, enabled = [true, true, true, true]) {
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
  assert.equal(session.source.sha256, sha256(sourceBytes));
  assert.equal(session.source.size, sourceBytes.length);
  assert.match(session.source.contextSha256, /^[a-f0-9]{64}$/);
  assert.equal(session.operations.length, 4);
  assert.deepEqual(
    session.operations.map((op) => op.action),
    ["ami-roots", "move-ref", "ami-values", "suppressions"],
  );
  assert.deepEqual(
    session.operations.map((op) => op.enabled),
    enabled,
  );
  assert.deepEqual(Object.keys(session.operations[0]).sort(), [
    "action",
    "changes",
    "enabled",
  ]);
  assert.deepEqual(session.operations[0].changes, [{ rootIndex: 4, visible: true }]);
  assert.deepEqual(Object.keys(session.operations[1]).sort(), [
    "action",
    "destinationFormIndex",
    "enabled",
    "referenceChildIndex",
    "sourceFormIndex",
  ]);
  for (const field of [
    "sourceFormIndex",
    "referenceChildIndex",
    "destinationFormIndex",
  ]) {
    assert.equal(Number.isSafeInteger(session.operations[1][field]), true);
    assert.equal(session.operations[1][field] >= 0, true);
  }
  for (const op of session.operations.slice(2)) {
    assert.deepEqual(Object.keys(op).sort(), ["action", "changes", "enabled"]);
    assert.equal(op.changes.length, 1);
  }
  const value = session.operations[2].changes[0];
  assert.deepEqual(Object.keys(value).sort(), [
    "childIndex",
    "field",
    "formIndex",
    "value",
  ]);
  assert.equal(value.field, "accessLevel");
  assert.equal(value.value, "00");
  for (const field of ["formIndex", "childIndex"]) {
    assert.equal(Number.isSafeInteger(value[field]), true);
    assert.equal(value[field] >= 0, true);
  }
  const suppression = session.operations[3].changes[0];
  assert.deepEqual(Object.keys(suppression).sort(), ["active", "conditionIndex"]);
  assert.equal(suppression.active, false);
  assert.equal(Number.isSafeInteger(suppression.conditionIndex), true);
  assert.equal(suppression.conditionIndex >= 0, true);
  assert.doesNotMatch(
    JSON.stringify(session),
    /patches|expected|replacement|ifrBinary|history|applied|fileName|offset|source\.bin/,
  );
}

const flattenItems = (items) =>
  items.flatMap((item) => [item, ...flattenItems(item.children || [])]);
const form = (data, id) => data.forms.find((candidate) => candidate.formId === id);
const refs = (data, ownerId) =>
  flattenItems(form(data, ownerId)?.children || []).filter(
    (item) =>
      item.type === "Ref" &&
      item.name === "CPU Configuration" &&
      item.formId === "0x413",
  );
const question = (data, name) =>
  data.forms
    .flatMap((candidate) => flattenItems(candidate.children || []))
    .find((item) => item.name === name);

async function downloadVerifiedOutput(page, destination, expected = combinedOutput) {
  const outputButton = page.getByRole("button", {
    name: "Modified firmware image",
    exact: true,
  });
  assert.equal(await outputButton.isDisabled(), true);
  await page
    .getByRole("button", { name: "Check firmware output", exact: true })
    .click();
  console.log("BUILD_STARTED");
  const started = Date.now();
  while (await outputButton.isDisabled()) {
    const body = await page.locator("body").innerText();
    if (body.includes("Output check failed:"))
      throw Error(
        body.slice(
          body.indexOf("Output check failed:"),
          body.indexOf("Output check failed:") + 500,
        ),
      );
    if (Date.now() - started > 900000)
      throw Error("Output check did not finish within 15 minutes");
    await page.waitForTimeout(1000);
  }
  console.log("BUILD_READY_SECONDS", (Date.now() - started) / 1000);

  return downloadReadyOutput(page, destination, expected);
}

async function downloadReadyOutput(page, destination, expected) {
  const outputButton = page.getByRole("button", {
    name: "Modified firmware image",
    exact: true,
  });
  assert.equal(await outputButton.isDisabled(), false);

  const imageDownload = page.waitForEvent("download", (download) =>
    download.suggestedFilename().endsWith(".bin"),
  );
  await outputButton.click();
  await (await imageDownload).saveAs(destination);
  const output = fs.readFileSync(destination);
  assert.equal(output.length, sourceBytes.length);
  assert.equal(sha256(output), expected.sha);
  let changed = 0;
  let outsideOwner = 0;
  let outsideBios = 0;
  for (let index = 0; index < output.length; index++) {
    if (output[index] === sourceBytes[index]) continue;
    changed++;
    if (index < 1704008 || index >= 3198149) outsideOwner++;
    if (index < 1572864) outsideBios++;
  }
  assert.equal(changed, expected.changed);
  assert.equal(outsideOwner, 0);
  assert.equal(outsideBios, 0);
  console.log(
    "DOWNLOAD_VERIFIED",
    JSON.stringify({
      size: output.length,
      sha256: sha256(output),
      changed,
      outsideOwner,
      outsideBios,
    }),
  );
  await verifyByteComparisonReport(page, output, expected);
  return output;
}

async function verifyByteComparisonReport(page, output, expected) {
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
  assert(text.includes("1572864 bytes outside BIOS preserved exactly."));
  assert(text.includes(`4194304 bytes, ${expected.changed} changed bytes`));
  assert.match(
    text,
    new RegExp(`1494108[\\s\\S]*${expected.packed}[\\s\\S]*${expected.remaining}`),
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
  console.log("NESTED_BYTE_REPORT_EXACT_DOWNLOAD_SCAN", {
    changed,
    unchanged: output.length - changed,
    rangeCount,
    displayedRanges: rows.length,
    sampleLimit: 16,
  });
}

(async () => {
  let browser;
  try {
    browser = await firefox.launch({
      executablePath: process.env.FIRMWARE_BROWSER_FIREFOX_EXECUTABLE || undefined,
      proxy: process.env.FIRMWARE_BROWSER_PROXY_SERVER
        ? { server: process.env.FIRMWARE_BROWSER_PROXY_SERVER }
        : undefined,
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
      serviceWorkers: "block",
      ignoreHTTPSErrors: process.env.FIRMWARE_BROWSER_IGNORE_HTTPS_ERRORS === "1",
    });
    // A file input reads locally; it must never become an HTTP upload. Resolve
    // public static assets before supplying private input, then deny every other
    // URL, request body and method (including queries and cross-origin traffic).
    const deployedUrl = "https://titonax.github.io/UEFI-Editor-GPT/";
    const publicResponse = await page.request.get(deployedUrl);
    assert(publicResponse.ok(), "The deployed public index must be available");
    const publicHtml = await publicResponse.text();
    const staticUrls = new Set([
      deployedUrl,
      ...[
        "bios.png",
        "firmware-decompress.wasm",
        "tiano-decompress.wasm",
        "ifrextractor.wasm",
      ].map((name) => new URL(name, deployedUrl).href),
      ...[
        ...publicHtml.matchAll(
          /(?:src|href)="(\/UEFI-Editor-GPT\/assets\/[A-Za-z0-9._-]+\.(?:js|css))"/g,
        ),
      ].map((match) => new URL(match[1], deployedUrl).href),
    ]);
    assert(staticUrls.size >= 7, "The public index must advertise its JS and CSS");
    let blockedRequests = 0;
    await page.context().route("**/*", async (route) => {
      const request = route.request();
      if (
        request.method() === "GET" &&
        request.postData() === null &&
        staticUrls.has(request.url())
      ) {
        await route.continue();
      } else {
        blockedRequests++;
        await route.abort("blockedbyclient");
      }
    });
    await page.context().routeWebSocket("**/*", (socket) => {
      blockedRequests++;
      socket.close();
    });
    page.setDefaultTimeout(60000);
    const pageErrors = [];
    const assets = new Set();
    page.on("pageerror", (error) => pageErrors.push(error));
    page.on("response", (response) => {
      if (/\.wasm|assets\/index-/.test(response.url()))
        assets.add(response.url().split("/").pop());
    });

    await page.goto(deployedUrl);
    await page
      .locator("input[type=file]")
      .first()
      .setInputFiles(path.join(work, "source.bin"));
    await page.getByRole("button", { name: "Start HII analysis", exact: true }).click();
    await page
      .getByRole("button", { name: "Change queue (0)", exact: true })
      .waitFor({ timeout: 240000 });
    console.log("OPENED", await browser.version(), [...assets]);

    await page
      .getByRole("button", {
        name: "Desired root state for Chipset: hidden",
        exact: true,
      })
      .click();
    await page.getByRole("button", { name: "Change queue (1)", exact: true }).waitFor();
    console.log("ROOT_STAGED_WITH_REAL_CONTROL");

    const moves = page.getByRole("button", {
      name: "Move CPU Configuration",
      exact: true,
    });
    assert.equal(await moves.count(), 2);
    await moves.first().click();
    const destination = page.getByPlaceholder("Choose the new parent menu");
    await destination.fill("PCI Subsystem Settings");
    await page
      .getByText(/Safe · PCI Subsystem Settings · 0x40A/)
      .last()
      .click();
    const moveDialog = page.getByRole("dialog", { name: "Move HII menu" });
    await moveDialog.getByRole("button", { name: "Move menu", exact: true }).click();
    await page.getByRole("button", { name: "Change queue (2)", exact: true }).waitFor();
    console.log("MOVE_STAGED_WITH_REAL_CONTROLS");

    await page.getByRole("button").filter({ hasText: /^Main/ }).first().click();
    const languageRow = page
      .locator("tr")
      .filter({ hasText: "System Language" })
      .first();
    const accessInput = languageRow.locator("input").first();
    assert.equal(await accessInput.getAttribute("value"), "01");
    await accessInput.fill("00");
    await accessInput.press("Tab");
    await page.getByRole("button", { name: "Change queue (3)", exact: true }).waitFor();
    console.log("SETUPDATA_STAGED_WITH_REAL_CONTROL");

    const projectedDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "data.json", exact: true }).nth(1).click();
    await (await projectedDownload).saveAs(path.join(work, "projected.json"));
    const projected = JSON.parse(
      fs.readFileSync(path.join(work, "projected.json"), "utf8"),
    );
    const suppression = projected.suppressions.find(
      (candidate) => candidate.offset.toLowerCase() === "0x2b14b",
    );
    assert(suppression);
    assert.equal(suppression.active, true);
    const unchangedSuppression = {
      start: suppression.start,
      end: suppression.end,
      active: suppression.active,
    };
    suppression.active = false;
    fs.writeFileSync(path.join(work, "combined.json"), JSON.stringify(projected));
    const jsonInput = page.locator('input[type=file][accept=".json"]').first();
    await jsonInput.setInputFiles(path.join(work, "combined.json"));
    await page.waitForFunction(
      () =>
        document.querySelector('input[type=file][accept=".json"]').files.length === 0,
    );
    await page.getByRole("button", { name: "Change queue (4)", exact: true }).waitFor();
    console.log("SUPPRESSION_STAGED_THROUGH_SOURCE_BOUND_JSON");

    await page.getByRole("button", { name: "Change queue (4)", exact: true }).click();
    const queue = page.getByRole("dialog", { name: "Change queue", exact: true });
    const queueText = await queue.innerText();
    assert.match(queueText, /4 SELECTED/);
    assert.match(queueText, /681 NET LOGICAL FIELD\(S\)/);
    assert.match(queueText, /Show root menu Chipset/);
    assert.match(
      queueText,
      /Move menu CPU Configuration[\s\S]*Advanced \(0x403\)[\s\S]*PCI Subsystem Settings \(0x40A\)/,
    );
    assert.match(queueText, /Set access level for System Language[\s\S]*01[\s\S]*00/);
    assert.match(queueText, /Show 18 suppressed item\(s\) in Advanced/);
    assert.equal(
      await page
        .getByRole("button", { name: "Check firmware output", exact: true })
        .isDisabled(),
      true,
    );
    console.log("FOUR_SELECTED_OPERATIONS_VERIFIED");
    const sessionDownload = page.waitForEvent(
      "download",
      (download) => download.suggestedFilename() === "firmware-session.json",
    );
    await queue
      .getByRole("button", { name: "Save queue session", exact: true })
      .click();
    const sessionFile = path.join(work, "session-v2.json");
    await (await sessionDownload).saveAs(sessionFile);
    const session = JSON.parse(fs.readFileSync(sessionFile, "utf8"));
    assertMetadataOnly(session);
    console.log("V2_EXPORTED_METADATA_ONLY", JSON.stringify(session.operations));
    await queue.getByRole("button", { name: "Apply selected", exact: true }).click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    const baseline = await downloadVerifiedOutput(
      page,
      path.join(work, "baseline.bin"),
    );
    await page.getByRole("button", { name: "Change queue (4)", exact: true }).click();
    await queue.getByRole("button", { name: "Clear queue", exact: true }).click();
    assert.match(await queue.innerText(), /The queue is empty/);
    for (const name of [
      "Check firmware output",
      "Modified firmware image",
      "Output details",
    ])
      assert.equal(
        await page.getByRole("button", { name, exact: true }).isDisabled(),
        true,
      );
    await queue.getByLabel("Load queue session file").setInputFiles(sessionFile);
    const restoredStarted = Date.now();
    while (
      await queue
        .getByRole("button", { name: "Apply selected", exact: true })
        .isDisabled()
    ) {
      if (Date.now() - restoredStarted > 60000)
        throw Error("Session restore did not finish within one minute");
      await page.waitForTimeout(100);
    }
    const restoredText = await queue.innerText();
    assert.match(restoredText, /4 SELECTED/);
    assert.match(restoredText, /Show root menu Chipset/);
    assert.match(restoredText, /Move menu CPU Configuration/);
    assert.match(restoredText, /Set access level for System Language/);
    assert.match(restoredText, /Show 18 suppressed item/);
    assert.equal(
      await page
        .getByRole("button", { name: "Check firmware output", exact: true })
        .isDisabled(),
      true,
    );
    console.log("V2_RESTORED_UNAPPLIED_NO_CACHED_OUTPUT");
    await queue.getByRole("button", { name: "Apply selected", exact: true }).click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();

    const outputButton = page.getByRole("button", {
      name: "Modified firmware image",
      exact: true,
    });
    const output = await downloadVerifiedOutput(page, path.join(work, "output.bin"));
    assert(
      output.equals(baseline),
      "Session replay must reproduce the baseline full SPI.",
    );

    // Legacy menu-actions v1 uses the same explicit selectors, not imported patches.
    const legacyFile = path.join(work, "session-v1.json");
    fs.writeFileSync(legacyFile, JSON.stringify({ ...session, version: 1 }));
    await page.getByRole("button", { name: "Change queue (4)", exact: true }).click();
    await queue.getByRole("button", { name: "Clear queue", exact: true }).click();
    assert.match(await queue.innerText(), /The queue is empty/);
    await queue.getByLabel("Load queue session file").setInputFiles(legacyFile);
    await queue.getByRole("button", { name: "Apply selected", exact: true }).waitFor();
    const legacyStarted = Date.now();
    while (
      await queue
        .getByRole("button", { name: "Apply selected", exact: true })
        .isDisabled()
    ) {
      if (Date.now() - legacyStarted > 60000)
        throw Error("Legacy session restore did not finish within one minute");
      await page.waitForTimeout(100);
    }
    assert.match(await queue.innerText(), /4 SELECTED/);
    for (const name of [
      "Check firmware output",
      "Modified firmware image",
      "Output details",
    ])
      assert.equal(
        await page.getByRole("button", { name, exact: true }).isDisabled(),
        true,
      );
    const migratedDownload = page.waitForEvent("download");
    await queue
      .getByRole("button", { name: "Save queue session", exact: true })
      .click();
    const migratedFile = path.join(work, "migrated-v2.json");
    await (await migratedDownload).saveAs(migratedFile);
    const migrated = JSON.parse(fs.readFileSync(migratedFile, "utf8"));
    assertMetadataOnly(migrated);
    assert.deepEqual(
      migrated,
      session,
      "Migration must preserve every ordered selector and identity",
    );
    console.log("V1_MIGRATED_TO_IDENTICAL_METADATA_ONLY_V2_UNAPPLIED");
    await queue.getByRole("button", { name: "Apply selected", exact: true }).click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    const legacyOutput = await downloadVerifiedOutput(
      page,
      path.join(work, "legacy.bin"),
    );
    assert(
      legacyOutput.equals(baseline),
      "Legacy replay must reproduce the baseline full SPI",
    );

    // History restores semantic intent, never an applied plan or cached SPI.
    await page.getByRole("button", { name: "Change queue (4)", exact: true }).click();
    const assertInvalidated = async (empty) => {
      assert.equal(
        await queue
          .getByRole("button", { name: "Apply selected", exact: true })
          .isDisabled(),
        empty,
      );
      for (const name of [
        "Check firmware output",
        "Modified firmware image",
        "Output details",
      ])
        assert.equal(
          await page.getByRole("button", { name, exact: true }).isDisabled(),
          true,
        );
      assert.match(
        await queue.innerText(),
        empty ? /The queue is empty/ : /4 SELECTED/,
      );
    };
    await queue.getByRole("button", { name: "Clear queue", exact: true }).click();
    await assertInvalidated(true);
    for (let restoration = 0; restoration < 2; restoration++) {
      await queue
        .getByRole("button", { name: "Undo queue change", exact: true })
        .click();
      await assertInvalidated(false);
      const historyDownload = page.waitForEvent("download");
      await queue
        .getByRole("button", { name: "Save queue session", exact: true })
        .click();
      const historyFile = path.join(work, "history-v2.json");
      await (await historyDownload).saveAs(historyFile);
      const historySession = JSON.parse(fs.readFileSync(historyFile, "utf8"));
      assertMetadataOnly(historySession);
      assert.deepEqual(
        historySession,
        session,
        "Undo must preserve every ordered selector and enabled flag",
      );
      if (restoration === 0) {
        await queue
          .getByRole("button", { name: "Redo queue change", exact: true })
          .click();
        await assertInvalidated(true);
      }
    }
    console.log("CLEAR_UNDO_REDO_UNDO_EXACT_V2_INTENT_NO_CACHED_OUTPUT");
    await queue.getByRole("button", { name: "Apply selected", exact: true }).click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    const historyOutput = await downloadVerifiedOutput(
      page,
      path.join(work, "history.bin"),
    );
    assert(
      historyOutput.equals(baseline),
      "History recovery must freshly reproduce the baseline full SPI",
    );
    console.log("HISTORY_FRESH_FULL_SPI_MATCH");

    // Preserve paused intent through both session versions; only the accepted
    // Ref move is selected. Root-only output is not claimed by this subset.
    const pausedFlags = [false, true, false, false];
    const expectedPaused = {
      ...session,
      operations: session.operations.map((op, index) => ({
        ...op,
        enabled: pausedFlags[index],
      })),
    };
    const assertSelection = async (flags) => {
      const checkboxes = queue.getByRole("checkbox");
      assert.equal(await checkboxes.count(), 4);
      for (let index = 0; index < flags.length; index++)
        assert.equal(await checkboxes.nth(index).isChecked(), flags[index]);
      assert.match(
        await queue.innerText(),
        new RegExp(`${flags.filter(Boolean).length} SELECTED`),
      );
    };
    const saveExactSession = async (expected, flags, name) => {
      const download = page.waitForEvent("download");
      await queue
        .getByRole("button", { name: "Save queue session", exact: true })
        .click();
      const file = path.join(work, name);
      await (await download).saveAs(file);
      const saved = JSON.parse(fs.readFileSync(file, "utf8"));
      assertMetadataOnly(saved, flags);
      assert.deepEqual(
        saved,
        expected,
        "Every selector, identity and paused flag must survive",
      );
      return file;
    };
    const assertOutputDisabled = async () => {
      for (const name of [
        "Check firmware output",
        "Modified firmware image",
        "Output details",
      ])
        assert.equal(
          await page.getByRole("button", { name, exact: true }).isDisabled(),
          true,
        );
    };
    await page.getByRole("button", { name: "Change queue (4)", exact: true }).click();
    for (const index of [0, 2, 3]) {
      await queue.getByRole("checkbox").nth(index).uncheck();
      await assertOutputDisabled();
    }
    await assertSelection(pausedFlags);
    const pausedV2 = await saveExactSession(
      expectedPaused,
      pausedFlags,
      "paused-v2.json",
    );
    const pausedV1 = path.join(work, "paused-v1.json");
    fs.writeFileSync(pausedV1, JSON.stringify({ ...expectedPaused, version: 1 }));
    const moveOnlyResults = [];
    for (const [version, file] of [
      [2, pausedV2],
      [1, pausedV1],
    ]) {
      await queue.getByRole("button", { name: "Clear queue", exact: true }).click();
      await assertInvalidated(true);
      await queue.getByLabel("Load queue session file").setInputFiles(file);
      await page.waitForFunction(() => {
        const input = document.querySelector(
          'input[aria-label="Load queue session file"]',
        );
        return input && input.files.length === 0;
      });
      await assertSelection(pausedFlags);
      assert.equal(
        await queue
          .getByRole("button", { name: "Apply selected", exact: true })
          .isDisabled(),
        false,
      );
      await assertOutputDisabled();
      await saveExactSession(
        expectedPaused,
        pausedFlags,
        `paused-v${version}-reexport.json`,
      );
      console.log("PAUSED_SESSION_RESTORED_IDENTICAL_V2_UNAPPLIED", version);
      await queue.getByRole("button", { name: "Apply selected", exact: true }).click();
      await queue.getByRole("button", { name: "Close", exact: true }).click();
      moveOnlyResults.push(
        await downloadVerifiedOutput(
          page,
          path.join(work, `move-only-v${version}.bin`),
          moveOnlyOutput,
        ),
      );
      await page.getByRole("button", { name: "Change queue (4)", exact: true }).click();
      if (version === 2) {
        for (const invalidVersion of [2, 1]) {
          const invalid = structuredClone(expectedPaused);
          invalid.version = invalidVersion;
          invalid.operations[0].changes[0].rootIndex = Number.MAX_SAFE_INTEGER;
          const invalidFile = path.join(
            work,
            `invalid-paused-root-v${invalidVersion}.json`,
          );
          fs.writeFileSync(invalidFile, JSON.stringify(invalid));
          await queue.getByLabel("Load queue session file").setInputFiles(invalidFile);
          await page.waitForFunction(() => {
            const input = document.querySelector(
              'input[aria-label="Load queue session file"]',
            );
            return input && input.files.length === 0;
          });
          assert.match(
            await queue.getByRole("alert").innerText(),
            /Queue session targets a missing or ambiguous root\./,
          );
          await assertSelection(pausedFlags);
          await saveExactSession(
            expectedPaused,
            pausedFlags,
            `retained-v${invalidVersion}.json`,
          );
          for (const name of [
            "Check firmware output",
            "Modified firmware image",
            "Output details",
          ])
            assert.equal(
              await page.getByRole("button", { name, exact: true }).isDisabled(),
              false,
            );
          console.log(
            "INVALID_PAUSED_ROOT_ATOMIC_REJECTION_READY_OUTPUT_RETAINED",
            invalidVersion,
          );
        }
        await queue.getByRole("button", { name: "Close", exact: true }).click();
        const retained = await downloadReadyOutput(
          page,
          path.join(work, "move-only-retained.bin"),
          moveOnlyOutput,
        );
        assert(
          retained.equals(moveOnlyResults[0]),
          "Rejected paused roots must retain the exact verified SPI",
        );
        await page
          .getByRole("button", { name: "Change queue (4)", exact: true })
          .click();
      }
    }
    assert(
      moveOnlyResults[0].equals(moveOnlyResults[1]),
      "Both session versions must freshly rebuild the same move-only SPI",
    );
    for (const index of [0, 2, 3]) {
      await queue.getByRole("checkbox").nth(index).check();
      await assertOutputDisabled();
    }
    await assertSelection([true, true, true, true]);
    await saveExactSession(session, [true, true, true, true], "reselected-v2.json");
    await queue.getByRole("button", { name: "Apply selected", exact: true }).click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    const reselected = await downloadVerifiedOutput(
      page,
      path.join(work, "reselected.bin"),
    );
    assert(
      reselected.equals(baseline),
      "Reselecting all intent must freshly rebuild the original combined SPI",
    );
    console.log("PAUSED_V2_V1_MOVE_ONLY_AND_FULL_RESELECTION_VERIFIED");

    // Loading a different selection is one undoable replacement, not four
    // checkbox mutations. Neither direction may restore Apply or checked bytes.
    for (const [version, file] of [
      [2, pausedV2],
      [1, pausedV1],
    ]) {
      await page.getByRole("button", { name: "Change queue (4)", exact: true }).click();
      const assertRestoredIntent = async (expected, flags, label) => {
        await assertSelection(flags);
        await assertOutputDisabled();
        assert.equal(
          await queue
            .getByRole("button", {
              name: "Apply selected",
              exact: true,
            })
            .isDisabled(),
          false,
        );
        await saveExactSession(
          expected,
          flags,
          `load-history-v${version}-${label}.json`,
        );
      };
      await queue.getByLabel("Load queue session file").setInputFiles(file);
      await page.waitForFunction(() => {
        const input = document.querySelector(
          'input[aria-label="Load queue session file"]',
        );
        return input && input.files.length === 0;
      });
      await assertRestoredIntent(expectedPaused, pausedFlags, "loaded");
      await queue
        .getByRole("button", { name: "Undo queue change", exact: true })
        .click();
      await assertRestoredIntent(session, [true, true, true, true], "undo");
      await queue
        .getByRole("button", { name: "Redo queue change", exact: true })
        .click();
      await assertRestoredIntent(expectedPaused, pausedFlags, "redo");
      await queue.getByRole("button", { name: "Apply selected", exact: true }).click();
      await queue.getByRole("button", { name: "Close", exact: true }).click();
      const subset = await downloadVerifiedOutput(
        page,
        path.join(work, `move-only-load-history-v${version}.bin`),
        moveOnlyOutput,
      );
      assert(
        subset.equals(moveOnlyResults[0]),
        "Post-Redo SPI must equal the accepted subset",
      );
      await page.getByRole("button", { name: "Change queue (4)", exact: true }).click();
      await queue
        .getByRole("button", { name: "Undo queue change", exact: true })
        .click();
      await assertRestoredIntent(session, [true, true, true, true], "ready-undo");
      await queue.getByRole("button", { name: "Apply selected", exact: true }).click();
      await queue.getByRole("button", { name: "Close", exact: true }).click();
      const full = await downloadVerifiedOutput(
        page,
        path.join(work, `full-load-history-v${version}.bin`),
      );
      assert(full.equals(baseline), "Post-Undo SPI must equal the combined baseline");
      console.log("SESSION_LOAD_SINGLE_UNDO_REDO_READY_UNDO_FRESH_OUTPUTS", version);
    }

    // The final Undo above leaves the old paused session on Redo. Saving is
    // read-only; a genuinely new selection must replace that future branch.
    await page.getByRole("button", { name: "Change queue (4)", exact: true }).click();
    const redoButton = queue.getByRole("button", {
      name: "Redo queue change",
      exact: true,
    });
    assert.equal(await redoButton.isDisabled(), false);
    await saveExactSession(session, [true, true, true, true], "before-new-edit.json");
    assert.equal(await redoButton.isDisabled(), false);
    for (const name of [
      "Check firmware output",
      "Modified firmware image",
      "Output details",
    ])
      assert.equal(
        await page.getByRole("button", { name, exact: true }).isDisabled(),
        false,
      );
    const branchFlags = [false, true, true, true];
    const branchSession = {
      ...session,
      operations: session.operations.map((op, index) => ({
        ...op,
        enabled: branchFlags[index],
      })),
    };
    await queue.getByRole("checkbox").nth(0).uncheck();
    await assertSelection(branchFlags);
    await assertOutputDisabled();
    assert.equal(await redoButton.isDisabled(), true);
    await saveExactSession(branchSession, branchFlags, "new-edit-branch.json");
    assert.equal(await redoButton.isDisabled(), true);
    await queue.getByRole("button", { name: "Undo queue change", exact: true }).click();
    await assertSelection([true, true, true, true]);
    await assertOutputDisabled();
    await saveExactSession(session, [true, true, true, true], "new-edit-undo.json");
    assert.equal(await redoButton.isDisabled(), false);
    await redoButton.click();
    await assertSelection(branchFlags);
    await assertOutputDisabled();
    await saveExactSession(branchSession, branchFlags, "new-edit-redo.json");
    assert.equal(await redoButton.isDisabled(), true);
    // Three-selected state is planning evidence only: do not infer allocation
    // fit or introduce another accepted output combination from this history.
    await queue.getByRole("button", { name: "Undo queue change", exact: true }).click();
    await assertSelection([true, true, true, true]);
    await assertOutputDisabled();
    await saveExactSession(
      session,
      [true, true, true, true],
      "new-edit-final-undo.json",
    );
    await queue.getByRole("button", { name: "Apply selected", exact: true }).click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    const branchedOutput = await downloadVerifiedOutput(
      page,
      path.join(work, "new-edit-history.bin"),
    );
    assert(
      branchedOutput.equals(baseline),
      "Discarding old Redo must still permit a fresh known full SPI",
    );
    console.log("SAVE_RETAINS_REDO_NEW_SELECTION_DISCARDS_OLD_BRANCH_FRESH_FULL_SPI");

    // Isolate queue-revision cancellation: keep this source and dialog open
    // across Clear/Undo and delivery of the original native File.text result.
    await page.getByRole("button", { name: "Change queue (4)", exact: true }).click();
    const heldFile = path.join(work, "held-nested-session.json");
    fs.copyFileSync(pausedV2, heldFile);
    const documentOrigin = await page.evaluate(() => performance.timeOrigin);
    const installReadProbe = () => {
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
        const hold = armed && this.name === "held-nested-session.json";
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
      window.__nestedReadProbe = {
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
    };
    await page.evaluate(installReadProbe);
    await queue.getByLabel("Load queue session file").setInputFiles(heldFile);
    await page.waitForFunction(() => window.__nestedReadProbe.state.held);
    assert.deepEqual(await page.evaluate(() => window.__nestedReadProbe.state), {
      calls: 1,
      nativeCompleted: 1,
      delivered: 0,
      hashes: 0,
      held: true,
    });
    assert.equal(await queue.getByText("Validating queue session…").isVisible(), true);
    await queue.getByRole("button", { name: "Clear queue", exact: true }).click();
    await assertInvalidated(true);
    await queue.getByRole("button", { name: "Undo queue change", exact: true }).click();
    await assertSelection([true, true, true, true]);
    await assertOutputDisabled();
    await page.evaluate(() => window.__nestedReadProbe.release());
    await page.waitForFunction(() => window.__nestedReadProbe.state.delivered === 1);
    // Observe in another browser task after the text promise/microtasks. AMI
    // identity starts native digests before its first await; zero new calls
    // proves the cancelled text did not enter that validation path. This is
    // not instrumentation of the old React handler's complete return.
    assert.deepEqual(await page.evaluate(() => window.__nestedReadProbe.state), {
      calls: 1,
      nativeCompleted: 1,
      delivered: 1,
      hashes: 0,
      held: false,
    });
    assert.equal(await queue.isVisible(), true);
    assert.equal(await page.evaluate(() => performance.timeOrigin), documentOrigin);
    await assertSelection([true, true, true, true]);
    await assertOutputDisabled();
    assert.equal(await queue.getByRole("alert").count(), 0);
    assert.equal(await queue.getByText("Validating queue session…").count(), 0);
    assert.equal(await queue.getByText(/Queue session loaded/).count(), 0);
    assert.equal(await redoButton.isDisabled(), false);
    console.log("OPEN_DIALOG_CLEAR_UNDO_OLD_NATIVE_TEXT_ZERO_VALIDATION_HASHES");

    // Positive control: the same current paused metadata must still hash and
    // replay normally after cancellation, then full loading permits fresh output.
    await queue.getByLabel("Load queue session file").setInputFiles(pausedV2);
    await page.waitForFunction(() => {
      const input = document.querySelector(
        'input[aria-label="Load queue session file"]',
      );
      return input && input.files.length === 0;
    });
    await assertSelection(pausedFlags);
    await assertOutputDisabled();
    const currentLoadHashes = await page.evaluate(
      () => window.__nestedReadProbe.state.hashes,
    );
    assert(
      currentLoadHashes >= 3,
      "Current AMI load must execute its native identity hashes",
    );
    assert.equal(await redoButton.isDisabled(), true);
    await saveExactSession(
      expectedPaused,
      pausedFlags,
      "after-cancel-current-paused.json",
    );
    await queue.getByLabel("Load queue session file").setInputFiles(sessionFile);
    await page.waitForFunction(() => {
      const input = document.querySelector(
        'input[aria-label="Load queue session file"]',
      );
      return input && input.files.length === 0;
    });
    await assertSelection([true, true, true, true]);
    await assertOutputDisabled();
    await saveExactSession(
      session,
      [true, true, true, true],
      "after-cancel-current-full.json",
    );
    assert.equal(await queue.getByRole("alert").count(), 0);
    await page.evaluate(() => window.__nestedReadProbe.restore());
    await queue.getByRole("button", { name: "Apply selected", exact: true }).click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    const recoveredReadOutput = await downloadVerifiedOutput(
      page,
      path.join(work, "cancelled-read-recovery.bin"),
    );
    assert(
      recoveredReadOutput.equals(baseline),
      "Cancelled text must not prevent fresh current full-SPI recovery",
    );
    console.log(
      "CURRENT_LOAD_AFTER_CANCEL_HASHES_EXACT_EXPORTS_FRESH_FULL_SPI",
      currentLoadHashes,
    );

    // Isolate dialog lifetime cancellation without Clear/Undo, source changes
    // or a newer request. Closing must retain the already verified full SPI.
    await page.getByRole("button", { name: "Change queue (4)", exact: true }).click();
    await page.evaluate(installReadProbe);
    await queue.getByLabel("Load queue session file").setInputFiles(heldFile);
    await page.waitForFunction(() => window.__nestedReadProbe.state.held);
    assert.deepEqual(await page.evaluate(() => window.__nestedReadProbe.state), {
      calls: 1,
      nativeCompleted: 1,
      delivered: 0,
      hashes: 0,
      held: true,
    });
    assert.equal(await queue.getByText("Validating queue session…").isVisible(), true);
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    await queue.waitFor({ state: "hidden" });
    await page.evaluate(() => window.__nestedReadProbe.release());
    await page.waitForFunction(() => window.__nestedReadProbe.state.delivered === 1);
    // As above, a subsequent task with zero native digest calls proves no
    // adapter validation entry, not the old React handler's complete return.
    assert.deepEqual(await page.evaluate(() => window.__nestedReadProbe.state), {
      calls: 1,
      nativeCompleted: 1,
      delivered: 1,
      hashes: 0,
      held: false,
    });
    assert.equal(await page.evaluate(() => performance.timeOrigin), documentOrigin);
    assert.equal(await outputButton.isDisabled(), false);
    assert.equal(
      await page
        .getByRole("button", { name: "Output details", exact: true })
        .isDisabled(),
      false,
    );
    const retainedClosedOutput = await downloadReadyOutput(
      page,
      path.join(work, "closed-dialog-retained.bin"),
      combinedOutput,
    );
    assert(
      retainedClosedOutput.equals(recoveredReadOutput),
      "Closing a pending session read must retain the actual checked full SPI",
    );
    await page.getByRole("button", { name: "Change queue (4)", exact: true }).click();
    await assertSelection([true, true, true, true]);
    assert.equal(await queue.getByRole("alert").count(), 0);
    assert.equal(await queue.getByText("Validating queue session…").count(), 0);
    assert.equal(await queue.getByText(/Queue session loaded/).count(), 0);
    // A current load after reopening is the positive control for this new
    // probe instance; export is intentionally after the zero-hash assertion.
    await saveExactSession(session, [true, true, true, true], "after-close-full.json");
    const hashesBeforeCurrent = await page.evaluate(
      () => window.__nestedReadProbe.state.hashes,
    );
    await queue.getByLabel("Load queue session file").setInputFiles(pausedV2);
    await page.waitForFunction(() => {
      const input = document.querySelector(
        'input[aria-label="Load queue session file"]',
      );
      return input && input.files.length === 0;
    });
    await assertSelection(pausedFlags);
    await assertOutputDisabled();
    const reopenedLoadHashes =
      (await page.evaluate(() => window.__nestedReadProbe.state.hashes)) -
      hashesBeforeCurrent;
    assert(reopenedLoadHashes >= 3, "Reopened current load must hash its identity");
    await saveExactSession(expectedPaused, pausedFlags, "after-close-paused.json");
    await queue.getByLabel("Load queue session file").setInputFiles(sessionFile);
    await page.waitForFunction(() => {
      const input = document.querySelector(
        'input[aria-label="Load queue session file"]',
      );
      return input && input.files.length === 0;
    });
    await assertSelection([true, true, true, true]);
    await assertOutputDisabled();
    await saveExactSession(
      session,
      [true, true, true, true],
      "after-close-reloaded.json",
    );
    assert.equal(await queue.getByRole("alert").count(), 0);
    await page.evaluate(() => window.__nestedReadProbe.restore());
    await queue.getByRole("button", { name: "Apply selected", exact: true }).click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    const reopenedReadOutput = await downloadVerifiedOutput(
      page,
      path.join(work, "closed-dialog-recovery.bin"),
    );
    assert(reopenedReadOutput.equals(baseline));
    console.log(
      "CLOSE_ONLY_OLD_TEXT_ZERO_HASHES_RETAINED_SPI_CURRENT_LOAD_FRESH_RECOVERY",
      reopenedLoadHashes,
    );

    // Same-byte replacement includes dialog closure and footer unmount. Prove
    // reset before delivering old native text, without a newer session request.
    await page.getByRole("button", { name: "Change queue (4)", exact: true }).click();
    await page.evaluate(installReadProbe);
    await queue.getByLabel("Load queue session file").setInputFiles(heldFile);
    await page.waitForFunction(() => window.__nestedReadProbe.state.held);
    const replacementHeld = await page.evaluate(() => window.__nestedReadProbe.state);
    assert.deepEqual(replacementHeld, {
      calls: 1,
      nativeCompleted: 1,
      delivered: 0,
      hashes: 0,
      held: true,
    });
    assert.equal(await queue.getByText("Validating queue session…").isVisible(), true);
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    await page
      .getByRole("button", { name: "Load another firmware", exact: true })
      .click();
    await page
      .locator("input[type=file]")
      .first()
      .setInputFiles(path.join(work, "source.bin"));
    await page.getByRole("button", { name: "Start HII analysis", exact: true }).click();
    await page
      .getByRole("button", { name: "Change queue (0)", exact: true })
      .waitFor({ timeout: 240000 });
    assert.equal(await page.evaluate(() => performance.timeOrigin), documentOrigin);
    const freshBaseDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "data.json", exact: true }).nth(1).click();
    const freshBaseFile = path.join(work, "replacement-original-base.json");
    await (await freshBaseDownload).saveAs(freshBaseFile);
    const freshBase = JSON.parse(fs.readFileSync(freshBaseFile, "utf8"));
    assert.equal(freshBase.forms.length, 68);
    assert.equal(refs(freshBase, "0x403").length, 2);
    assert.equal(refs(freshBase, "0x40A").length, 0);
    assert.equal(question(freshBase, "System Language").accessLevel, "01");
    assert.deepEqual(
      freshBase.rootVisibility.entries.map((entry) => entry.value),
      [1, 1, 1, 1, 0, 1, 1, 1],
    );
    const freshSuppression = freshBase.suppressions.find(
      (entry) => entry.offset.toLowerCase() === "0x2b15a",
    );
    assert(freshSuppression);
    assert.equal(freshSuppression.active, true);
    assert.notEqual(freshSuppression.start, freshSuppression.end);
    await page.getByRole("button", { name: "Change queue (0)", exact: true }).click();
    const assertResetHistory = async () => {
      await assertInvalidated(true);
      for (const name of ["Undo queue change", "Redo queue change"])
        assert.equal(
          await queue.getByRole("button", { name, exact: true }).isDisabled(),
          true,
        );
      assert.equal(await queue.getByRole("alert").count(), 0);
      assert.equal(await queue.getByText("Validating queue session…").count(), 0);
      assert.equal(await queue.getByText(/Queue session loaded/).count(), 0);
    };
    await assertResetHistory();
    const beforeReplacementDelivery = await page.evaluate(
      () => window.__nestedReadProbe.state,
    );
    assert.equal(beforeReplacementDelivery.held, true);
    assert.equal(beforeReplacementDelivery.delivered, 0);
    await page.evaluate(() => window.__nestedReadProbe.release());
    await page.waitForFunction(() => window.__nestedReadProbe.state.delivered === 1);
    // Account separately for any hashes used by fresh source analysis. Old
    // delivery itself must add none, before a current load or session export.
    assert.deepEqual(await page.evaluate(() => window.__nestedReadProbe.state), {
      ...beforeReplacementDelivery,
      delivered: 1,
      held: false,
    });
    await assertResetHistory();
    assert.equal(await page.evaluate(() => performance.timeOrigin), documentOrigin);
    console.log(
      "SAME_BYTE_SOURCE_REOPEN_ORIGINAL_BASE_EMPTY_HISTORY_OLD_TEXT_ZERO_NEW_HASHES",
    );
    const beforeReplacementLoad = await page.evaluate(
      () => window.__nestedReadProbe.state.hashes,
    );
    await queue.getByLabel("Load queue session file").setInputFiles(pausedV2);
    await page.waitForFunction(() => {
      const input = document.querySelector(
        'input[aria-label="Load queue session file"]',
      );
      return input && input.files.length === 0;
    });
    await assertSelection(pausedFlags);
    await assertOutputDisabled();
    const replacementLoadHashes =
      (await page.evaluate(() => window.__nestedReadProbe.state.hashes)) -
      beforeReplacementLoad;
    assert(
      replacementLoadHashes >= 3,
      "Replacement current load must hash its identity",
    );
    await saveExactSession(
      expectedPaused,
      pausedFlags,
      "after-replacement-paused.json",
    );
    await queue.getByLabel("Load queue session file").setInputFiles(sessionFile);
    await page.waitForFunction(() => {
      const input = document.querySelector(
        'input[aria-label="Load queue session file"]',
      );
      return input && input.files.length === 0;
    });
    await assertSelection([true, true, true, true]);
    await assertOutputDisabled();
    await saveExactSession(
      session,
      [true, true, true, true],
      "after-replacement-full.json",
    );
    assert.equal(await queue.getByRole("alert").count(), 0);
    await page.evaluate(() => window.__nestedReadProbe.restore());
    await queue.getByRole("button", { name: "Apply selected", exact: true }).click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    const replacementReadOutput = await downloadVerifiedOutput(
      page,
      path.join(work, "source-replacement-recovery.bin"),
    );
    assert(replacementReadOutput.equals(baseline));
    console.log(
      "SOURCE_REPLACEMENT_CURRENT_LOAD_EXACT_EXPORTS_FRESH_FULL_SPI",
      replacementLoadHashes,
    );

    // Replace with an actual known download, not synthetic byte corruption.
    // No writer is invoked on that different-byte source.
    const reopenAndRead = async (file) => {
      await page
        .getByRole("button", { name: "Load another firmware", exact: true })
        .click();
      await page
        .locator("input[type=file]")
        .first()
        .setInputFiles(path.join(work, file));
      await page
        .getByRole("button", { name: "Start HII analysis", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Change queue (0)", exact: true })
        .waitFor({ timeout: 240000 });
      assert.equal(await page.evaluate(() => performance.timeOrigin), documentOrigin);
      const read = page.waitForEvent("download");
      await page.getByRole("button", { name: "data.json", exact: true }).nth(1).click();
      const destination = path.join(work, `distinct-read-${file}.json`);
      await (await read).saveAs(destination);
      return JSON.parse(fs.readFileSync(destination, "utf8"));
    };
    assert.equal(
      sha256(fs.readFileSync(path.join(work, "baseline.bin"))),
      combinedOutput.sha,
    );
    assert.notEqual(combinedOutput.sha, sha256(sourceBytes));
    await page.getByRole("button", { name: "Change queue (4)", exact: true }).click();
    await page.evaluate(installReadProbe);
    await queue.getByLabel("Load queue session file").setInputFiles(heldFile);
    await page.waitForFunction(() => window.__nestedReadProbe.state.held);
    assert.deepEqual(await page.evaluate(() => window.__nestedReadProbe.state), {
      calls: 1,
      nativeCompleted: 1,
      delivered: 0,
      hashes: 0,
      held: true,
    });
    assert.equal(await queue.getByText("Validating queue session…").isVisible(), true);
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    const differentBase = await reopenAndRead("baseline.bin");
    assert.equal(differentBase.forms.length, 68);
    assert.equal(refs(differentBase, "0x403").length, 1);
    assert.equal(refs(differentBase, "0x40A").length, 1);
    assert.equal(refs(differentBase, "0x40A")[0].ifrOffset.toLowerCase(), "0x2b49b");
    assert.equal(question(differentBase, "System Language").accessLevel, "00");
    assert.deepEqual(
      differentBase.rootVisibility.entries.map((entry) => entry.value),
      Array(8).fill(1),
    );
    const differentSuppression = differentBase.suppressions.find(
      (entry) => entry.offset.toLowerCase() === "0x2b14b",
    );
    assert(differentSuppression);
    assert.equal(differentSuppression.start.toLowerCase(), "0x2b14f");
    assert.equal(differentSuppression.start, differentSuppression.end);
    await page.getByRole("button", { name: "Change queue (0)", exact: true }).click();
    await assertResetHistory();
    const beforeDistinctDelivery = await page.evaluate(
      () => window.__nestedReadProbe.state,
    );
    assert.equal(beforeDistinctDelivery.held, true);
    assert.equal(beforeDistinctDelivery.delivered, 0);
    await page.evaluate(() => window.__nestedReadProbe.release());
    await page.waitForFunction(() => window.__nestedReadProbe.state.delivered === 1);
    assert.deepEqual(await page.evaluate(() => window.__nestedReadProbe.state), {
      ...beforeDistinctDelivery,
      delivered: 1,
      held: false,
    });
    await assertResetHistory();
    assert.equal(await page.evaluate(() => performance.timeOrigin), documentOrigin);
    console.log(
      "DISTINCT_DOWNLOAD_REOPEN_FOUR_EDITS_EMPTY_HISTORY_OLD_TEXT_ZERO_NEW_HASHES",
    );

    // Current loading must reach the native identity checks and reject the
    // original session on changed bytes, rather than restoring its old plan.
    const beforeDistinctLoad = await page.evaluate(
      () => window.__nestedReadProbe.state.hashes,
    );
    await queue.getByLabel("Load queue session file").setInputFiles(pausedV2);
    await page.waitForFunction(() => {
      const input = document.querySelector(
        'input[aria-label="Load queue session file"]',
      );
      return input && input.files.length === 0;
    });
    const distinctRejection = queue.getByRole("alert");
    await distinctRejection.waitFor();
    assert.match(
      await distinctRejection.innerText(),
      /different firmware image or opened HII context/,
    );
    const distinctLoadHashes =
      (await page.evaluate(() => window.__nestedReadProbe.state.hashes)) -
      beforeDistinctLoad;
    assert.equal(distinctLoadHashes, 3);
    await assertInvalidated(true);
    for (const name of ["Undo queue change", "Redo queue change"])
      assert.equal(
        await queue.getByRole("button", { name, exact: true }).isDisabled(),
        true,
      );
    assert.equal(await queue.getByText("Validating queue session…").count(), 0);
    assert.equal(await queue.getByText(/Queue session loaded/).count(), 0);
    await page.evaluate(() => window.__nestedReadProbe.restore());
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    const returnedBase = await reopenAndRead("source.bin");
    assert.equal(returnedBase.forms.length, 68);
    assert.equal(refs(returnedBase, "0x403").length, 2);
    assert.equal(refs(returnedBase, "0x40A").length, 0);
    assert.equal(question(returnedBase, "System Language").accessLevel, "01");
    assert.deepEqual(
      returnedBase.rootVisibility.entries.map((entry) => entry.value),
      [1, 1, 1, 1, 0, 1, 1, 1],
    );
    const returnedSuppression = returnedBase.suppressions.find(
      (entry) => entry.offset.toLowerCase() === "0x2b15a",
    );
    assert(returnedSuppression);
    assert.equal(returnedSuppression.active, true);
    assert.notEqual(returnedSuppression.start, returnedSuppression.end);
    await page.getByRole("button", { name: "Change queue (0)", exact: true }).click();
    await assertResetHistory();
    await queue.getByLabel("Load queue session file").setInputFiles(sessionFile);
    await page.waitForFunction(() => {
      const input = document.querySelector(
        'input[aria-label="Load queue session file"]',
      );
      return input && input.files.length === 0;
    });
    await assertSelection([true, true, true, true]);
    await assertOutputDisabled();
    await saveExactSession(
      session,
      [true, true, true, true],
      "after-distinct-return-full.json",
    );
    assert.equal(await queue.getByRole("alert").count(), 0);
    await queue.getByRole("button", { name: "Apply selected", exact: true }).click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    const distinctRecovery = await downloadVerifiedOutput(
      page,
      path.join(work, "distinct-source-recovery.bin"),
    );
    assert(distinctRecovery.equals(baseline));
    console.log(
      "DISTINCT_SOURCE_THREE_HASH_REJECTION_RETURN_ORIGINAL_FRESH_FULL_SPI",
      distinctLoadHashes,
    );

    // Delay the real final identity digest, not a fabricated error. The same
    // invalid paused root already rejects atomically above. Keep source/dialog
    // open so only a Clear/Undo revision change cancels this late rejection.
    await page.getByRole("button", { name: "Change queue (4)", exact: true }).click();
    const installRejectionProbe = (expectedContext) => {
      const descriptor = Object.getOwnPropertyDescriptor(crypto.subtle, "digest");
      const native = crypto.subtle.digest;
      const state = {
        calls: 0,
        completed: 0,
        delivered: 0,
        held: false,
        matches: false,
      };
      let release;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      crypto.subtle.digest = async function (...args) {
        const call = ++state.calls;
        const result = await native.apply(this, args);
        state.completed++;
        if (call === 3) {
          state.matches =
            Array.from(new Uint8Array(result), (byte) =>
              byte.toString(16).padStart(2, "0"),
            ).join("") === expectedContext;
          state.held = true;
          await gate;
          state.held = false;
          state.delivered++;
        }
        return result;
      };
      window.__nestedRejectionProbe = {
        state,
        release,
        restore: () => {
          if (descriptor) Object.defineProperty(crypto.subtle, "digest", descriptor);
          else delete crypto.subtle.digest;
        },
      };
    };
    await page.evaluate(installRejectionProbe, session.source.contextSha256);
    const invalidPausedFile = path.join(work, "invalid-paused-root-v2.json");
    await queue.getByLabel("Load queue session file").setInputFiles(invalidPausedFile);
    await page.waitForFunction(() => window.__nestedRejectionProbe.state.held);
    assert.deepEqual(await page.evaluate(() => window.__nestedRejectionProbe.state), {
      calls: 3,
      completed: 3,
      delivered: 0,
      held: true,
      matches: true,
    });
    assert.equal(await queue.getByText("Validating queue session…").isVisible(), true);
    await queue.getByRole("button", { name: "Clear queue", exact: true }).click();
    await assertInvalidated(true);
    await queue.getByRole("button", { name: "Undo queue change", exact: true }).click();
    await assertSelection([true, true, true, true]);
    await assertOutputDisabled();
    await page.evaluate(() => window.__nestedRejectionProbe.release());
    await page.waitForFunction(
      () => window.__nestedRejectionProbe.state.delivered === 1,
    );
    // Let the identity continuation, synchronous root rejection and controls'
    // catch run across browser tasks; do not claim a captured React full return.
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    assert.deepEqual(await page.evaluate(() => window.__nestedRejectionProbe.state), {
      calls: 3,
      completed: 3,
      delivered: 1,
      held: false,
      matches: true,
    });
    assert.equal(await page.evaluate(() => performance.timeOrigin), documentOrigin);
    assert.equal(await queue.isVisible(), true);
    await assertSelection([true, true, true, true]);
    await assertOutputDisabled();
    assert.equal(await redoButton.isDisabled(), false);
    assert.equal(await queue.getByRole("alert").count(), 0);
    assert.equal(await queue.getByText("Validating queue session…").count(), 0);
    assert.equal(await queue.getByText(/Queue session loaded/).count(), 0);
    console.log("LATE_PAUSED_ROOT_REJECTION_CLEAR_UNDO_NO_STALE_ALERT_REDO_RETAINED");

    // Current validation of the identical invalid file must still reject after
    // all three genuine hashes, without replacing the full queue or its Redo.
    await queue.getByLabel("Load queue session file").setInputFiles(invalidPausedFile);
    await page.waitForFunction(() => {
      const input = document.querySelector(
        'input[aria-label="Load queue session file"]',
      );
      return input && input.files.length === 0;
    });
    assert.match(
      await queue.getByRole("alert").innerText(),
      /Queue session targets a missing or ambiguous root\./,
    );
    assert.equal(
      await page.evaluate(() => window.__nestedRejectionProbe.state.calls),
      6,
    );
    await assertSelection([true, true, true, true]);
    await assertOutputDisabled();
    assert.equal(await redoButton.isDisabled(), false);
    await page.evaluate(() => window.__nestedRejectionProbe.restore());
    await queue.getByLabel("Load queue session file").setInputFiles(sessionFile);
    await page.waitForFunction(() => {
      const input = document.querySelector(
        'input[aria-label="Load queue session file"]',
      );
      return input && input.files.length === 0;
    });
    await assertSelection([true, true, true, true]);
    await assertOutputDisabled();
    assert.equal(await redoButton.isDisabled(), true);
    assert.equal(await queue.getByRole("alert").count(), 0);
    await saveExactSession(
      session,
      [true, true, true, true],
      "late-rejection-retry.json",
    );
    await queue.getByRole("button", { name: "Apply selected", exact: true }).click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    const lateRejectionRecovery = await downloadVerifiedOutput(
      page,
      path.join(work, "late-rejection-recovery.bin"),
    );
    assert(lateRejectionRecovery.equals(baseline));
    console.log("CURRENT_THREE_HASH_ROOT_REJECTION_VALID_RETRY_FRESH_FULL_SPI");

    // Close only: no queue/source mutation or newer request may mask the late
    // semantic rejection. Reuse the unchanged native-result gate above.
    await page.getByRole("button", { name: "Change queue (4)", exact: true }).click();
    await page.evaluate(installRejectionProbe, session.source.contextSha256);
    await queue.getByLabel("Load queue session file").setInputFiles(invalidPausedFile);
    await page.waitForFunction(() => window.__nestedRejectionProbe.state.held);
    assert.deepEqual(await page.evaluate(() => window.__nestedRejectionProbe.state), {
      calls: 3,
      completed: 3,
      delivered: 0,
      held: true,
      matches: true,
    });
    assert.equal(await queue.getByText("Validating queue session…").isVisible(), true);
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    await queue.waitFor({ state: "hidden" });
    await page.evaluate(() => window.__nestedRejectionProbe.release());
    await page.waitForFunction(
      () => window.__nestedRejectionProbe.state.delivered === 1,
    );
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    assert.deepEqual(await page.evaluate(() => window.__nestedRejectionProbe.state), {
      calls: 3,
      completed: 3,
      delivered: 1,
      held: false,
      matches: true,
    });
    assert.equal(await page.evaluate(() => performance.timeOrigin), documentOrigin);
    assert.equal(await queue.isVisible(), false);
    for (const name of [
      "Check firmware output",
      "Modified firmware image",
      "Output details",
    ])
      assert.equal(
        await page.getByRole("button", { name, exact: true }).isDisabled(),
        false,
      );
    const retainedRejectionOutput = await downloadReadyOutput(
      page,
      path.join(work, "closed-rejection-retained.bin"),
      combinedOutput,
    );
    assert(retainedRejectionOutput.equals(lateRejectionRecovery));
    await page.getByRole("button", { name: "Change queue (4)", exact: true }).click();
    await queue.waitFor({ state: "visible" });
    await queue.getByRole("checkbox").nth(3).waitFor({ state: "visible" });
    await assertSelection([true, true, true, true]);
    assert.equal(await queue.getByRole("alert").count(), 0);
    assert.equal(await queue.getByText("Validating queue session…").count(), 0);
    assert.equal(await queue.getByText(/Queue session loaded/).count(), 0);
    // No newer session request or Check before this observation; cached
    // download/report/reopen must not add native identity hashes.
    assert.equal(
      await page.evaluate(() => window.__nestedRejectionProbe.state.calls),
      3,
    );
    console.log("CLOSE_ONLY_LATE_ROOT_REJECTION_NO_STALE_ALERT_CACHED_SPI_RETAINED");
    await queue.getByLabel("Load queue session file").setInputFiles(invalidPausedFile);
    await page.waitForFunction(() => {
      const input = document.querySelector(
        'input[aria-label="Load queue session file"]',
      );
      return input && input.files.length === 0;
    });
    assert.match(
      await queue.getByRole("alert").innerText(),
      /Queue session targets a missing or ambiguous root\./,
    );
    assert.equal(
      await page.evaluate(() => window.__nestedRejectionProbe.state.calls),
      6,
    );
    await assertSelection([true, true, true, true]);
    for (const name of [
      "Check firmware output",
      "Modified firmware image",
      "Output details",
    ])
      assert.equal(
        await page.getByRole("button", { name, exact: true }).isDisabled(),
        false,
      );
    await page.evaluate(() => window.__nestedRejectionProbe.restore());
    await saveExactSession(
      session,
      [true, true, true, true],
      "closed-rejection-retained.json",
    );
    await queue.getByLabel("Load queue session file").setInputFiles(sessionFile);
    await page.waitForFunction(() => {
      const input = document.querySelector(
        'input[aria-label="Load queue session file"]',
      );
      return input && input.files.length === 0;
    });
    await assertSelection([true, true, true, true]);
    await assertOutputDisabled();
    assert.equal(await queue.getByRole("alert").count(), 0);
    await saveExactSession(
      session,
      [true, true, true, true],
      "closed-rejection-retry.json",
    );
    await queue.getByRole("button", { name: "Apply selected", exact: true }).click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    const closedRejectionRecovery = await downloadVerifiedOutput(
      page,
      path.join(work, "closed-rejection-recovery.bin"),
    );
    assert(closedRejectionRecovery.equals(baseline));
    console.log("REOPENED_CURRENT_ROOT_REJECTION_RETAINS_OUTPUT_VALID_RETRY_FRESH_SPI");

    await page.getByRole("button", { name: "Change queue (4)", exact: true }).click();
    await queue
      .getByRole("button", { name: /^Remove .* from change queue$/ })
      .first()
      .click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    assert.equal(await outputButton.isDisabled(), true);
    assert.equal(
      await page
        .getByRole("button", { name: "Output details", exact: true })
        .isDisabled(),
      true,
    );
    console.log("REMOVAL_INVALIDATED");

    for (const file of [
      "baseline.bin",
      "output.bin",
      "legacy.bin",
      "history.bin",
      "move-only-v2.bin",
      "move-only-retained.bin",
      "move-only-v1.bin",
      "reselected.bin",
      "move-only-load-history-v2.bin",
      "full-load-history-v2.bin",
      "move-only-load-history-v1.bin",
      "full-load-history-v1.bin",
      "new-edit-history.bin",
      "cancelled-read-recovery.bin",
      "closed-dialog-retained.bin",
      "closed-dialog-recovery.bin",
      "source-replacement-recovery.bin",
      "distinct-source-recovery.bin",
      "late-rejection-recovery.bin",
      "closed-rejection-retained.bin",
      "closed-rejection-recovery.bin",
    ]) {
      await page.reload();
      await page
        .locator("input[type=file]")
        .first()
        .setInputFiles(path.join(work, file));
      await page
        .getByRole("button", { name: "Start HII analysis", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Change queue (0)", exact: true })
        .waitFor({ timeout: 240000 });
      const reopenedDownload = page.waitForEvent("download");
      await page.getByRole("button", { name: "data.json", exact: true }).nth(1).click();
      await (await reopenedDownload).saveAs(path.join(work, "reopened.json"));
      const reopened = JSON.parse(
        fs.readFileSync(path.join(work, "reopened.json"), "utf8"),
      );
      assert.equal(reopened.forms.length, 68);
      assert.equal(refs(reopened, "0x403").length, 1);
      assert.equal(refs(reopened, "0x40A").length, 1);
      assert.equal(refs(reopened, "0x40A")[0].ifrOffset.toLowerCase(), "0x2b49b");
      const reopenedSuppression = reopened.suppressions.find(
        (candidate) => candidate.offset.toLowerCase() === "0x2b14b",
      );
      assert(reopenedSuppression);
      assert.equal(reopenedSuppression.start.toLowerCase(), "0x2b14f");
      const moveOnly = file.startsWith("move-only");
      if (moveOnly) {
        assert.deepEqual(
          {
            start: reopenedSuppression.start,
            end: reopenedSuppression.end,
            active: reopenedSuppression.active,
          },
          unchangedSuppression,
        );
        assert.notEqual(reopenedSuppression.start, reopenedSuppression.end);
      } else assert.equal(reopenedSuppression.start, reopenedSuppression.end);
      assert.equal(
        question(reopened, "System Language").accessLevel,
        moveOnly ? "01" : "00",
      );
      assert.deepEqual(
        reopened.rootVisibility.entries.map((entry) => entry.value),
        moveOnly ? [1, 1, 1, 1, 0, 1, 1, 1] : [1, 1, 1, 1, 1, 1, 1, 1],
      );
      assert.equal(await outputButton.isDisabled(), true);
      console.log(
        moveOnly
          ? "INDEPENDENT_MOVE_ONLY_REREAD_PAUSED_STATES_UNCHANGED"
          : "INDEPENDENT_FOUR_EDIT_REREAD",
        file,
      );
    }
    await page.getByRole("button", { name: "Change queue (0)", exact: true }).click();
    const reopenedQueue = page.getByRole("dialog", {
      name: "Change queue",
      exact: true,
    });
    for (const rejectedFile of [sessionFile, legacyFile]) {
      await reopenedQueue
        .getByLabel("Load queue session file")
        .setInputFiles(rejectedFile);
      await page.waitForFunction(() => {
        const input = document.querySelector(
          'input[aria-label="Load queue session file"]',
        );
        return input && input.files.length === 0;
      });
      const rejection = reopenedQueue.getByRole("alert");
      await rejection.waitFor();
      assert.match(
        await rejection.innerText(),
        /different firmware image or opened HII context/,
      );
      assert.match(await reopenedQueue.innerText(), /The queue is empty/);
      assert.equal(await outputButton.isDisabled(), true);
      console.log("CHANGED_SOURCE_REJECTED_SESSION_EMPTY_QUEUE");
    }
    assert.equal(pageErrors.length, 0, "No application page errors are allowed.");
    assert.equal(
      blockedRequests,
      0,
      "The app must request only public static assets, never upload private bytes",
    );
    console.log("STATIC_GET_ONLY_NETWORK_BOUNDARY_NO_UPLOADS");
    console.log("ASSETS", [...assets]);
  } finally {
    await browser?.close();
    fs.rmSync(work, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
