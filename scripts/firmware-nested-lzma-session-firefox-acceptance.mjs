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

const expectedOutputSha =
  "014af11ec7d614471d873974b83b90c1ae5583adb51beeeda68d3c6940bd64e6";
const work = fs.mkdtempSync(
  path.join(os.tmpdir(), "uefi-nested-lzma-session-firefox-"),
);
fs.writeFileSync(path.join(work, "source.bin"), sourceBytes);

function assertMetadataOnly(session) {
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
  for (const op of session.operations) assert.equal(op.enabled, true);
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

async function downloadVerifiedOutput(page, destination) {
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

  const imageDownload = page.waitForEvent("download", (download) =>
    download.suggestedFilename().endsWith(".bin"),
  );
  await outputButton.click();
  await (await imageDownload).saveAs(destination);
  const output = fs.readFileSync(destination);
  assert.equal(output.length, sourceBytes.length);
  assert.equal(sha256(output), expectedOutputSha);
  let changed = 0;
  let outsideOwner = 0;
  let outsideBios = 0;
  for (let index = 0; index < output.length; index++) {
    if (output[index] === sourceBytes[index]) continue;
    changed++;
    if (index < 1704008 || index >= 3198149) outsideOwner++;
    if (index < 1572864) outsideBios++;
  }
  assert.equal(changed, 850394);
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
  await verifyByteComparisonReport(page, output);
  return output;
}

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
  assert.equal(changed, 850394);
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
  assert.match(text, /4194304 bytes, 850394 changed bytes/);
  assert.match(text, /1494108[\s\S]*1493440[\s\S]*668/);
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
    const assets = new Set();
    page.on("pageerror", (error) => pageErrors.push(error));
    page.on("response", (response) => {
      if (/\.wasm|assets\/index-/.test(response.url()))
        assets.add(response.url().split("/").pop());
    });

    await page.goto("https://titonax.github.io/UEFI-Editor-GPT/");
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

    for (const file of ["baseline.bin", "output.bin", "legacy.bin"]) {
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
      assert.equal(reopenedSuppression.start, reopenedSuppression.end);
      assert.equal(question(reopened, "System Language").accessLevel, "00");
      assert.deepEqual(
        reopened.rootVisibility.entries.map((entry) => entry.value),
        [1, 1, 1, 1, 1, 1, 1, 1],
      );
      assert.equal(await outputButton.isDisabled(), true);
      console.log("INDEPENDENT_FOUR_EDIT_REREAD", file);
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
    console.log("ASSETS", [...assets]);
  } finally {
    await browser?.close();
    fs.rmSync(work, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
