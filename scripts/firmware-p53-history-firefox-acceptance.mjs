// Opt-in deployed Firefox acceptance for the exact P53 static Ref queue Undo/Redo.
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

const sourcePath = process.env.FIRMWARE_ACCEPTANCE_IMAGE;
assert(sourcePath, "Set FIRMWARE_ACCEPTANCE_IMAGE to the accepted private source.");
const sourceBytes = fs.readFileSync(sourcePath);
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
assert.equal(sourceBytes.length, 33554432);
assert.equal(
  sha256(sourceBytes),
  "68eba5b369baf36c879551c0482a6feea31d68082bc4dd0631bf9e4427a88a64",
);

const expectedOutputSha =
  "4c52549b9df88a7763eedf4fa0cf842909d800431b10a88c76d73c851792d10b";
const work = fs.mkdtempSync(path.join(os.tmpdir(), "uefi-p53-history-firefox-"));
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

function verifyOutput(destination) {
  const output = fs.readFileSync(destination);
  assert.equal(output.length, sourceBytes.length);
  assert.equal(sha256(output), expectedOutputSha);
  let changed = 0;
  let outsideOwners = 0;
  let outsideBios = 0;
  for (let index = 0; index < output.length; index++) {
    if (output[index] === sourceBytes[index]) continue;
    changed += 1;
    const inFirstOwner = index >= 13238344 && index < 17752012;
    const inSecondOwner = index >= 21495880 && index < 26009548;
    if (!inFirstOwner && !inSecondOwner) outsideOwners += 1;
    if (index < 10485760) outsideBios += 1;
  }
  assert.equal(changed, 8991518);
  assert.equal(outsideOwners, 0);
  assert.equal(outsideBios, 0);
  return output;
}

