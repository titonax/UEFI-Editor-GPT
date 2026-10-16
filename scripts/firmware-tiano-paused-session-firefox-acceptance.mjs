// Opt-in deployed Firefox acceptance for exact Tiano paused v2 session and selected output.
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
  path.join(os.tmpdir(), "uefi-tiano-paused-session-firefox-"),
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
  assert.deepEqual(session.operations, [
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
      enabled: false,
    },
    {
      action: "suppressions",
      changes: [{ conditionIndex: 5, active: false }],
      enabled: false,
    },
    {
      action: "ami-roots",
      changes: [{ rootIndex: 4, visible: false }],
      enabled: false,
    },
  ]);
  assert.deepEqual(
    session.operations.map((op) => op.action),
    ["move-ref", "ami-values", "suppressions", "ami-roots"],
  );
  assert.deepEqual(
    session.operations.map((op) => op.enabled),
    [true, false, false, false],
  );
  assert.deepEqual(Object.keys(session.operations[0]).sort(), [
    "action",
    "destinationFormIndex",
    "enabled",
    "referenceChildIndex",
    "sourceFormIndex",
  ]);
  assert.deepEqual(Object.keys(session.operations[1].changes[0]).sort(), [
    "childIndex",
    "field",
    "formIndex",
    "value",
  ]);
  assert.equal(session.operations[1].changes.length, 1);
  assert.equal(session.operations[1].changes[0].field, "accessLevel");
  assert.equal(session.operations[1].changes[0].value, "00");
  assert.equal(session.operations[2].changes.length, 1);
  assert.equal(session.operations[2].changes[0].active, false);
  assert.deepEqual(Object.keys(session.operations[2].changes[0]).sort(), [
    "active",
    "conditionIndex",
  ]);
  assert.deepEqual(session.operations[3].changes, [{ rootIndex: 4, visible: false }]);
  assert.doesNotMatch(
    JSON.stringify(session),
    /patches|expected|replacement|ifrBinary|history|applied|fileName|offset|source\.bin/,
  );
}

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
  assert(["full", "move-only"].includes(mode));
  const output = fs.readFileSync(destination);
  assert.equal(output.length, sourceBytes.length);
  assert.equal(
    sha256(output),
    mode === "full"
      ? expectedOutputSha
      : "b1d6224b3ff47692e56ee5c42e7e9055c2154fccfcb3b79ac9fe713df745705f",
  );
  let changed = 0;
  let outsideOwners = 0;
  let outsideBios = 0;
  for (let index = 0; index < output.length; index++) {
    if (output[index] === sourceBytes[index]) continue;
    changed += 1;
    const inFirstOwner = mode === "full" && index >= 3239384 && index < 3419918;
    const inSecondOwner = index >= 4612464 && index < 4781106;
    if (!inFirstOwner && !inSecondOwner) outsideOwners += 1;
    if (index < 1572864) outsideBios += 1;
  }
  assert.equal(changed, mode === "full" ? 140913 : 12295);
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
    for (const title of titles.slice(1)) {
      await selected(title).uncheck();
      await invalidated();
    }
    assert.match(await queue.innerText(), /1 SELECTED/);
    assert.equal(await selected(titles[0]).isChecked(), true);
    for (const title of titles.slice(1))
      assert.equal(await selected(title).isChecked(), false);
    assert.equal(await apply.isDisabled(), false);
    assert.deepEqual(await order(), titles);
    await apply.click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    await downloadVerifiedOutput(page, path.join(work, "move-only.bin"), "move-only");
    console.log("THREE_PAUSED_ENTRIES_ONLY_MOVE_EXACT_KNOWN_SPI_VERIFIED");

    await page.getByRole("button", { name: "Change queue (4)", exact: true }).click();

    async function assertPausedSelection() {
      assert.deepEqual(await order(), titles);
      assert.match(await queue.innerText(), /1 SELECTED/);
      for (const [index, title] of titles.entries())
        assert.equal(await selected(title).isChecked(), index === 0);
    }
    async function saveSession(file) {
      const pending = page.waitForEvent(
        "download",
        (download) => download.suggestedFilename() === "firmware-session.json",
      );
      await queue
        .getByRole("button", { name: "Save queue session", exact: true })
        .click();
      await (await pending).saveAs(path.join(work, file));
      const session = JSON.parse(fs.readFileSync(path.join(work, file), "utf8"));
      assertMetadataOnly(session);
      return session;
    }
    const session = await saveSession("paused-v2.json");
    await assertPausedSelection();
    assert.equal(await output.isDisabled(), false);
    assert.equal(await details.isDisabled(), false);
    console.log("PAUSED_V2_EXPORTED_METADATA_ONLY_READY_OUTPUT_RETAINED");

    await queue.getByRole("button", { name: "Clear queue", exact: true }).click();
    assert.match(await queue.innerText(), /The queue is empty/);
    await invalidated();
    await queue
      .getByLabel("Load queue session file")
      .setInputFiles(path.join(work, "paused-v2.json"));
    await waitForDisabled(apply, false);
    await assertPausedSelection();
    await invalidated();
    assert.deepEqual(await saveSession("paused-roundtrip.json"), session);
    await invalidated();
    await apply.click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    await downloadVerifiedOutput(
      page,
      path.join(work, "restored-move-only.bin"),
      "move-only",
    );
    assert.deepEqual(
      fs.readFileSync(path.join(work, "move-only.bin")),
      fs.readFileSync(path.join(work, "restored-move-only.bin")),
    );
    console.log("PAUSED_SESSION_RESTORED_FRESH_MOVE_ONLY_SPI_IDENTICAL");

    await page.getByRole("button", { name: "Change queue (4)", exact: true }).click();
    const invalidSession = structuredClone(session);
    invalidSession.operations[3].changes[0].rootIndex = 999;
    assert.equal(invalidSession.operations[3].enabled, false);
    fs.writeFileSync(
      path.join(work, "invalid-paused-root.json"),
      JSON.stringify(invalidSession),
    );
    await queue
      .getByLabel("Load queue session file")
      .setInputFiles(path.join(work, "invalid-paused-root.json"));
    const rejected = queue.getByRole("alert");
    await rejected.waitFor();
    assert.match(await rejected.innerText(), /targets a missing or ambiguous root/);
    await assertPausedSelection();
    assert.equal(await output.isDisabled(), false);
    assert.equal(await details.isDisabled(), false);
    assert.deepEqual(await saveSession("after-rejection.json"), session);
    assert.equal(await output.isDisabled(), false);
    console.log("INVALID_PAUSED_ROOT_REJECTED_ATOMICALLY_READY_OUTPUT_RETAINED");
    for (const title of titles.slice(1)) {
      await selected(title).check();
      await invalidated();
    }
    assert.match(await queue.innerText(), /4 SELECTED/);
    assert.deepEqual(await order(), titles);
    await apply.click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    await downloadVerifiedOutput(page, path.join(work, "reselected.bin"));
    console.log("RESTORED_PAUSED_ENTRIES_RESELECTED_FRESH_FULL_SPI_VERIFIED");

    for (const [file, mode] of [
      ["restored-move-only.bin", "move-only"],
      ["reselected.bin", "full"],
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
      assert.equal(
        reopened.forms[0].children[1].accessLevel,
        mode === "full" ? "00" : "01",
      );
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
      if (mode === "full") assert.equal(suppression.start, suppression.end);
      else {
        assert.notEqual(suppression.start, suppression.end);
        assert.equal(suppression.active, true);
      }
      assert.equal(await output.isDisabled(), true);
      assert.equal(await details.isDisabled(), true);
      console.log(
        "INDEPENDENT_REANALYSIS_" +
          mode.toUpperCase() +
          "_EXACT_SELECTED_AND_PAUSED_STATES",
      );
    }

    await page.getByRole("button", { name: "Change queue (0)", exact: true }).click();
    await queue
      .getByLabel("Load queue session file")
      .setInputFiles(path.join(work, "paused-v2.json"));
    const identityRejection = queue.getByRole("alert");
    await identityRejection.waitFor();
    assert.match(
      await identityRejection.innerText(),
      /different firmware image or opened HII context/,
    );
    assert.match(await queue.innerText(), /The queue is empty/);
    assert.equal(await output.isDisabled(), true);
    console.log("PAUSED_SESSION_REJECTED_ON_CHANGED_COMPLETE_SPI_EMPTY_QUEUE");
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
