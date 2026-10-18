// Opt-in deployed Firefox acceptance for Phoenix queue Undo/Redo.
// Firmware and session JSON remain local; public CI never supplies private input.
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
assert.equal(sourceBytes.length, 1048576);
assert.equal(
  sha256(sourceBytes),
  "d34c9695d6d54595836212021797dd7557cabae0d25fd33cd0faa87c25640194",
);

const expectedOutputSha =
  "bbc4671779479575ec3fcb104e83e54242b09cb2e2da46655bc9d7d81b780134";
const work = fs.mkdtempSync(path.join(os.tmpdir(), "uefi-phoenix-history-firefox-"));
fs.writeFileSync(path.join(work, "source.bin"), sourceBytes);

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
          body.indexOf("Output check failed:") + 400,
        ),
      );
    if (Date.now() - started > 300000)
      throw new Error("Output check did not finish within 5 minutes");
    await page.waitForTimeout(500);
  }
  return downloadButton;
}

async function waitForDisabled(locator, expected) {
  const started = Date.now();
  while ((await locator.isDisabled()) !== expected) {
    if (Date.now() - started > 60000)
      throw new Error(`Control did not become ${expected ? "disabled" : "enabled"}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
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
  const output = fs.readFileSync(destination);
  assert.equal(output.length, sourceBytes.length);
  assert.equal(sha256(output), expectedOutputSha);
  let changed = 0;
  let outside = 0;
  for (let index = 0; index < output.length; index++) {
    if (output[index] === sourceBytes[index]) continue;
    changed += 1;
    if (index < 0x6ed30 || index >= 0x72068) outside += 1;
  }
  assert.equal(changed, 13032);
  assert.equal(outside, 0);
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
  assert.equal(changed, 13032);
  assert(rangeCount > 64, "This exact image must exercise omitted ranges.");
  assert(truncatedSample, "This exact image must exercise bounded byte samples.");
  await page.getByRole("button", { name: "Output details", exact: true }).click();
  const report = page.getByRole("dialog", {
    name: "Verified Phoenix output",
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
  assert(text.includes("LH5 payload: 13074 / 13112 bytes; 38 bytes remaining"));
  assert(text.includes("1 item(s) verified after reopening the complete image."));
  assert(text.includes("Changes confined to [0x6ED30, 0x72068)."));
  assert(text.includes("1035464 bytes outside this allocation preserved exactly."));
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
  console.log("PHOENIX_BYTE_REPORT_EXACT_DOWNLOAD_SCAN", {
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
    await page
      .getByRole("button", { name: "Start Phoenix Setup analysis", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Change queue (0)", exact: true })
      .waitFor({ timeout: 240000 });
    console.log("OPENED", await browser.version(), [...assets]);

    await page
      .getByRole("button")
      .filter({ hasText: /^Cache Ram/ })
      .first()
      .click();
    await page
      .getByRole("button", {
        name: "Queue Show for Cache Ram Phoenix item",
        exact: true,
      })
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
    assert.equal(await undo.isDisabled(), false);
    assert.equal(await redo.isDisabled(), true);
    await undo.click();
    assert.match(await queue.innerText(), /The queue is empty/);
    assert.equal(await apply.isDisabled(), true);
    assert.equal(await undo.isDisabled(), true);
    assert.equal(await redo.isDisabled(), false);
    await assertInvalidated();
    await redo.click();
    assert.match(await queue.innerText(), /SHOW[\s\S]*Cache Ram/);
    assert.equal(await apply.isDisabled(), false);
    await assertInvalidated();
    console.log("STAGING_UNDO_REDO_UNAPPLIED");

    await apply.click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    await downloadVerifiedOutput(page, path.join(work, "output-before.bin"));
    console.log("INITIAL_OUTPUT_VERIFIED");
    await page.getByRole("button", { name: "Change queue (1)", exact: true }).click();
    await queue.getByRole("button", { name: "Clear queue", exact: true }).click();
    await assertInvalidated();
    await undo.click();
    assert.match(await queue.innerText(), /SHOW[\s\S]*Cache Ram/);
    assert.equal(await apply.isDisabled(), false);
    await assertInvalidated();
    console.log("CLEAR_UNDO_IDENTICAL_QUEUE_OUTPUT_STILL_INVALID");
    await apply.click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    await downloadVerifiedOutput(page, path.join(work, "output-after.bin"));
    assert.deepEqual(
      fs.readFileSync(path.join(work, "output-after.bin")),
      fs.readFileSync(path.join(work, "output-before.bin")),
    );
    console.log("FRESH_CHECK_OUTPUT_IDENTICAL_AND_VERIFIED");

    await page.getByRole("button", { name: "Change queue (1)", exact: true }).click();
    await redo.click();
    assert.match(await queue.innerText(), /The queue is empty/);
    await assertInvalidated();
    await undo.click();
    assert.match(await queue.innerText(), /SHOW[\s\S]*Cache Ram/);
    await assertInvalidated();
    await queue.getByRole("button", { name: /^Remove .* from change queue$/ }).click();
    assert.equal(await redo.isDisabled(), true);
    await undo.click();
    assert.match(await queue.innerText(), /SHOW[\s\S]*Cache Ram/);
    await assertInvalidated();
    console.log("READY_OUTPUT_REDO_UNDO_INVALIDATED_NEW_MUTATION_DISCARDED_REDO");

    await page.reload();
    await page
      .locator("input[type=file]")
      .first()
      .setInputFiles(path.join(work, "source.bin"));
    await page
      .getByRole("button", { name: "Start Phoenix Setup analysis", exact: true })
      .click();
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
      await page
        .locator("input[type=file]")
        .first()
        .setInputFiles(path.join(work, file));
      await page
        .getByRole("button", { name: "Start Phoenix Setup analysis", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Change queue (0)", exact: true })
        .waitFor({ timeout: 240000 });
      await page
        .getByRole("button")
        .filter({ hasText: /^Cache Ram/ })
        .first()
        .click();
      assert.equal(
        await page
          .getByRole("button", {
            name: "Queue Show for Cache Ram Phoenix item",
            exact: true,
          })
          .isDisabled(),
        true,
      );
      await assertInvalidated();
      console.log("OUTPUT_REOPENED_CACHE_RAM_NO_LONGER_HIDE_GATED", file);
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
