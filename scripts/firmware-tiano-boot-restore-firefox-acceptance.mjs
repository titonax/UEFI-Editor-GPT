// Opt-in deployed Firefox acceptance for exact Tiano Hide/Show root restoration output.
// Firmware and editor JSON remain local; public CI never supplies private input.
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

const sessionImportVersion = process.env.FIRMWARE_BROWSER_SESSION_VERSION || "2";
assert(
  ["1", "2"].includes(sessionImportVersion),
  "Session import version must be 1 or 2.",
);
console.log("SESSION_IMPORT_VERSION", sessionImportVersion);

const sourcePath = process.env.FIRMWARE_ACCEPTANCE_IMAGE;
assert(sourcePath, "Set FIRMWARE_ACCEPTANCE_IMAGE to the accepted private source.");
const sourceBytes = fs.readFileSync(sourcePath);
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
assert.equal(sourceBytes.length, 8388608);
assert.equal(
  sha256(sourceBytes),
  "297390ca838c455791a5bf3a3f0001fbf36a8cb31be362ea2123b8df84dfffe8",
);

const expectedOutputSha =
  "264f90a0934848916bdc3e123564ce5c67c068faa6c48ee03e756f7c21f3aaae";
const work = fs.mkdtempSync(path.join(os.tmpdir(), "uefi-tiano-boot-restore-firefox-"));
fs.writeFileSync(path.join(work, "source.bin"), sourceBytes);

