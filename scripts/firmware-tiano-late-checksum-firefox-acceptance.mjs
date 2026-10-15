// Opt-in deployed Firefox acceptance for exact Tiano late native checksum rejection.
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
assert.equal(sourceBytes.length, 8388608);
assert.equal(
  sha256(sourceBytes),
  "297390ca838c455791a5bf3a3f0001fbf36a8cb31be362ea2123b8df84dfffe8",
);

const expectedOutputSha =
  "264f90a0934848916bdc3e123564ce5c67c068faa6c48ee03e756f7c21f3aaae";
const work = fs.mkdtempSync(
  path.join(os.tmpdir(), "uefi-tiano-late-checksum-firefox-"),
);
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
    const inFirstOwner = index >= 3239384 && index < 3419918;
    const inSecondOwner = index >= 4612464 && index < 4781106;
    if (!inFirstOwner && !inSecondOwner) outsideOwners += 1;
    if (index < 1572864) outsideBios += 1;
  }
  assert.equal(changed, 140913);
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
  return verifyOutput(destination);
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

async function stageFour(page) {
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
  const editorDownload = page.waitForEvent("download", (download) =>
    download.suggestedFilename().endsWith(".json"),
  );
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
  const text = await queue.innerText();
  for (const title of [
    "Move menu DRAM Timing Control",
    "Set access level for Security",
    "Show 1 suppressed item(s)",
    "Hide root menu Boot",
  ])
    assert(text.includes(title));
  await queue.getByRole("button", { name: "Apply selected", exact: true }).click();
  await queue.getByRole("button", { name: "Close", exact: true }).click();
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

    let navigations = 0;
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) navigations += 1;
    });
    await page.goto(
      process.env.FIRMWARE_BROWSER_URL || "https://titonax.github.io/UEFI-Editor-GPT/",
    );
    const navigationBaseline = navigations;
    const documentOrigin = await page.evaluate(() => performance.timeOrigin);
    const check = page.getByRole("button", {
      name: "Check firmware output",
      exact: true,
    });
    const output = page.getByRole("button", {
      name: "Modified firmware image",
      exact: true,
    });
    const details = page.getByRole("button", { name: "Output details", exact: true });
    const close = page.getByRole("button", {
      name: "Load another firmware",
      exact: true,
    });
    await openSource(page, path.join(work, "source.bin"));
    console.log("OPENED", await browser.version(), [...assets]);
    const baselineJson = page.waitForEvent("download", (download) =>
      download.suggestedFilename().endsWith(".json"),
    );
    await page.getByRole("button", { name: "data.json", exact: true }).nth(1).click();
    const pendingFile = path.join(work, "pending-import.json");
    await (await baselineJson).saveAs(pendingFile);
    const pendingData = JSON.parse(fs.readFileSync(pendingFile, "utf8"));
    pendingData.forms[0].children[1].accessLevel = "05";
    fs.writeFileSync(pendingFile, JSON.stringify(pendingData));
    await page
      .locator('input[type=file][accept=".json"]')
      .first()
      .setInputFiles(pendingFile);
    await page.getByRole("button", { name: "Change queue (1)", exact: true }).waitFor();
    const positiveDownload = page.waitForEvent("download", (download) =>
      download.suggestedFilename().endsWith(".json"),
    );
    await page.getByRole("button", { name: "data.json", exact: true }).nth(1).click();
    const positiveFile = path.join(work, "positive.json");
    await (await positiveDownload).saveAs(positiveFile);
    assert.equal(
      JSON.parse(fs.readFileSync(positiveFile, "utf8")).forms[0].children[1]
        .accessLevel,
      "05",
    );
    await page.getByRole("button", { name: "Change queue (1)", exact: true }).click();
    const positiveQueue = page.getByRole("dialog", {
      name: "Change queue",
      exact: true,
    });
    await positiveQueue
      .getByRole("button", { name: "Clear queue", exact: true })
      .click();
    await positiveQueue.getByRole("button", { name: "Close", exact: true }).click();
    console.log("EXACT_PENDING_JSON_ACCEPTED_BY_CURRENT_IMPORT_POSITIVE_CONTROL");

    await stageFour(page);
    const before = await downloadVerifiedOutput(page, path.join(work, "before.bin"));
    assert.equal(await details.isDisabled(), false);
    console.log("BASELINE_VERIFIED");
    const offsets = [
      ...pendingData.menu.map((item) => item.offset ?? ""),
      ...pendingData.forms.flatMap((form) =>
        form.children.map((child) => JSON.stringify(child.offsets)),
      ),
      ...pendingData.suppressions.map((item) => item.offset + item.start + item.end),
    ].join("");
    assert.equal(sha256(Buffer.from(offsets)), pendingData.hashes.offsetChecksum);
    await page.evaluate((expectedOffsets) => {
      const subtle = crypto.subtle;
      const original = subtle.digest;
      let deliver;
      const gate = new Promise((resolve) => {
        deliver = resolve;
      });
      const state = {
        calls: 0,
        rejected: 0,
        delivered: 0,
        held: false,
        failureName: null,
      };
      subtle.digest = function (...args) {
        const [algorithm, input] = args;
        const bytes = ArrayBuffer.isView(input)
          ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
          : new Uint8Array(input);
        const matches =
          algorithm === "SHA-256" &&
          new TextDecoder().decode(bytes) === expectedOffsets;
        if (!matches || state.calls > 0) return original.apply(this, args);
        state.calls += 1;
        // Fault injection: an unsupported algorithm makes the real native API reject.
        return original.call(this, "UEFI-acceptance-unsupported-digest", input).then(
          () => {
            throw new Error("Expected a native unsupported-algorithm rejection");
          },
          async (error) => {
            state.rejected += 1;
            state.failureName = error.name;
            state.held = true;
            await gate;
            state.held = false;
            state.delivered += 1;
            throw error;
          },
        );
      };
      window.__pendingImportProbe = {
        state,
        release: () => deliver(),
        restore: () => {
          subtle.digest = original;
        },
      };
    }, offsets);
    await page
      .locator('input[type=file][accept=".json"]')
      .first()
      .setInputFiles(pendingFile);
    await page.waitForFunction(() => window.__pendingImportProbe.state.held);
    assert.deepEqual(await page.evaluate(() => window.__pendingImportProbe.state), {
      calls: 1,
      rejected: 1,
      failureName: "NotSupportedError",
      delivered: 0,
      held: true,
    });
    console.log("OLD_IMPORT_INJECTED_NATIVE_CHECKSUM_REJECTION_HELD");

    // No source replacement or newer JSON import: exercise queue revision alone.
    assert.equal(navigations, navigationBaseline);
    assert.equal(await page.evaluate(() => performance.timeOrigin), documentOrigin);
    await page.getByRole("button", { name: "Change queue (4)", exact: true }).click();
    const restoredQueue = page.getByRole("dialog", {
      name: "Change queue",
      exact: true,
    });
    await restoredQueue
      .getByRole("button", { name: "Clear queue", exact: true })
      .click();
    await page.getByRole("button", { name: "Change queue (0)", exact: true }).waitFor();
    await restoredQueue
      .getByRole("button", { name: "Undo queue change", exact: true })
      .click();
    await page.getByRole("button", { name: "Change queue (4)", exact: true }).waitFor();
    await restoredQueue
      .getByRole("button", { name: "Apply selected", exact: true })
      .click();
    await restoredQueue.getByRole("button", { name: "Close", exact: true }).click();
    assert.equal(await output.isDisabled(), true);
    assert.equal(await details.isDisabled(), true);
    assert.equal(await check.isDisabled(), false);
    const after = await downloadVerifiedOutput(page, path.join(work, "after.bin"));
    assert.deepEqual(after, before);
    console.log("FRESH_BUILD_AFTER_QUEUE_MUTATION_IDENTICAL_VERIFIED");
    assert.deepEqual(await page.evaluate(() => window.__pendingImportProbe.state), {
      calls: 1,
      rejected: 1,
      failureName: "NotSupportedError",
      delivered: 0,
      held: true,
    });
    await page.evaluate(async () => {
      window.__pendingImportProbe.release();
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    });
    assert.deepEqual(await page.evaluate(() => window.__pendingImportProbe.state), {
      calls: 1,
      rejected: 1,
      failureName: "NotSupportedError",
      delivered: 1,
      held: false,
    });
    assert.equal(await output.isDisabled(), false);
    assert.equal(await details.isDisabled(), false);
    assert.equal(
      await page.getByRole("button", { name: "Change queue (4)", exact: true }).count(),
      1,
    );
    assert.equal(
      (await page.locator("body").innerText()).includes("Output check failed:"),
      false,
    );
    assert.equal(
      await page.getByText("Editor import failed", { exact: true }).count(),
      0,
    );
    const currentDownload = page.waitForEvent("download", (download) =>
      download.suggestedFilename().endsWith(".json"),
    );
    await page.getByRole("button", { name: "data.json", exact: true }).nth(1).click();
    const currentFile = path.join(work, "current.json");
    await (await currentDownload).saveAs(currentFile);
    assert.equal(
      JSON.parse(fs.readFileSync(currentFile, "utf8")).forms[0].children[1].accessLevel,
      "00",
    );
    const cachedDownload = page.waitForEvent("download", (download) =>
      download.suggestedFilename().endsWith(".bin"),
    );
    await output.click();
    const cachedFile = path.join(work, "cached-after-delivery.bin");
    await (await cachedDownload).saveAs(cachedFile);
    assert.deepEqual(verifyOutput(cachedFile), after);
    await page.evaluate(() => window.__pendingImportProbe.restore());
    console.log("STALE_REJECTION_IGNORED_THREE_EXACT_SPI_DOWNLOADS");
    // Explicitly deselect the stale chooser value before reselecting the same file.
    // Cancelled imports deliberately do not reset a newer chooser.
    await page.locator('input[type=file][accept=".json"]').first().setInputFiles([]);
    // Current-request positive control: the same native failure must be visible.
    await page.evaluate((expectedOffsets) => {
      const subtle = crypto.subtle;
      const original = subtle.digest;
      window.__currentChecksumFailure = { calls: 0, rejected: 0, name: null };
      subtle.digest = function (...args) {
        const [algorithm, input] = args;
        const bytes = ArrayBuffer.isView(input)
          ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
          : new Uint8Array(input);
        if (
          algorithm !== "SHA-256" ||
          new TextDecoder().decode(bytes) !== expectedOffsets
        )
          return original.apply(this, args);
        subtle.digest = original;
        window.__currentChecksumFailure.calls += 1;
        return original
          .call(this, "UEFI-acceptance-unsupported-digest", input)
          .catch((error) => {
            window.__currentChecksumFailure.rejected += 1;
            window.__currentChecksumFailure.name = error.name;
            throw error;
          });
      };
    }, offsets);
    await page
      .locator('input[type=file][accept=".json"]')
      .first()
      .setInputFiles(pendingFile);
    await page.waitForFunction(() => window.__currentChecksumFailure.rejected === 1);
    await page.getByText("Editor import failed", { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.__currentChecksumFailure), {
      calls: 1,
      rejected: 1,
      name: "NotSupportedError",
    });
    assert.equal(await output.isDisabled(), false);
    assert.equal(await details.isDisabled(), false);
    assert.equal(
      await page.getByRole("button", { name: "Change queue (4)", exact: true }).count(),
      1,
    );
    console.log("CURRENT_NATIVE_CHECKSUM_REJECTION_VISIBLE_IMPORT_REJECTED");
    // Retry normally: successful import clears the error and invalidates cached output.
    await page
      .locator('input[type=file][accept=".json"]')
      .first()
      .setInputFiles(pendingFile);
    await page.waitForFunction(
      () => !document.body.innerText.includes("Editor import failed"),
    );
    assert.equal(await output.isDisabled(), true);
    assert.equal(await details.isDisabled(), true);
    const retryDownload = page.waitForEvent("download", (download) =>
      download.suggestedFilename().endsWith(".json"),
    );
    await page.getByRole("button", { name: "data.json", exact: true }).nth(1).click();
    const retryFile = path.join(work, "retry.json");
    await (await retryDownload).saveAs(retryFile);
    assert.equal(
      JSON.parse(fs.readFileSync(retryFile, "utf8")).forms[0].children[1].accessLevel,
      "05",
    );
    console.log("CURRENT_IMPORT_RETRY_ACCEPTED_AND_INVALIDATED_OUTPUT");
    console.log(
      "OLD_NATIVE_CHECKSUM_REJECTION_DELIVERED_NEW_QUEUE_AND_VERIFIED_OUTPUT_UNCHANGED",
    );

    await close.click();
    await openSource(page, cachedFile);
    const readDownload = page.waitForEvent("download", (download) =>
      download.suggestedFilename().endsWith(".json"),
    );
    await page.getByRole("button", { name: "data.json", exact: true }).nth(1).click();
    await (await readDownload).saveAs(path.join(work, "reopened.json"));
    const reopened = JSON.parse(
      fs.readFileSync(path.join(work, "reopened.json"), "utf8"),
    );
    assert.equal(reopened.forms.length, 70);
    assert.equal(reopened.forms[0].children[1].accessLevel, "00");
    assert.equal(reopened.rootVisibility.entries[4].value, 0);
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

    assert.equal(await output.isDisabled(), true);
    assert.equal(await details.isDisabled(), true);
    assert.equal(navigations, navigationBaseline);
    assert.equal(await page.evaluate(() => performance.timeOrigin), documentOrigin);
    console.log("INDEPENDENT_OUTPUT_REANALYSIS_ALL_FOUR_EDITS_SAME_DOCUMENT");
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
