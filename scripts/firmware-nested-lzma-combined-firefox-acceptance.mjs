// Opt-in deployed Firefox acceptance for the exact nested-LZMA four-operation queue.
// Firmware and exported editor JSON remain local; CI never supplies private input.
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
  path.join(os.tmpdir(), "uefi-nested-lzma-combined-firefox-"),
);
fs.writeFileSync(path.join(work, "source.bin"), sourceBytes);

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
    await queue.getByRole("button", { name: "Apply selected", exact: true }).click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();

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

    await page.getByRole("button", { name: "Output details", exact: true }).click();
    const report = page.getByRole("dialog");
    const reportText = await report.innerText();
    assert.match(reportText, /4194304 bytes, 850394 changed bytes/);
    assert.match(reportText, /1494108[\s\S]*1493440[\s\S]*668/);
    assert.match(reportText, /1572864 bytes outside BIOS preserved/);
    console.log("REPORT_SIZE_CHANGED_CAPACITY_MARGIN_SPI_VERIFIED");
    await page.keyboard.press("Escape");

    const imageDownload = page.waitForEvent("download", (download) =>
      download.suggestedFilename().endsWith(".bin"),
    );
    await outputButton.click();
    await (await imageDownload).saveAs(path.join(work, "output.bin"));
    const output = fs.readFileSync(path.join(work, "output.bin"));
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

    await page.reload();
    await page
      .locator("input[type=file]")
      .first()
      .setInputFiles(path.join(work, "output.bin"));
    await page.getByRole("button", { name: "Start HII analysis", exact: true }).click();
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
    assert.equal(pageErrors.length, 0, "No application page errors are allowed.");
    console.log(
      "RELOADED_ALL_FOUR_OPERATIONS_EMPTY_QUEUE_DOWNLOAD_DISABLED",
      JSON.stringify({
        forms: reopened.forms.length,
        sourceRefs: refs(reopened, "0x403").length,
        destinationRefs: refs(reopened, "0x40A").length,
        destinationOffset: refs(reopened, "0x40A")[0].ifrOffset,
        suppressionStart: reopenedSuppression.start,
        accessLevel: question(reopened, "System Language").accessLevel,
        rootValues: reopened.rootVisibility.entries.map((entry) => entry.value),
      }),
    );
    console.log("ASSETS", [...assets]);
  } finally {
    await browser?.close();
    fs.rmSync(work, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
