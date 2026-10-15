// Opt-in deployed Firefox acceptance for exact Tiano source replacement during a pending native WASM build.
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
  path.join(os.tmpdir(), "uefi-tiano-build-replacement-firefox-"),
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
    await page.goto("https://titonax.github.io/UEFI-Editor-GPT/");
    const navigationBaseline = navigations;
    const documentOrigin = await page.evaluate(() => performance.timeOrigin);
    await openSource(page, path.join(work, "source.bin"));
    console.log("OPENED", await browser.version(), [...assets]);

    await stageFour(page);
    await page.getByRole("button", { name: "Change queue (4)", exact: true }).click();
    const queue = page.getByRole("dialog", { name: "Change queue", exact: true });
    const undo = queue.getByRole("button", { name: "Undo queue change", exact: true });
    const apply = queue.getByRole("button", { name: "Apply selected", exact: true });
    const close = queue.getByRole("button", { name: "Close", exact: true });
    const check = page.getByRole("button", {
      name: "Check firmware output",
      exact: true,
    });
    const output = page.getByRole("button", {
      name: "Modified firmware image",
      exact: true,
    });
    const details = page.getByRole("button", { name: "Output details", exact: true });
    const installed = await page.evaluate(() => {
      const original = WebAssembly.instantiate;
      const probe = {
        count: 0,
        completed: 0,
        nativePending: 0,
        target: 0,
        held: false,
        release: null,
        restore: () => {
          WebAssembly.instantiate = original;
        },
      };
      WebAssembly.instantiate = async function (...args) {
        const sequence = ++probe.count;
        probe.nativePending++;
        let instance;
        try {
          instance = await Reflect.apply(original, WebAssembly, args);
        } finally {
          probe.nativePending--;
        }
        if (sequence === probe.target) {
          probe.held = true;
          await new Promise((resolve) => {
            probe.release = resolve;
          });
          probe.held = false;
        }
        probe.completed++;
        return instance; // Exact native instance/result, never substitute a codec.
      };
      window.__firmwareTimingProbe = probe;
      return WebAssembly.instantiate !== original;
    });
    assert.equal(installed, true);
    async function snapshot() {
      return page.evaluate(() => {
        const p = window.__firmwareTimingProbe;
        return {
          count: p.count,
          completed: p.completed,
          nativePending: p.nativePending,
          target: p.target,
          held: p.held,
        };
      });
    }
    async function clearUndoApply() {
      await queue.getByRole("button", { name: "Clear queue", exact: true }).click();
      assert.match(await queue.innerText(), /The queue is empty/);
      await undo.click();
      assert.match(await queue.innerText(), /4 SELECTED/);
      assert.equal(await check.isDisabled(), true);
      assert.equal(await output.isDisabled(), true);
      assert.equal(await details.isDisabled(), true);
      await apply.click();
      await close.click();
    }
    await close.click();
    await downloadVerifiedOutput(page, path.join(work, "baseline.bin"));
    const baseline = await snapshot();
    assert.equal(baseline.count > 0, true);
    assert.equal(baseline.completed, baseline.count);
    assert.equal(baseline.nativePending, 0);
    console.log("BASELINE_REAL_OUTPUT_NATIVE_INSTANCES", baseline.count);

    await page.getByRole("button", { name: "Change queue (4)", exact: true }).click();
    await clearUndoApply();
    await page.evaluate((target) => {
      const p = window.__firmwareTimingProbe;
      p.count = 0;
      p.completed = 0;
      p.target = target;
    }, baseline.count);
    const raceStarted = Date.now();
    await check.click();
    await page.waitForFunction(() => window.__firmwareTimingProbe.held, null, {
      timeout: 900000,
    });
    const held = await snapshot();
    assert.equal(held.count, baseline.count);
    assert.equal(held.completed, baseline.count - 1);
    assert.equal(held.nativePending, 0);
    assert.equal(await output.isDisabled(), true);
    console.log("OLD_BUILD_HELD_AT_LAST_REAL_INSTANCE", held.count);

    await page
      .getByRole("button", { name: "Load another firmware", exact: true })
      .click();
    await page.getByText("Complete BIOS / firmware image", { exact: true }).waitFor();
    assert.equal(await output.count(), 0);
    assert.equal(await details.count(), 0);
    assert.equal(await page.getByRole("button", { name: /^Change queue/ }).count(), 0);
    await openSource(page, path.join(work, "source.bin"));
    assert.equal(await check.isDisabled(), true);
    assert.equal(await output.isDisabled(), true);
    assert.equal(await details.isDisabled(), true);
    await page.getByRole("button", { name: "Change queue (0)", exact: true }).click();
    for (const name of ["Undo queue change", "Redo queue change", "Apply selected"])
      assert.equal(
        await queue.getByRole("button", { name, exact: true }).isDisabled(),
        true,
      );
    await close.click();
    const baseDownload = page.waitForEvent("download", (download) =>
      download.suggestedFilename().endsWith(".json"),
    );
    await page.getByRole("button", { name: "data.json", exact: true }).nth(1).click();
    const baseFile = path.join(work, "fresh-base.json");
    await (await baseDownload).saveAs(baseFile);
    const base = JSON.parse(fs.readFileSync(baseFile, "utf8"));
    assert.equal(base.forms.length, 70);
    assert.equal(base.forms[0].children[1].accessLevel, "01");
    assert.equal(base.rootVisibility.entries[4].value, 1);
    const refs = (items) =>
      items
        .flatMap((item) => [item, ...refs(item.children || [])])
        .filter((item) => item.type === "Ref" && item.name === "DRAM Timing Control");
    assert.equal(refs(base.forms[3].children).length, 1);
    assert.equal(refs(base.forms[5].children).length, 0);
    assert.equal(
      base.suppressions.find((item) => item.offset.toLowerCase() === "0x8b359").active,
      true,
    );
    assert.equal((await snapshot()).held, true);
    assert.equal(navigations, navigationBaseline);
    assert.equal(await page.evaluate(() => performance.timeOrigin), documentOrigin);
    console.log("PENDING_BUILD_SOURCE_CLOSED_REOPENED_FRESH_BASE_EMPTY_HISTORY");
    await stageFour(page);
    const beforeNewer = await snapshot();
    assert.equal(beforeNewer.held, true);
    assert.equal(beforeNewer.nativePending, 0);
    await downloadVerifiedOutput(page, path.join(work, "newer.bin"));
    assert.deepEqual(
      fs.readFileSync(path.join(work, "newer.bin")),
      fs.readFileSync(path.join(work, "baseline.bin")),
    );
    const newer = await snapshot();
    assert.equal(newer.held, true);
    assert.equal(newer.count - beforeNewer.count, baseline.count);
    assert.equal(newer.completed - beforeNewer.completed, baseline.count);
    assert.equal(newer.nativePending, 0);
    console.log("NATIVE_COUNTERS_BEFORE_AND_AFTER_NEW_BUILD", beforeNewer, newer);
    console.log("NEWER_VERIFIED_OUTPUT_READY_BEFORE_OLD_RELEASE");

    await page.evaluate(async () => {
      const p = window.__firmwareTimingProbe;
      p.release();
      // The reviewed final decoder and remaining reader/verification/comparison
      // path are synchronous or Promise microtasks. Drain them before UI checks.
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    });
    const released = await snapshot();
    assert.equal(
      Date.now() - raceStarted <= 900000,
      true,
      "Race must finish within 15 minutes",
    );
    assert.equal(released.held, false);
    assert.equal(released.completed, newer.completed + 1);
    assert.equal(released.count, newer.count);
    assert.equal(released.nativePending, 0);
    console.log("NATIVE_COUNTERS_AFTER_OLD_DELIVERY", released);
    assert.equal(await output.isDisabled(), false);
    assert.equal(await details.isDisabled(), false);
    assert.doesNotMatch(await page.locator("body").innerText(), /Output check failed:/);
    assert.equal(
      await page.getByText("The firmware could not be loaded", { exact: true }).count(),
      0,
    );
    assert.equal(
      await page.getByRole("button", { name: "Change queue (4)", exact: true }).count(),
      1,
    );
    const cachedDownload = page.waitForEvent("download", (download) =>
      download.suggestedFilename().endsWith(".bin"),
    );
    await output.click();
    await (await cachedDownload).saveAs(path.join(work, "after-late.bin"));
    verifyOutput(path.join(work, "after-late.bin"));
    assert.deepEqual(
      fs.readFileSync(path.join(work, "after-late.bin")),
      fs.readFileSync(path.join(work, "newer.bin")),
    );
    assert.equal((await snapshot()).count, newer.count);
    await page.evaluate(() => {
      window.__firmwareTimingProbe.restore();
      delete window.__firmwareTimingProbe;
    });
    console.log("LATE_COMPLETION_DID_NOT_REPLACE_OR_CLEAR_NEWER_OUTPUT");

    await page
      .getByRole("button", { name: "Load another firmware", exact: true })
      .click();
    await openSource(page, path.join(work, "after-late.bin"));
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
    assert.equal(navigations, navigationBaseline);
    assert.equal(await page.evaluate(() => performance.timeOrigin), documentOrigin);
    console.log("POST_REPLACEMENT_RACE_OUTPUT_REOPENED_ALL_FOUR_EDITS_SAME_DOCUMENT");
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