async function downloadVerifiedOutput(page, destination) {
  await page
    .getByRole("button", { name: "Check firmware output", exact: true })
    .click();
  const button = await waitForOutput(page);
  const downloadPromise = page.waitForEvent("download", (download) =>
    download.suggestedFilename().endsWith(".bin"),
  );
  await button.click();
  await (await downloadPromise).saveAs(destination);
  const bytes = verifyOutput(destination);
  await verifyByteComparisonReport(page, bytes);
  return bytes;
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
  assert.equal(changed, 8991518);
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
  assert(text.includes("10485760 bytes outside BIOS preserved exactly."));
  assert.match(text, /33554432 bytes, 8991518 changed bytes/);
  assert(text.includes("BIOS region: [0xA00000, 0x2000000)."));
  for (const [start, end] of [
    [13238344, 17752012],
    [21495880, 26009548],
  ])
    assert(text.includes(`[${hex(start)}, ${hex(end)})`));
  assert(text.includes("2 physical copy/copies verified."));
  for (const buffer of [2, 4])
    assert(text.includes(`${hex(4127440)} / buffer ${buffer}`));
  const compressionRows = await report
    .getByRole("table")
    .filter({
      has: page.getByRole("columnheader", { name: "Compression", exact: true }),
    })
    .locator("tbody tr")
    .evaluateAll((items) =>
      items.map((row) =>
        [...row.querySelectorAll("td")].map((cell) => cell.textContent.trim()),
      ),
    );
  assert.equal(compressionRows.length, 2);
  for (const row of compressionRows) {
    assert.equal(row[1], "lzma");
    assert.equal(row[2], "4513620");
    assert.equal(row[3], "4491300");
    assert.match(
      row[4],
      /^4513620 \((?:original payload only|terminal padding verified)\)$/,
    );
    assert.equal(row[5], "22320");
  }
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
  console.log("P53_BYTE_REPORT_EXACT_DOWNLOAD_SCAN", {
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
      name: "Start vendor-neutral HII analysis",
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
      name: "Move Debug Settings menu",
      exact: true,
    });
    assert.equal(await moves.count(), 1);
    await moves.click();
    const destination = page.getByPlaceholder("Choose the new parent menu");
    await destination.fill("PCI Subsystem Settings");
    await page
      .getByText(/^Safe · PCI Subsystem Settings ·/)
      .last()
      .click();
    await page
      .getByRole("dialog", { name: "Move HII menu", exact: true })
      .getByRole("button", { name: "Move menu", exact: true })
      .click();
    await page.getByRole("button", { name: "Change queue (1)", exact: true }).click();
    const queue = page.getByRole("dialog", { name: "Change queue", exact: true });

    const undo = queue.getByRole("button", { name: "Undo queue change", exact: true });
    const redo = queue.getByRole("button", { name: "Redo queue change", exact: true });
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
    async function assertInvalidated() {
      await waitForDisabled(output, true);
      assert.equal(await details.isDisabled(), true);
      assert.equal(await check.isDisabled(), true);
    }
    function verifyTitles(text) {
      assert.match(text, /1 SELECTED/);
      assert.match(text, /Move menu Debug Settings/);
    }
    verifyTitles(await queue.innerText());
    await undo.click();
    assert.match(await queue.innerText(), /The queue is empty/);
    await assertInvalidated();
    await redo.click();
    verifyTitles(await queue.innerText());
    await assertInvalidated();
    console.log("STAGING_UNDO_REDO_RESTORED_REF_OPERATION");
    await queue.getByRole("button", { name: "Clear queue", exact: true }).click();
    assert.match(await queue.innerText(), /The queue is empty/);
    await undo.click();
    verifyTitles(await queue.innerText());
    await assertInvalidated();
    console.log("UNAPPLIED_CLEAR_UNDO_RESTORED_REF_OPERATION");

    await apply.click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    await downloadVerifiedOutput(page, path.join(work, "output-before.bin"));
    console.log("INITIAL_OUTPUT_VERIFIED");
    await page.getByRole("button", { name: "Change queue (1)", exact: true }).click();
    await redo.click();
    assert.match(await queue.innerText(), /The queue is empty/);
    await assertInvalidated();
    await undo.click();
    verifyTitles(await queue.innerText());
    assert.equal(await apply.isDisabled(), false);
    await assertInvalidated();
    console.log("READY_REDO_UNDO_IDENTICAL_QUEUE_OUTPUT_STILL_INVALID");
    await apply.click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    await downloadVerifiedOutput(page, path.join(work, "output-after.bin"));
    assert.deepEqual(
      fs.readFileSync(path.join(work, "output-after.bin")),
      fs.readFileSync(path.join(work, "output-before.bin")),
    );
    console.log("FRESH_CHECK_OUTPUT_IDENTICAL_AND_VERIFIED");

    await page.getByRole("button", { name: "Change queue (1)", exact: true }).click();
    await queue.getByRole("button", { name: "Clear queue", exact: true }).click();
    await assertInvalidated();
    await undo.click();
    verifyTitles(await queue.innerText());
    await assertInvalidated();
    await queue
      .getByRole("button", { name: /^Remove .* from change queue$/ })
      .last()
      .click();
    assert.equal(await redo.isDisabled(), true);
    await undo.click();
    verifyTitles(await queue.innerText());
    await assertInvalidated();
    console.log("CLEAR_UNDO_INVALIDATED_NEW_MUTATION_DISCARDED_REDO");

    await page.reload();
    await openSource(page, path.join(work, "source.bin"));
    await page.getByRole("button", { name: "Change queue (0)", exact: true }).click();
    const fresh = page.getByRole("dialog", { name: "Change queue", exact: true });
    assert.equal(
      await fresh
        .getByRole("button", { name: "Undo queue change", exact: true })
        .isDisabled(),
      true,
    );
    assert.equal(
      await fresh
        .getByRole("button", { name: "Redo queue change", exact: true })
        .isDisabled(),
      true,
    );
    await assertInvalidated();
    console.log("PAGE_RELOAD_SAME_SOURCE_EMPTY_HISTORY");

    for (const file of ["output-before.bin", "output-after.bin"]) {
      await page.reload();
      await openSource(page, path.join(work, file));
      const movedRows = page.getByRole("row").filter({
        has: page.getByRole("button", {
          name: "Move Debug Settings menu",
          exact: true,
        }),
      });
      assert.equal(await movedRows.count(), 1);
      const cells = movedRows.getByRole("cell");
      assert.equal(await cells.nth(0).innerText(), "Debug Settings");
      assert.equal(await cells.nth(1).innerText(), "0x1006");
      assert.equal(
        await cells.nth(2).getByText("PCI Subsystem Settings", { exact: true }).count(),
        1,
      );
      assert.doesNotMatch(await cells.nth(2).innerText(), /Intel Advanced Menu/);
      assert.equal(await output.isDisabled(), true);
      console.log("OUTPUT_REOPENED_STATIC_REF_MOVED", file);
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
