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
    const sessionDownloads = [];
    page.on("download", (download) => {
      if (download.suggestedFilename() === "firmware-session.json")
        sessionDownloads.push(download);
    });
    page.on("pageerror", (error) => pageErrors.push(error));
    page.on("response", (response) => {
      if (/\.wasm|assets\/index-/.test(response.url()))
        assets.add(response.url().split("/").pop());
    });

    await page.goto("https://titonax.github.io/UEFI-Editor-GPT/");
    await openSource(page, path.join(work, "source.bin"));
    console.log("OPENED", await browser.version(), [...assets]);

    async function stageFullQueue() {
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
    }
    await stageFullQueue();
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
      // A reopened Mantine dialog can exist before its animated contents mount.
      // Wait for the actual row, then still require the exact complete order.
      await selected(titles[0]).waitFor();
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
    async function armSessionDigests() {
      await page.evaluate(() => {
        const original = crypto.subtle.digest;
        const state = { calls: 0, pending: 0, completed: 0 };
        crypto.subtle.digest = function (...args) {
          state.calls += 1;
          state.pending += 1;
          return original.apply(this, args).then(
            (result) => {
              state.pending -= 1;
              state.completed += 1;
              return result;
            },
            (error) => {
              state.pending -= 1;
              throw error;
            },
          );
        };
        window.__sessionDigestProbe = {
          state,
          restore: () => {
            crypto.subtle.digest = original;
          },
        };
      });
    }
    const session = await saveSession("paused-v2.json");
    await assertPausedSelection();
    assert.equal(await output.isDisabled(), false);
    assert.equal(await details.isDisabled(), false);
    console.log("PAUSED_V2_EXPORTED_METADATA_ONLY_READY_OUTPUT_RETAINED");

    await queue.getByRole("button", { name: "Clear queue", exact: true }).click();
    assert.match(await queue.innerText(), /The queue is empty/);
    await invalidated();
    await armSessionDigests();
    await queue
      .getByLabel("Load queue session file")
      .setInputFiles(path.join(work, "paused-v2.json"));
    await waitForDisabled(apply, false);
    await assertPausedSelection();
    await invalidated();
    const currentLoadDigests = await page.evaluate(
      () => window.__sessionDigestProbe.state,
    );
    assert(currentLoadDigests.calls > 0);
    assert.equal(currentLoadDigests.pending, 0);
    assert.equal(currentLoadDigests.completed, currentLoadDigests.calls);
    await page.evaluate(() => window.__sessionDigestProbe.restore());
    console.log("CURRENT_SESSION_LOAD_NATIVE_DIGESTS", currentLoadDigests);
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

    // Controlled native File.text delivery across queue/history changes and
    // dialog closure, including Undo back to identical entries and selection.
    await page.getByRole("button", { name: "Change queue (4)", exact: true }).click();
    const heldSessionFile = path.join(work, "held-paused-session.json");
    fs.copyFileSync(path.join(work, "paused-v2.json"), heldSessionFile);
    const documentOrigin = await page.evaluate(() => performance.timeOrigin);
    async function armSessionRead(targetName) {
      await page.evaluate((targetName) => {
        const original = File.prototype.text;
        let release;
        const gate = new Promise((resolve) => {
          release = resolve;
        });
        const state = { calls: 0, nativeCompleted: 0, delivered: 0, held: false };
        File.prototype.text = function (...args) {
          if (this.name !== targetName || state.calls > 0)
            return original.apply(this, args);
          state.calls += 1;
          return original.apply(this, args).then(async (text) => {
            state.nativeCompleted += 1;
            state.held = true;
            await gate;
            state.held = false;
            state.delivered += 1;
            return text;
          });
        };
        window.__sessionReadProbe = {
          state,
          release,
          restore: () => {
            File.prototype.text = original;
          },
        };
      }, targetName);
    }
    await armSessionRead("held-paused-session.json");
    await queue.getByLabel("Load queue session file").setInputFiles(heldSessionFile);
    await page.waitForFunction(() => window.__sessionReadProbe.state.held);
    assert.deepEqual(await page.evaluate(() => window.__sessionReadProbe.state), {
      calls: 1,
      nativeCompleted: 1,
      delivered: 0,
      held: true,
    });
    assert.match(await queue.innerText(), /Validating queue session/);
    assert.equal(await output.isDisabled(), false);
    console.log("OLD_SESSION_NATIVE_TEXT_HELD_READY_FULL_OUTPUT_UNCHANGED");
    await queue.getByRole("button", { name: "Clear queue", exact: true }).click();
    await invalidated();
    await queue.getByRole("button", { name: "Undo queue change", exact: true }).click();
    for (const title of titles) assert.equal(await selected(title).isChecked(), true);
    assert.deepEqual(await order(), titles);
    await invalidated();
    await apply.click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    const freshRaceOutput = await downloadVerifiedOutput(
      page,
      path.join(work, "race-current.bin"),
    );
    assert.deepEqual(
      freshRaceOutput,
      fs.readFileSync(path.join(work, "reselected.bin")),
    );
    assert.deepEqual(await page.evaluate(() => window.__sessionReadProbe.state), {
      calls: 1,
      nativeCompleted: 1,
      delivered: 0,
      held: true,
    });
    await armSessionDigests();
    await page.evaluate(async () => {
      window.__sessionReadProbe.release();
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    });
    assert.deepEqual(await page.evaluate(() => window.__sessionReadProbe.state), {
      calls: 1,
      nativeCompleted: 1,
      delivered: 1,
      held: false,
    });
    await page.waitForFunction((expected) => {
      const state = window.__sessionDigestProbe.state;
      return (
        state.calls === expected && state.completed === expected && state.pending === 0
      );
    }, currentLoadDigests.calls);
    await page.evaluate(async () => {
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    });
    console.log(
      "STALE_SESSION_NATIVE_DIGESTS_COMPLETED",
      await page.evaluate(() => window.__sessionDigestProbe.state),
    );
    await page.evaluate(() => window.__sessionDigestProbe.restore());
    await page.getByRole("button", { name: "Change queue (4)", exact: true }).click();
    for (const title of titles) assert.equal(await selected(title).isChecked(), true);
    assert.deepEqual(await order(), titles);
    assert.equal(await output.isDisabled(), false);
    assert.equal(await details.isDisabled(), false);
    assert.equal(await queue.getByRole("alert").count(), 0);
    assert.equal((await queue.innerText()).includes("Queue session loaded."), false);
    await armSessionDigests();
    const fullSessionDownload = page.waitForEvent(
      "download",
      (download) => download.suggestedFilename() === "firmware-session.json",
    );
    await queue
      .getByRole("button", { name: "Save queue session", exact: true })
      .click();
    const fullSessionFile = path.join(work, "race-current-session.json");
    await (await fullSessionDownload).saveAs(fullSessionFile);
    const expectedFullSession = structuredClone(session);
    for (const operation of expectedFullSession.operations) operation.enabled = true;
    assert.deepEqual(
      JSON.parse(fs.readFileSync(fullSessionFile, "utf8")),
      expectedFullSession,
    );
    const currentSaveDigests = await page.evaluate(
      () => window.__sessionDigestProbe.state,
    );
    assert(currentSaveDigests.calls > 0);
    assert.equal(currentSaveDigests.pending, 0);
    assert.equal(currentSaveDigests.completed, currentSaveDigests.calls);
    await page.evaluate(() => window.__sessionDigestProbe.restore());
    console.log("CURRENT_SESSION_SAVE_NATIVE_DIGESTS", currentSaveDigests);
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    const retainedDownload = page.waitForEvent("download", (download) =>
      download.suggestedFilename().endsWith(".bin"),
    );
    await output.click();
    const retainedFile = path.join(work, "race-after-delivery.bin");
    await (await retainedDownload).saveAs(retainedFile);
    assert.deepEqual(verifyOutput(retainedFile), freshRaceOutput);
    assert.equal(await page.evaluate(() => performance.timeOrigin), documentOrigin);
    await page.evaluate(() => window.__sessionReadProbe.restore());
    console.log(
      "LATE_SESSION_TEXT_AFTER_CLEAR_UNDO_RETAINED_NEW_FULL_QUEUE_AND_EXACT_SPI",
    );

    // A different lifetime boundary: close/reopen the source while the native
    // session text is held. No Clear/Undo is used in this replacement sequence.
    await page.getByRole("button", { name: "Change queue (4)", exact: true }).click();
    const replacementSessionFile = path.join(work, "replacement-paused-session.json");
    fs.copyFileSync(path.join(work, "paused-v2.json"), replacementSessionFile);
    await armSessionRead("replacement-paused-session.json");
    await queue
      .getByLabel("Load queue session file")
      .setInputFiles(replacementSessionFile);
    await page.waitForFunction(() => window.__sessionReadProbe.state.held);
    const heldState = { calls: 1, nativeCompleted: 1, delivered: 0, held: true };
    assert.deepEqual(
      await page.evaluate(() => window.__sessionReadProbe.state),
      heldState,
    );
    assert.equal(await output.isDisabled(), false);
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    async function reopenOriginalWithEmptyHistory() {
      await page
        .getByRole("button", { name: "Load another firmware", exact: true })
        .click();
      await openSource(page, path.join(work, "source.bin"));
      assert.equal(await page.evaluate(() => performance.timeOrigin), documentOrigin);
      await page.getByRole("button", { name: "Change queue (0)", exact: true }).click();
      assert.match(await queue.innerText(), /The queue is empty/);
      assert.equal(
        await queue
          .getByRole("button", { name: "Undo queue change", exact: true })
          .isDisabled(),
        true,
      );
      assert.equal(
        await queue
          .getByRole("button", { name: "Redo queue change", exact: true })
          .isDisabled(),
        true,
      );
      await invalidated();
      await queue.getByRole("button", { name: "Close", exact: true }).click();
      const freshBaseDownload = page.waitForEvent("download", (download) =>
        download.suggestedFilename().endsWith(".json"),
      );
      await page.getByRole("button", { name: "data.json", exact: true }).nth(1).click();
      const freshBaseFile = path.join(work, "replacement-original-base.json");
      await (await freshBaseDownload).saveAs(freshBaseFile);
      const freshBase = JSON.parse(fs.readFileSync(freshBaseFile, "utf8"));
      assert.equal(freshBase.forms.length, 70);
      assert.equal(freshBase.forms[0].children[1].accessLevel, "01");
      assert.deepEqual(
        freshBase.rootVisibility.entries.map((item) => item.value),
        Array(7).fill(1),
      );
      const flattenBase = (items) =>
        items.flatMap((item) => [item, ...flattenBase(item.children || [])]);
      const baseRefs = (index) =>
        flattenBase(freshBase.forms[index].children).filter(
          (item) => item.type === "Ref" && item.name === "DRAM Timing Control",
        );
      assert.equal(baseRefs(3).length, 1);
      assert.equal(baseRefs(5).length, 0);
      const baseSuppression = freshBase.suppressions.find(
        (item) => item.offset.toLowerCase() === "0x8b359",
      );
      assert(baseSuppression);
      assert.equal(baseSuppression.active, true);
      assert.notEqual(baseSuppression.start, baseSuppression.end);
    }
    await reopenOriginalWithEmptyHistory();
    assert.deepEqual(
      await page.evaluate(() => window.__sessionReadProbe.state),
      heldState,
    );
    console.log(
      "PENDING_SESSION_SOURCE_REOPENED_SAME_DOCUMENT_ORIGINAL_BASE_EMPTY_HISTORY",
    );

    await stageFullQueue();
    await page.getByRole("button", { name: "Change queue (4)", exact: true }).click();
    assert.deepEqual(await order(), titles);
    for (const title of titles) assert.equal(await selected(title).isChecked(), true);
    await invalidated();
    await apply.click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    const replacementOutput = await downloadVerifiedOutput(
      page,
      path.join(work, "replacement-current.bin"),
    );
    assert.deepEqual(replacementOutput, freshRaceOutput);
    assert.deepEqual(
      await page.evaluate(() => window.__sessionReadProbe.state),
      heldState,
    );
    await armSessionDigests();
    await page.evaluate(() => window.__sessionReadProbe.release());
    await page.waitForFunction((expected) => {
      const read = window.__sessionReadProbe.state;
      const digest = window.__sessionDigestProbe.state;
      return (
        read.delivered === 1 &&
        !read.held &&
        digest.calls === expected &&
        digest.completed === expected &&
        digest.pending === 0
      );
    }, currentLoadDigests.calls);
    await page.evaluate(async () => {
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    });
    assert.deepEqual(await page.evaluate(() => window.__sessionReadProbe.state), {
      calls: 1,
      nativeCompleted: 1,
      delivered: 1,
      held: false,
    });
    console.log(
      "REPLACED_SOURCE_OLD_SESSION_NATIVE_DIGESTS_COMPLETED",
      await page.evaluate(() => window.__sessionDigestProbe.state),
    );
    await page.evaluate(() => window.__sessionDigestProbe.restore());
    await page.getByRole("button", { name: "Change queue (4)", exact: true }).click();
    assert.deepEqual(await order(), titles);
    for (const title of titles) assert.equal(await selected(title).isChecked(), true);
    assert.equal(await output.isDisabled(), false);
    assert.equal(await details.isDisabled(), false);
    assert.equal(await queue.getByRole("alert").count(), 0);
    assert.equal((await queue.innerText()).includes("Queue session loaded."), false);
    const replacementSessionDownload = page.waitForEvent(
      "download",
      (download) => download.suggestedFilename() === "firmware-session.json",
    );
    await queue
      .getByRole("button", { name: "Save queue session", exact: true })
      .click();
    const replacementExport = path.join(work, "replacement-retained-session.json");
    await (await replacementSessionDownload).saveAs(replacementExport);
    assert.deepEqual(
      JSON.parse(fs.readFileSync(replacementExport, "utf8")),
      expectedFullSession,
    );
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    const replacementRetainedDownload = page.waitForEvent("download", (download) =>
      download.suggestedFilename().endsWith(".bin"),
    );
    await output.click();
    const replacementRetainedFile = path.join(work, "replacement-after-delivery.bin");
    await (await replacementRetainedDownload).saveAs(replacementRetainedFile);
    assert.deepEqual(verifyOutput(replacementRetainedFile), replacementOutput);
    assert.equal(await page.evaluate(() => performance.timeOrigin), documentOrigin);
    await page.evaluate(() => window.__sessionReadProbe.restore());
    console.log(
      "LATE_SESSION_AFTER_SOURCE_REPLACEMENT_RETAINED_NEW_FULL_QUEUE_AND_EXACT_SPI",
    );

    // Save has no File.text boundary. Hold only the final successful native
    // digest delivery, using the actual current-save call count above. Restore
    // the native method as soon as that call starts, before other source work.
    await page.getByRole("button", { name: "Change queue (4)", exact: true }).click();
    const downloadsBeforeOldSave = sessionDownloads.length;
    await page.evaluate((lastCall) => {
      const original = crypto.subtle.digest;
      const createObjectURL = URL.createObjectURL;
      let release;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const state = {
        calls: 0,
        nativeCompleted: 0,
        delivered: 0,
        held: false,
        jsonUrls: 0,
      };
      URL.createObjectURL = function (...args) {
        if (args[0]?.type === "application/json") state.jsonUrls += 1;
        return createObjectURL.apply(this, args);
      };
      crypto.subtle.digest = function (...args) {
        const call = ++state.calls;
        if (call === lastCall) crypto.subtle.digest = original;
        return original.apply(this, args).then(async (result) => {
          state.nativeCompleted += 1;
          if (call === lastCall) {
            state.held = true;
            await gate;
            state.held = false;
          }
          state.delivered += 1;
          return result;
        });
      };
      window.__sessionSaveProbe = {
        state,
        release,
        restore: () => {
          URL.createObjectURL = createObjectURL;
        },
      };
    }, currentSaveDigests.calls);
    await queue
      .getByRole("button", { name: "Save queue session", exact: true })
      .click();
    await page.waitForFunction(() => window.__sessionSaveProbe.state.held);
    const heldSaveState = {
      calls: currentSaveDigests.calls,
      nativeCompleted: currentSaveDigests.calls,
      delivered: currentSaveDigests.calls - 1,
      held: true,
      jsonUrls: 0,
    };
    assert.deepEqual(
      await page.evaluate(() => window.__sessionSaveProbe.state),
      heldSaveState,
    );
    assert.match(await queue.innerText(), /Validating queue session/);
    assert.equal(await output.isDisabled(), false);
    assert.equal(await details.isDisabled(), false);
    assert.equal(sessionDownloads.length, downloadsBeforeOldSave);
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    await reopenOriginalWithEmptyHistory();
    await stageFullQueue();
    await page.getByRole("button", { name: "Change queue (4)", exact: true }).click();
    assert.deepEqual(await order(), titles);
    for (const title of titles) assert.equal(await selected(title).isChecked(), true);
    await invalidated();
    await apply.click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    const saveReplacementOutput = await downloadVerifiedOutput(
      page,
      path.join(work, "save-replacement-current.bin"),
    );
    assert.deepEqual(saveReplacementOutput, replacementOutput);
    const beforeSaveDelivery = await page.evaluate(
      () => window.__sessionSaveProbe.state,
    );
    // The base export and suppression staging legitimately create JSON URLs
    // while the old save is held. Snapshot those before releasing its digest.
    assert.deepEqual(beforeSaveDelivery, {
      ...heldSaveState,
      jsonUrls: beforeSaveDelivery.jsonUrls,
    });
    assert.equal(sessionDownloads.length, downloadsBeforeOldSave);
    await page.evaluate(() => window.__sessionSaveProbe.release());
    await page.waitForFunction((expected) => {
      const state = window.__sessionSaveProbe.state;
      return state.delivered === expected && !state.held;
    }, currentSaveDigests.calls);
    await page.evaluate(async () => {
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    });
    assert.deepEqual(await page.evaluate(() => window.__sessionSaveProbe.state), {
      ...beforeSaveDelivery,
      delivered: currentSaveDigests.calls,
      held: false,
    });
    // Check before a newer session operation could supersede the old request.
    assert.equal(sessionDownloads.length, downloadsBeforeOldSave);
    await page.getByRole("button", { name: "Change queue (4)", exact: true }).click();
    assert.deepEqual(await order(), titles);
    for (const title of titles) assert.equal(await selected(title).isChecked(), true);
    assert.equal(await output.isDisabled(), false);
    assert.equal(await details.isDisabled(), false);
    assert.equal(await queue.getByRole("alert").count(), 0);
    assert.equal((await queue.innerText()).includes("Queue session saved."), false);
    const newSaveDownload = page.waitForEvent(
      "download",
      (download) => download.suggestedFilename() === "firmware-session.json",
    );
    await queue
      .getByRole("button", { name: "Save queue session", exact: true })
      .click();
    const newSaveFile = path.join(work, "save-replacement-current-session.json");
    await (await newSaveDownload).saveAs(newSaveFile);
    assert.deepEqual(
      JSON.parse(fs.readFileSync(newSaveFile, "utf8")),
      expectedFullSession,
    );
    assert.equal(sessionDownloads.length, downloadsBeforeOldSave + 1);
    assert.equal(
      await page.evaluate(() => window.__sessionSaveProbe.state.jsonUrls),
      beforeSaveDelivery.jsonUrls + 1,
    );
    await page.evaluate(() => window.__sessionSaveProbe.restore());
    assert.equal(await output.isDisabled(), false);
    assert.equal(await details.isDisabled(), false);
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    const saveRetainedDownload = page.waitForEvent("download", (download) =>
      download.suggestedFilename().endsWith(".bin"),
    );
    await output.click();
    const saveRetainedFile = path.join(work, "save-replacement-after-delivery.bin");
    await (await saveRetainedDownload).saveAs(saveRetainedFile);
    assert.deepEqual(verifyOutput(saveRetainedFile), saveReplacementOutput);
    assert.equal(await page.evaluate(() => performance.timeOrigin), documentOrigin);
    console.log(
      "LATE_SESSION_SAVE_AFTER_SOURCE_REPLACEMENT_NO_STALE_DOWNLOAD_NEW_QUEUE_AND_SPI_RETAINED",
      await page.evaluate(() => window.__sessionSaveProbe.state),
    );

    // Isolate queue/history cancellation from dialog/source replacement and
    // newer requests. File.text is native/unheld; only the last successful
    // validation digest waits. The open dialog stays mounted through delivery.
    await page.getByRole("button", { name: "Change queue (4)", exact: true }).click();
    assert.deepEqual(await order(), titles);
    async function armSessionLoadHash() {
      await page.evaluate((lastCall) => {
        const original = crypto.subtle.digest;
        let release;
        const gate = new Promise((resolve) => {
          release = resolve;
        });
        const state = { calls: 0, nativeCompleted: 0, delivered: 0, held: false };
        crypto.subtle.digest = function (...args) {
          const call = ++state.calls;
          if (call === lastCall) crypto.subtle.digest = original;
          return original.apply(this, args).then(async (result) => {
            state.nativeCompleted += 1;
            if (call === lastCall) {
              state.held = true;
              await gate;
              state.held = false;
            }
            state.delivered += 1;
            return result;
          });
        };
        window.__sessionLoadHashProbe = { state, release };
      }, currentLoadDigests.calls);
    }
    await armSessionLoadHash();
    await queue
      .getByLabel("Load queue session file")
      .setInputFiles(path.join(work, "paused-v2.json"));
    await page.waitForFunction(() => window.__sessionLoadHashProbe.state.held);
    const heldLoadHash = {
      calls: currentLoadDigests.calls,
      nativeCompleted: currentLoadDigests.calls,
      delivered: currentLoadDigests.calls - 1,
      held: true,
    };
    assert.deepEqual(
      await page.evaluate(() => window.__sessionLoadHashProbe.state),
      heldLoadHash,
    );
    assert.match(await queue.innerText(), /Validating queue session/);
    for (const title of titles) assert.equal(await selected(title).isChecked(), true);
    assert.equal(await output.isDisabled(), false);
    assert.equal(await details.isDisabled(), false);
    await queue.getByRole("button", { name: "Clear queue", exact: true }).click();
    assert.match(await queue.innerText(), /The queue is empty/);
    await invalidated();
    await queue.getByRole("button", { name: "Undo queue change", exact: true }).click();
    assert.deepEqual(await order(), titles);
    for (const title of titles) assert.equal(await selected(title).isChecked(), true);
    await invalidated();
    assert.deepEqual(
      await page.evaluate(() => window.__sessionLoadHashProbe.state),
      heldLoadHash,
    );
    // No dialog close, source replacement, Apply or other session request has
    // occurred since this load began. Returning to equal entries is not reuse.
    await page.evaluate(() => window.__sessionLoadHashProbe.release());
    await page.waitForFunction((expected) => {
      const state = window.__sessionLoadHashProbe.state;
      return state.delivered === expected && !state.held;
    }, currentLoadDigests.calls);
    await page.evaluate(async () => {
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    });
    assert.deepEqual(await page.evaluate(() => window.__sessionLoadHashProbe.state), {
      ...heldLoadHash,
      delivered: currentLoadDigests.calls,
      held: false,
    });
    assert.deepEqual(await order(), titles);
    for (const title of titles) assert.equal(await selected(title).isChecked(), true);
    assert.match(await queue.innerText(), /4 SELECTED/);
    assert.equal(await queue.getByRole("alert").count(), 0);
    assert.equal((await queue.innerText()).includes("Queue session loaded."), false);
    await invalidated();
    assert.equal(await apply.isDisabled(), false);
    console.log(
      "LATE_SESSION_FINAL_HASH_AFTER_CLEAR_UNDO_OPEN_DIALOG_FULL_QUEUE_RETAINED",
    );
    await apply.click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    const loadHashOutput = await downloadVerifiedOutput(
      page,
      path.join(work, "load-hash-after-clear-undo.bin"),
    );
    assert.deepEqual(loadHashOutput, saveReplacementOutput);
    assert.equal(await page.evaluate(() => performance.timeOrigin), documentOrigin);
    console.log("SESSION_HASH_CANCELLED_PLAN_FRESH_FULL_SPI_IDENTICAL");

    // A separate source lifetime boundary while the same last native load hash
    // is held. No Clear/Undo or newer session request occurs before delivery.
    await page.getByRole("button", { name: "Change queue (4)", exact: true }).click();
    assert.deepEqual(await order(), titles);
    await armSessionLoadHash();
    await queue
      .getByLabel("Load queue session file")
      .setInputFiles(path.join(work, "paused-v2.json"));
    await page.waitForFunction(() => window.__sessionLoadHashProbe.state.held);
    assert.deepEqual(
      await page.evaluate(() => window.__sessionLoadHashProbe.state),
      heldLoadHash,
    );
    assert.match(await queue.innerText(), /Validating queue session/);
    assert.equal(await output.isDisabled(), false);
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    await reopenOriginalWithEmptyHistory();
    await stageFullQueue();
    await page.getByRole("button", { name: "Change queue (4)", exact: true }).click();
    assert.deepEqual(await order(), titles);
    for (const title of titles) assert.equal(await selected(title).isChecked(), true);
    await invalidated();
    await apply.click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    const hashReplacementOutput = await downloadVerifiedOutput(
      page,
      path.join(work, "load-hash-replacement-current.bin"),
    );
    assert.deepEqual(hashReplacementOutput, loadHashOutput);
    assert.deepEqual(
      await page.evaluate(() => window.__sessionLoadHashProbe.state),
      heldLoadHash,
    );
    await page.evaluate(() => window.__sessionLoadHashProbe.release());
    await page.waitForFunction((expected) => {
      const state = window.__sessionLoadHashProbe.state;
      return state.delivered === expected && !state.held;
    }, currentLoadDigests.calls);
    await page.evaluate(async () => {
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    });
    assert.deepEqual(await page.evaluate(() => window.__sessionLoadHashProbe.state), {
      ...heldLoadHash,
      delivered: currentLoadDigests.calls,
      held: false,
    });
    // Observe retained state before another session operation can supersede it.
    await page.getByRole("button", { name: "Change queue (4)", exact: true }).click();
    assert.deepEqual(await order(), titles);
    for (const title of titles) assert.equal(await selected(title).isChecked(), true);
    assert.match(await queue.innerText(), /4 SELECTED/);
    assert.equal(await output.isDisabled(), false);
    assert.equal(await details.isDisabled(), false);
    assert.equal(await queue.getByRole("alert").count(), 0);
    assert.equal((await queue.innerText()).includes("Queue session loaded."), false);
    const hashReplacementSession = page.waitForEvent(
      "download",
      (download) => download.suggestedFilename() === "firmware-session.json",
    );
    await queue
      .getByRole("button", { name: "Save queue session", exact: true })
      .click();
    const hashReplacementSessionFile = path.join(
      work,
      "load-hash-current-session.json",
    );
    await (await hashReplacementSession).saveAs(hashReplacementSessionFile);
    assert.deepEqual(
      JSON.parse(fs.readFileSync(hashReplacementSessionFile, "utf8")),
      expectedFullSession,
    );
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    const hashRetainedDownload = page.waitForEvent("download", (download) =>
      download.suggestedFilename().endsWith(".bin"),
    );
    await output.click();
    const hashRetainedFile = path.join(work, "load-hash-replacement-retained.bin");
    await (await hashRetainedDownload).saveAs(hashRetainedFile);
    assert.deepEqual(verifyOutput(hashRetainedFile), hashReplacementOutput);
    assert.equal(await page.evaluate(() => performance.timeOrigin), documentOrigin);
    console.log(
      "LATE_SESSION_LOAD_HASH_AFTER_SOURCE_REPLACEMENT_NEW_QUEUE_AND_SPI_RETAINED",
    );

    // Loading is one undoable queue replacement, not four separate mutations.
    // Apply/output are never restored by Undo or Redo, even with identical entries.
    await page.getByRole("button", { name: "Change queue (4)", exact: true }).click();
    const undo = queue.getByRole("button", { name: "Undo queue change", exact: true });
    const redo = queue.getByRole("button", { name: "Redo queue change", exact: true });
    async function assertFullSelection() {
      assert.deepEqual(await order(), titles);
      assert.match(await queue.innerText(), /4 SELECTED/);
      for (const title of titles) assert.equal(await selected(title).isChecked(), true);
    }
    await assertFullSelection();
    await queue
      .getByLabel("Load queue session file")
      .setInputFiles(path.join(work, "paused-v2.json"));
    await waitForDisabled(apply, false);
    // Wait for the actual replacement, not the already enabled Apply control.
    await page.waitForFunction(() => {
      const items = [
        ...document.querySelectorAll('[role="dialog"] input[type="checkbox"]'),
      ];
      return items.length === 4 && items.filter((item) => item.checked).length === 1;
    });
    await assertPausedSelection();
    await invalidated();
    await undo.click();
    await assertFullSelection();
    await invalidated();
    assert.equal(await redo.isDisabled(), false);
    await redo.click();
    await assertPausedSelection();
    await invalidated();
    assert.deepEqual(await saveSession("history-redo-session.json"), session);
    await invalidated();
    await apply.click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    await downloadVerifiedOutput(
      page,
      path.join(work, "history-redo.bin"),
      "move-only",
    );
    assert.deepEqual(
      fs.readFileSync(path.join(work, "history-redo.bin")),
      fs.readFileSync(path.join(work, "restored-move-only.bin")),
    );
    console.log("SESSION_LOAD_SINGLE_UNDO_REDO_FRESH_MOVE_ONLY_OUTPUT_VERIFIED");

    await page.getByRole("button", { name: "Change queue (4)", exact: true }).click();
    await undo.click();
    await assertFullSelection();
    await invalidated();
    assert.equal(await redo.isDisabled(), false);
    await apply.click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    await downloadVerifiedOutput(page, path.join(work, "history-undo.bin"));
    assert.deepEqual(
      fs.readFileSync(path.join(work, "history-undo.bin")),
      fs.readFileSync(path.join(work, "reselected.bin")),
    );
    console.log("SESSION_LOAD_UNDO_AFTER_READY_OUTPUT_FRESH_FULL_SPI_IDENTICAL");

    await page.getByRole("button", { name: "Change queue (4)", exact: true }).click();
    assert.equal(await redo.isDisabled(), false);
    await redo.click();
    await assertPausedSelection();
    await invalidated();
    console.log("SESSION_LOAD_REDO_AFTER_READY_FULL_OUTPUT_INVALIDATED");
    await queue.getByRole("button", { name: "Close", exact: true }).click();

    for (const [file, mode] of [
      ["history-redo.bin", "move-only"],
      ["history-undo.bin", "full"],
      ["race-after-delivery.bin", "full"],
      ["replacement-after-delivery.bin", "full"],
      ["save-replacement-after-delivery.bin", "full"],
      ["load-hash-after-clear-undo.bin", "full"],
      ["load-hash-replacement-retained.bin", "full"],
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
