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
  return verifyOutput(destination, mode);
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
      assert.equal(reopened.rootVisibility.entries[4].value, 1);
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
        Array(7).fill(1),
      );
      assert.equal(await output.isDisabled(), true);
      assert.equal(await details.isDisabled(), true);
      console.log(
        "INDEPENDENT_REANALYSIS_" +
          mode.toUpperCase() +
          "_THREE_EDITS_AND_ALL_ORIGINAL_ROOTS",
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