async function waitForDisabled(locator, expected, timeout = 60000) {
  const started = Date.now();
  while ((await locator.isDisabled()) !== expected) {
    if (Date.now() - started > timeout)
      throw new Error(`Control did not become ${expected ? "disabled" : "enabled"}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function waitForOutput(page) {
  const downloadButton = page.getByRole("button", {
    name: "Modified firmware image",
    exact: true,
  });
  const started = Date.now();
  while (await downloadButton.isDisabled()) {
    const body = await page.locator("body").innerText();
    if (body.includes("Output check failed:"))
      throw new Error(
        body.slice(
          body.indexOf("Output check failed:"),
          body.indexOf("Output check failed:") + 500,
        ),
      );
    if (Date.now() - started > 900000)
      throw new Error("Output check did not finish within 15 minutes");
    await page.waitForTimeout(1000);
  }
  return downloadButton;
}

function verifyOutput(destination, mode = "full") {
  assert(["full", "restored"].includes(mode));
  const output = fs.readFileSync(destination);
  assert.equal(output.length, sourceBytes.length);
  assert.equal(
    sha256(output),
    mode === "full"
      ? expectedOutputSha
      : "d9c22589b68884e973af22f87f718b7fc9fb130bfbdcca3871a55c12d294f3be",
  );
  let changed = 0;
  let outsideOwners = 0;
  let outsideBios = 0;
  for (let index = 0; index < output.length; index++) {
    if (output[index] === sourceBytes[index]) continue;
    changed += 1;
    const inFirstOwner = index >= 3239384 && index < 3419918;
    const inSecondOwner = index >= 4612464 && index < 4781106;
    if (!inFirstOwner && !inSecondOwner) outsideOwners += 1;
    if (index < 1572864) outsideBios += 1;
  }
  assert.equal(changed, mode === "full" ? 140913 : 49938);
  assert.equal(outsideOwners, 0);
  assert.equal(outsideBios, 0);
  return output;
}

async function downloadVerifiedOutput(page, destination, mode = "full") {
  await page
    .getByRole("button", { name: "Check firmware output", exact: true })
    .click();
  const button = await waitForOutput(page);
  const downloadPromise = page.waitForEvent("download", (download) =>
    download.suggestedFilename().endsWith(".bin"),
  );
  await button.click();
  await (await downloadPromise).saveAs(destination);
  const output = verifyOutput(destination, mode);
  await verifyByteComparisonReport(page, output, mode);
  return output;
}

async function verifyByteComparisonReport(page, output, mode) {
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
  assert.equal(changed, mode === "full" ? 140913 : 49938);
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
  console.log("BYTE_REPORT_EXACT_DOWNLOAD_SCAN", {
    mode,
    changed,
    unchanged: output.length - changed,
    rangeCount,
    displayedRanges: rows.length,
    sampleLimit: 16,
  });
}

async function openSource(page, source) {
  await page.locator("input[type=file]").first().setInputFiles(source);
  await page
    .getByRole("button", {
      name: "Start HII analysis",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Change queue (0)", exact: true })
    .waitFor({ timeout: 240000 });
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
    await openSource(page, path.join(work, "source.bin"));
    console.log("OPENED", await browser.version(), [...assets]);

    const moves = page.getByRole("button", {
      name: "Move DRAM Timing Control",
      exact: true,
    });
    assert.equal(await moves.count(), 1);
    await moves.click();
    const destination = page.getByPlaceholder("Choose the new parent menu");
    await destination.fill("CPU Power Management");
    await page
      .getByText(/^Safe · CPU Power Management ·/)
      .last()
      .click();
    await page
      .getByRole("dialog", { name: "Move HII menu", exact: true })
      .getByRole("button", { name: "Move menu", exact: true })
      .click();
    await page.getByRole("button").filter({ hasText: /^Main/ }).first().click();
    const security = page.locator("tr").filter({ hasText: "Security" }).first();
    const flags = security.locator("input").first();
    assert.equal(await flags.inputValue(), "01");
    await flags.fill("00");
    await flags.press("Tab");
    const editorDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "data.json", exact: true }).nth(1).click();
    const editorFile = path.join(work, "editor.json");
    await (await editorDownload).saveAs(editorFile);
    const editor = JSON.parse(fs.readFileSync(editorFile, "utf8"));
    const condition = editor.suppressions.find(
      (item) => item.offset.toLowerCase() === "0x8b359",
    );
    assert(condition);
    assert.equal(condition.active, true);
    condition.active = false;
    fs.writeFileSync(editorFile, JSON.stringify(editor));
    await page
      .locator('input[type=file][accept=".json"]')
      .first()
      .setInputFiles(editorFile);
    await page.getByText("Top-level menu", { exact: true }).click();
    await page
      .getByRole("button", {
        name: "Desired root state for Boot: visible",
        exact: true,
      })
      .click();
    await page.getByRole("button", { name: "Change queue (4)", exact: true }).click();
    const queue = page.getByRole("dialog", { name: "Change queue", exact: true });

    const apply = queue.getByRole("button", { name: "Apply selected", exact: true });
    const check = page.getByRole("button", {
      name: "Check firmware output",
      exact: true,
    });
    const output = page.getByRole("button", {
      name: "Modified firmware image",
      exact: true,
    });
    const details = page.getByRole("button", { name: "Output details", exact: true });
    const comparison = queue.getByRole("button", {
      name: /^Original \/ selected plan/,
    });
    const titles = [
      "Move menu DRAM Timing Control",
      "Set access level for Security",
      "Show 1 suppressed item(s)",
      "Hide root menu Boot",
    ];
    const selected = (title) =>
      queue.getByRole("checkbox", { name: "Select " + title, exact: true });
    async function order() {
      await selected(titles[0]).waitFor({ state: "visible" });
      return queue
        .getByRole("checkbox")
        .evaluateAll((items) =>
          items.map((item) => item.getAttribute("aria-label").replace(/^Select /, "")),
        );
    }
    async function invalidated() {
      await waitForDisabled(output, true);
      assert.equal(await check.isDisabled(), true);
      assert.equal(await details.isDisabled(), true);
    }
    assert.deepEqual(await order(), titles);
    await apply.click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    await downloadVerifiedOutput(page, path.join(work, "original-order.bin"));
    console.log("ORIGINAL_ORDER_OUTPUT_VERIFIED");
    await page.getByRole("button", { name: "Change queue (4)", exact: true }).click();
    await comparison.click();
    assert.equal(await comparison.getAttribute("aria-expanded"), "true");
    assert.equal(await output.isDisabled(), false);
    await comparison.click();
    assert.equal(await output.isDisabled(), false);
    console.log("READ_ONLY_COMPARISON_PRESERVED_READY_OUTPUT");

    await queue.getByRole("button", { name: "Close", exact: true }).click();
    await page
      .getByRole("button", { name: "Desired root state for Boot: hidden", exact: true })
      .click();
    await invalidated();
    await page.getByRole("button", { name: "Change queue (5)", exact: true }).click();
    assert.deepEqual(await order(), [...titles, "Show root menu Boot"]);
    assert.match(await queue.innerText(), /5 SELECTED/);
    await selected(titles[3]).uncheck();
    assert.equal(await apply.isDisabled(), true);
    assert.match(
      await queue.innerText(),
      /depends on a removed, paused or reordered operation/,
    );
    assert.match(await comparison.innerText(), /unavailable/);
    await invalidated();
    await selected(titles[3]).check();
    assert.equal(await apply.isDisabled(), false);
    await invalidated();
    await apply.click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    await downloadVerifiedOutput(page, path.join(work, "restored.bin"), "restored");
    console.log("FIVE_ENTRY_HIDE_SHOW_RESTORED_KNOWN_ENGINE_SPI");

    await page.getByRole("button", { name: "Change queue (5)", exact: true }).click();
    await comparison.click();
    assert.equal(await output.isDisabled(), false);
    await comparison.click();
    const fiveTitles = [...titles, "Show root menu Boot"];
    async function saveSession(file) {
      const download = page.waitForEvent(
        "download",
        (item) => item.suggestedFilename() === "firmware-session.json",
      );
      await queue
        .getByRole("button", { name: "Save queue session", exact: true })
        .click();
      await (await download).saveAs(file);
      return JSON.parse(fs.readFileSync(file, "utf8"));
    }
    async function loadSession(file, session) {
      // Only the legacy representation changes; expected exports remain strict v2.
      assert.equal(session.version, 2);
      assert.equal(session.kind, "hii-menu-actions");
      fs.writeFileSync(
        file,
        JSON.stringify({ ...session, version: Number(sessionImportVersion) }),
      );
      await queue.getByLabel("Load queue session file").setInputFiles(file);
    }
    async function assertFiveSelection(lastEnabled) {
      assert.deepEqual(await order(), fiveTitles);
      for (const title of titles) assert.equal(await selected(title).isChecked(), true);
      assert.equal(await selected(fiveTitles[4]).isChecked(), lastEnabled);
      assert.match(await queue.innerText(), lastEnabled ? /5 SELECTED/ : /4 SELECTED/);
    }
    async function waitFiveSelection(lastEnabled) {
      await page.waitForFunction((enabled) => {
        const boxes = [
          ...document.querySelectorAll('[role="dialog"] input[type="checkbox"]'),
        ];
        return (
          boxes.length === 5 &&
          boxes.every((box, index) => box.checked === (index < 4 || enabled))
        );
      }, lastEnabled);
      await assertFiveSelection(lastEnabled);
    }
    const fullSessionFile = path.join(work, "dependent-full-session.json");
    const fullSession = await saveSession(fullSessionFile);
    assert.deepEqual(Object.keys(fullSession).sort(), [
      "format",
      "kind",
      "operations",
      "source",
      "version",
    ]);
    assert.equal(fullSession.format, "uefi-editor-queue-session");
    assert.equal(fullSession.kind, "hii-menu-actions");
    assert.equal(fullSession.version, 2);
    assert.deepEqual(Object.keys(fullSession.source).sort(), [
      "contextSha256",
      "sha256",
      "size",
    ]);
    assert.equal(fullSession.source.sha256, sha256(sourceBytes));
    assert.equal(fullSession.source.size, sourceBytes.length);
    assert.match(fullSession.source.contextSha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(fullSession.operations, [
      {
        action: "move-ref",
        sourceFormIndex: 3,
        referenceChildIndex: 49,
        destinationFormIndex: 5,
        enabled: true,
      },
      {
        action: "ami-values",
        changes: [{ formIndex: 0, childIndex: 1, field: "accessLevel", value: "00" }],
        enabled: true,
      },
      {
        action: "suppressions",
        changes: [{ conditionIndex: 5, active: false }],
        enabled: true,
      },
      {
        action: "ami-roots",
        changes: [{ rootIndex: 4, visible: false }],
        enabled: true,
      },
      {
        action: "ami-roots",
        changes: [{ rootIndex: 4, visible: true }],
        enabled: true,
      },
    ]);
    assert.doesNotMatch(
      JSON.stringify(fullSession),
      /patches|expected|replacement|ifrBinary|history|applied|fileName|offset|source\.bin/,
    );
    assert.equal(await output.isDisabled(), false);
    await queue.getByRole("button", { name: "Clear queue", exact: true }).click();
    assert.match(await queue.innerText(), /The queue is empty/);
    await invalidated();
    await loadSession(fullSessionFile, fullSession);
    await selected(fiveTitles[4]).waitFor({ state: "visible" });
    await waitForDisabled(apply, false);
    await assertFiveSelection(true);
    await invalidated();
    assert.deepEqual(
      await saveSession(path.join(work, "dependent-reexport.json")),
      fullSession,
    );
    await apply.click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    await downloadVerifiedOutput(
      page,
      path.join(work, "session-restored.bin"),
      "restored",
    );
    assert.deepEqual(
      fs.readFileSync(path.join(work, "session-restored.bin")),
      fs.readFileSync(path.join(work, "restored.bin")),
    );
    console.log(
      "DEPENDENT_HIDE_SHOW_ROUND_TRIP_EXACT_RESTORED_SPI",
      sessionImportVersion,
    );

    await page.getByRole("button", { name: "Change queue (5)", exact: true }).click();
    for (const restoreEnabled of [true, false]) {
      const invalidSession = structuredClone(fullSession);
      invalidSession.operations[3].enabled = false;
      invalidSession.operations[4].enabled = restoreEnabled;
      const invalidFile = path.join(work, `missing-hide-${restoreEnabled}.json`);
      await loadSession(invalidFile, invalidSession);
      const rejection = queue.getByRole("alert");
      await rejection.waitFor();
      assert.match(
        await rejection.innerText(),
        /contains a menu action with no change/,
      );
      await assertFiveSelection(true);
      assert.equal(await output.isDisabled(), false);
      assert.equal(await details.isDisabled(), false);
      assert.equal(await check.isDisabled(), false);
      console.log("MISSING_HIDE_REJECTED_ATOMICALLY_RESTORE_ENABLED", restoreEnabled);
      if (restoreEnabled) {
        assert.deepEqual(
          await saveSession(path.join(work, "after-missing-hide.json")),
          fullSession,
        );
        assert.equal(await queue.getByRole("alert").count(), 0);
      }
    }
    const pausedSession = structuredClone(fullSession);
    pausedSession.operations[4].enabled = false;
    const pausedFile = path.join(work, "dependent-show-paused.json");
    await loadSession(pausedFile, pausedSession);
    // Apply was already enabled: observe the actual selected projection instead.
    await waitFiveSelection(false);
    assert.equal(await queue.getByRole("alert").count(), 0);
    await invalidated();
    assert.deepEqual(
      await saveSession(path.join(work, "dependent-paused-reexport.json")),
      pausedSession,
    );
    const undo = queue.getByRole("button", { name: "Undo queue change", exact: true });
    const redo = queue.getByRole("button", { name: "Redo queue change", exact: true });
    await undo.click();
    await waitFiveSelection(true);
    await invalidated();
    assert.equal(await apply.isDisabled(), false);
    assert.deepEqual(
      await saveSession(path.join(work, "dependent-history-undo.json")),
      fullSession,
    );
    await redo.click();
    await waitFiveSelection(false);
    await invalidated();
    assert.deepEqual(
      await saveSession(path.join(work, "dependent-history-redo.json")),
      pausedSession,
    );
    console.log("DEPENDENT_SESSION_LOAD_SINGLE_UNDO_REDO_EXACT_METADATA_NO_OUTPUT");
    await apply.click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    await downloadVerifiedOutput(page, path.join(work, "session-show-paused.bin"));
    assert.deepEqual(
      fs.readFileSync(path.join(work, "session-show-paused.bin")),
      fs.readFileSync(path.join(work, "original-order.bin")),
    );
    console.log("DEPENDENT_SHOW_PAUSED_VALID_SESSION_EXACT_HIDDEN_BOOT_SPI");
    await page.getByRole("button", { name: "Change queue (5)", exact: true }).click();
    await undo.click();
    await waitFiveSelection(true);
    await invalidated();
    assert.equal(await redo.isDisabled(), false);
    await apply.click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    await downloadVerifiedOutput(
      page,
      path.join(work, "history-undo-restored.bin"),
      "restored",
    );
    assert.deepEqual(
      fs.readFileSync(path.join(work, "history-undo-restored.bin")),
      fs.readFileSync(path.join(work, "restored.bin")),
    );
    console.log(
      "DEPENDENT_SESSION_UNDO_FROM_READY_HIDDEN_SPI_FRESH_RESTORED_IDENTICAL",
    );
    await page.getByRole("button", { name: "Change queue (5)", exact: true }).click();
    assert.equal(await redo.isDisabled(), false);
    await redo.click();
    await waitFiveSelection(false);
    await invalidated();
    assert.equal(await redo.isDisabled(), true);
    await apply.click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    await downloadVerifiedOutput(page, path.join(work, "history-redo-hidden.bin"));
    assert.deepEqual(
      fs.readFileSync(path.join(work, "history-redo-hidden.bin")),
      fs.readFileSync(path.join(work, "session-show-paused.bin")),
    );
    console.log(
      "DEPENDENT_SESSION_REDO_FROM_READY_RESTORED_SPI_FRESH_HIDDEN_IDENTICAL",
    );
    await page.getByRole("button", { name: "Change queue (5)", exact: true }).click();
    await selected(fiveTitles[4]).check();
    await assertFiveSelection(true);
    await invalidated();
    await apply.click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    await downloadVerifiedOutput(
      page,
      path.join(work, "session-show-reselected.bin"),
      "restored",
    );
    assert.deepEqual(
      fs.readFileSync(path.join(work, "session-show-reselected.bin")),
      fs.readFileSync(path.join(work, "restored.bin")),
    );
    console.log("DEPENDENT_SHOW_RESELECTED_FRESH_RESTORED_SPI_IDENTICAL");
    await page.getByRole("button", { name: "Change queue (5)", exact: true }).click();
    for (const restoreEnabled of [true, false]) {
      const reordered = structuredClone(fullSession);
      reordered.operations[4].enabled = restoreEnabled;
      [reordered.operations[3], reordered.operations[4]] = [
        reordered.operations[4],
        reordered.operations[3],
      ];
      const file = path.join(work, `show-before-hide-${restoreEnabled}.json`);
      await loadSession(file, reordered);
      const rejection = queue.getByRole("alert");
      await rejection.waitFor();
      assert.match(
        await rejection.innerText(),
        /contains a menu action with no change/,
      );
      await assertFiveSelection(true);
      assert.equal(await output.isDisabled(), false);
      assert.equal(await check.isDisabled(), false);
      assert.equal(await details.isDisabled(), false);
      assert.deepEqual(
        await saveSession(path.join(work, `after-reorder-${restoreEnabled}.json`)),
        fullSession,
      );
      // Each rejection must be observed afresh, not confused with a prior alert.
      assert.equal(await queue.getByRole("alert").count(), 0);
      console.log("SHOW_BEFORE_HIDE_REJECTED_ATOMICALLY_ENABLED", restoreEnabled);
    }
    const permutation = [0, 1, 3, 4, 2];
    const reordered = structuredClone(fullSession);
    reordered.operations = permutation.map((index) => fullSession.operations[index]);
    const reorderedFile = path.join(work, "dependent-valid-order.json");
    await loadSession(reorderedFile, reordered);
    const reorderedTitles = permutation.map((index) => fiveTitles[index]);
    await page.waitForFunction((expected) => {
      const boxes = [
        ...document.querySelectorAll('[role="dialog"] input[type="checkbox"]'),
      ];
      return (
        boxes.length === expected.length &&
        boxes.every(
          (box, index) =>
            box.checked &&
            box.getAttribute("aria-label") === "Select " + expected[index],
        )
      );
    }, reorderedTitles);
    assert.deepEqual(await order(), reorderedTitles);
    assert.equal(await queue.getByRole("alert").count(), 0);
    assert.equal(await apply.isDisabled(), false);
    await invalidated();
    assert.deepEqual(
      await saveSession(path.join(work, "dependent-valid-order-reexport.json")),
      reordered,
    );
    await apply.click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    await downloadVerifiedOutput(
      page,
      path.join(work, "session-reordered-restored.bin"),
      "restored",
    );
    assert.deepEqual(
      fs.readFileSync(path.join(work, "session-reordered-restored.bin")),
      fs.readFileSync(path.join(work, "restored.bin")),
    );
    console.log("DEPENDENT_VALID_SESSION_ORDER_EXACT_REEXPORT_FRESH_RESTORED_SPI");
    await page.getByRole("button", { name: "Change queue (5)", exact: true }).click();
    await queue
      .getByRole("button", {
        name: "Remove Show root menu Boot from change queue",
        exact: true,
      })
      .click();
    await invalidated();
    await queue
      .getByRole("button", {
        name: "Remove Hide root menu Boot from change queue",
        exact: true,
      })
      .click();
    await invalidated();
    assert.deepEqual(await order(), titles.slice(0, 3));
    assert.match(await queue.innerText(), /3 SELECTED/);
    assert.equal(await apply.isDisabled(), false);
    await apply.click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    await downloadVerifiedOutput(page, path.join(work, "net-three.bin"), "restored");
    assert.deepEqual(
      fs.readFileSync(path.join(work, "restored.bin")),
      fs.readFileSync(path.join(work, "net-three.bin")),
    );
    console.log("ROOT_PAIR_REMOVED_FRESH_THREE_EDIT_SPI_IDENTICAL");

    for (const [file, mode] of [
      ["restored.bin", "restored"],
      ["net-three.bin", "net-three"],
      ["session-restored.bin", "session-restored"],
      ["session-show-paused.bin", "full"],
      ["session-show-reselected.bin", "reselected"],
      ["history-undo-restored.bin", "history-undo"],
      ["history-redo-hidden.bin", "full"],
      ["session-reordered-restored.bin", "session-reordered"],
    ]) {
      await page
        .getByRole("button", { name: "Load another firmware", exact: true })
        .click();
      await openSource(page, path.join(work, file));
      const readDownload = page.waitForEvent("download", (download) =>
        download.suggestedFilename().endsWith(".json"),
      );
      await page.getByRole("button", { name: "data.json", exact: true }).nth(1).click();
      const readFile = path.join(work, mode + ".json");
      await (await readDownload).saveAs(readFile);
      const reopened = JSON.parse(fs.readFileSync(readFile, "utf8"));
      assert.equal(reopened.forms.length, 70);
      assert.equal(reopened.forms[0].children[1].accessLevel, "00");
      assert.equal(reopened.rootVisibility.entries[4].value, mode === "full" ? 0 : 1);
      const flatten = (items) =>
        items.flatMap((item) => [item, ...flatten(item.children || [])]);
      const moved = (index) =>
        flatten(reopened.forms[index].children).filter(
          (item) => item.type === "Ref" && item.name === "DRAM Timing Control",
        );
      assert.equal(moved(3).length, 0);
      assert.equal(moved(5).length, 1);
      const suppression = reopened.suppressions.find(
        (item) => item.offset.toLowerCase() === "0x8b359",
      );
      assert(suppression);
      assert.equal(suppression.start, suppression.end);
      assert.deepEqual(
        reopened.rootVisibility.entries.map((item) => item.value),
        mode === "full" ? [1, 1, 1, 1, 0, 1, 1] : Array(7).fill(1),
      );
      assert.equal(await output.isDisabled(), true);
      assert.equal(await details.isDisabled(), true);
      console.log(
        "INDEPENDENT_REANALYSIS_" +
          mode.toUpperCase() +
          "_EXACT_THREE_EDITS_AND_REQUESTED_ROOTS",
      );
    }
    assert.equal(pageErrors.length, 0, "No application page errors are allowed.");
    console.log("ASSETS", [...assets]);
  } finally {
    await browser?.close();
    fs.rmSync(work, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
