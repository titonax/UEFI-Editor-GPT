// Opt-in deployed Firefox acceptance. Firmware and editor JSON remain local.
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
const sourceBytes = fs.readFileSync(sourcePath);
assert.equal(sourceBytes.length, 4194304);
assert.equal(
  crypto.createHash("sha256").update(sourceBytes).digest("hex"),
  "cd22f87daee0d50bf82520aaa6669a6731bdaaf3692690649533790c8e027f9a",
);
const root = fs.mkdtempSync(path.join(os.tmpdir(), "uefi-nested-lzma-firefox-"));
fs.writeFileSync(path.join(root, "source.bin"), sourceBytes);
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

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
    page.on("response", (response) => {
      if (/\.wasm|assets\/index-/.test(response.url()))
        assets.add(response.url().split("/").pop());
    });

    await page.goto("https://titonax.github.io/UEFI-Editor-GPT/");
    await page
      .locator("input[type=file]")
      .first()
      .setInputFiles(path.join(root, "source.bin"));
    await page.getByRole("button", { name: "Start HII analysis", exact: true }).click();
    await page
      .getByRole("button", { name: "Change queue (0)", exact: true })
      .waitFor({ timeout: 240000 });
    console.log("OPENED", await browser.version(), [...assets]);

    const exportJson = page
      .getByRole("button", { name: "data.json", exact: true })
      .nth(1);
    const originalPromise = page.waitForEvent("download");
    await exportJson.click();
    await (await originalPromise).saveAs(path.join(root, "original.json"));
    const data = JSON.parse(fs.readFileSync(path.join(root, "original.json"), "utf8"));
    const scope = data.suppressions.find(
      (candidate) => candidate.offset.toLowerCase() === "0x2b15a",
    );
    assert(scope);
    assert.equal(scope.active, true);
    assert.equal(data.forms.length, 68);
    console.log(
      "SOURCE_EDITOR",
      JSON.stringify({
        forms: data.forms.length,
        suppressions: data.suppressions.length,
        offset: scope.offset,
      }),
    );

    const jsonInput = page.locator('input[type=file][accept=".json"]').first();
    await jsonInput.setInputFiles(path.join(root, "original.json"));
    await page.waitForFunction(
      () =>
        document.querySelector('input[type=file][accept=".json"]').files.length === 0,
    );
    await page.getByRole("button", { name: "Change queue (0)", exact: true }).waitFor();
    console.log("UNCHANGED_IMPORT_QUEUE_ZERO");

    scope.active = false;
    fs.writeFileSync(path.join(root, "edit.json"), JSON.stringify(data));
    await jsonInput.setInputFiles(path.join(root, "edit.json"));
    await page.waitForFunction(
      () =>
        document.querySelector('input[type=file][accept=".json"]').files.length === 0,
    );
    await page.getByRole("button", { name: "Change queue (1)", exact: true }).click();
    const queue = page.getByRole("dialog", { name: "Change queue", exact: true });
    const queueText = await queue.innerText();
    assert.match(queueText, /1 NET LOGICAL FIELD/);
    assert.match(queueText, /Show 18 suppressed item\(s\) in Advanced/);
    assert.match(queueText, /SuppressIf 0x2B15A/);
    console.log("ONE_SELECTED_SUPPRESSION_FIELD");
    assert.equal(
      await page
        .getByRole("button", { name: "Check firmware output", exact: true })
        .isDisabled(),
      true,
    );
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

    await page.getByRole("button", { name: "Output details", exact: true }).click();
    const report = page.getByRole("dialog");
    const reportText = await report.innerText();
    assert.match(reportText, /4194304 bytes, 140878 changed bytes/);
    assert.match(reportText, /1494108[\s\S]*1494085[\s\S]*23/);
    assert.match(reportText, /1572864 bytes outside BIOS preserved/);
    console.log("REPORT_SIZE_CHANGED_CAPACITY_MARGIN_SPI_VERIFIED");
    await page.keyboard.press("Escape");

    const imagePromise = page.waitForEvent("download", (download) =>
      download.suggestedFilename().endsWith(".bin"),
    );
    await outputButton.click();
    await (await imagePromise).saveAs(path.join(root, "output.bin"));
    const original = fs.readFileSync(path.join(root, "source.bin"));
    const output = fs.readFileSync(path.join(root, "output.bin"));
    assert.equal(output.length, original.length);
    assert.equal(
      sha(output),
      "6920f3fed99e90f52c264c0a8b466293f934f652f1fe13d02485d889072d0c0b",
    );
    let changed = 0;
    let outsideOwner = 0;
    let outsideBios = 0;
    for (let index = 0; index < output.length; index++) {
      if (output[index] === original[index]) continue;
      changed++;
      if (index < 1704008 || index >= 3198149) outsideOwner++;
      if (index < 1572864) outsideBios++;
    }
    assert.equal(changed, 140878);
    assert.equal(outsideOwner, 0);
    assert.equal(outsideBios, 0);
    console.log(
      "DOWNLOAD_VERIFIED",
      JSON.stringify({
        size: output.length,
        sha256: sha(output),
        changed,
        outsideOwner,
        outsideBios,
      }),
    );

    await page.getByRole("button", { name: "Change queue (1)", exact: true }).click();
    await queue.getByRole("button", { name: /^Remove .* from change queue$/ }).click();
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
      .setInputFiles(path.join(root, "output.bin"));
    await page.getByRole("button", { name: "Start HII analysis", exact: true }).click();
    await page
      .getByRole("button", { name: "Change queue (0)", exact: true })
      .waitFor({ timeout: 240000 });
    const reloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "data.json", exact: true }).nth(1).click();
    await (await reloadPromise).saveAs(path.join(root, "reloaded.json"));
    const reopened = JSON.parse(
      fs.readFileSync(path.join(root, "reloaded.json"), "utf8"),
    );
    assert.equal(reopened.forms.length, 68);
    const reopenedScope = reopened.suppressions.find(
      (candidate) => candidate.offset.toLowerCase() === "0x2b15a",
    );
    assert(reopenedScope);
    assert.equal(reopenedScope.start, reopenedScope.end);
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
      JSON.stringify({ start: reopenedScope.start }),
    );
    assert.equal(pageErrors.length, 0, "No application page errors are allowed.");
    console.log("ASSETS", [...assets]);
  } finally {
    await browser?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
