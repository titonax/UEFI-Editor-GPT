// Opt-in deployed Firefox acceptance for portable Phoenix queue sessions.
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
const readProbeMode = process.env.FIRMWARE_BROWSER_SESSION_READ_PROBE;
assert(
  readProbeMode === undefined ||
    ["1", "close", "source", "reject", "reject-close"].includes(readProbeMode),
  "FIRMWARE_BROWSER_SESSION_READ_PROBE must be 1, close, source, reject or reject-close when supplied.",
);
const probeSessionRead = readProbeMode !== undefined;
const probeRejection = ["reject", "reject-close"].includes(readProbeMode);
const probeClosedRejection = readProbeMode === "reject-close";
const probeReadyOutput = ["close", "source", "reject", "reject-close"].includes(
  readProbeMode,
);
const work = fs.mkdtempSync(path.join(os.tmpdir(), "uefi-phoenix-session-firefox-"));
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
  assert.equal(session.kind, "phoenix-visibility");
  assert.deepEqual(Object.keys(session.source).sort(), [
    "sha256",
    "size",
    "templatSha256",
  ]);
  assert.equal(session.source.sha256, sha256(sourceBytes));
  assert.equal(session.source.size, sourceBytes.length);
  assert.match(session.source.templatSha256, /^[a-f0-9]{64}$/);
  assert.equal(session.operations.length, 1);
  assert.deepEqual(Object.keys(session.operations[0]).sort(), [
    "action",
    "enabled",
    "itemOffset",
  ]);
  assert.deepEqual(session.operations[0], {
    action: "show",
    itemOffset: 3785,
    enabled: true,
  });
  const text = JSON.stringify(session);
  assert.doesNotMatch(text, /rawBytes|patch|prompt|history|applied|fileName/);
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

async function downloadVerifiedOutput(page, destination, check = true) {
  if (check)
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
  return output;
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
    let navigations = 0;
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) navigations++;
    });
    const pageErrors = [];
    const assets = new Set();
    page.on("pageerror", (error) => pageErrors.push(error));
    page.on("response", (response) => {
      if (/\.wasm|assets\/index-/.test(response.url()))
        assets.add(response.url().split("/").pop());
    });
    if (probeSessionRead)
      await page.addInitScript(() => {
        const probe = {
          armed: false,
          held: false,
          delivered: false,
          hashes: 0,
          release: null,
          digestsUntilHold: 0,
          digestHeld: false,
          digestDelivered: false,
          releaseDigest: null,
        };
        window.sessionReadProbe = probe;
        const nativeText = File.prototype.text;
        File.prototype.text = async function () {
          const text = await nativeText.call(this);
          if (probe.armed && this.name === "session-v2.json") {
            probe.armed = false;
            probe.held = true;
            await new Promise((resolve) => {
              probe.release = resolve;
            });
            probe.delivered = true;
          }
          return text;
        };
        const nativeDigest = crypto.subtle.digest;
        crypto.subtle.digest = function (...args) {
          probe.hashes++;
          const result = nativeDigest.apply(this, args);
          if (probe.digestsUntilHold > 0 && --probe.digestsUntilHold === 0)
            return result.then(async (value) => {
              probe.digestHeld = true;
              await new Promise((resolve) => {
                probe.releaseDigest = resolve;
              });
              probe.digestDelivered = true;
              return value;
            });
          return result;
        };
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
    const sessionDownload = page.waitForEvent(
      "download",
      (download) => download.suggestedFilename() === "firmware-session.json",
    );
    await queue
      .getByRole("button", { name: "Save queue session", exact: true })
      .click();
    await (await sessionDownload).saveAs(path.join(work, "session-v2.json"));
    const v2 = JSON.parse(fs.readFileSync(path.join(work, "session-v2.json"), "utf8"));
    assert.equal(v2.version, 2);
    assertMetadataOnly(v2);
    console.log("V2_EXPORTED_METADATA_ONLY");

    let readyOutput;
    if (probeReadyOutput) {
      await queue.getByRole("button", { name: "Apply selected", exact: true }).click();
      await queue.getByRole("button", { name: "Close", exact: true }).click();
      readyOutput = await downloadVerifiedOutput(
        page,
        path.join(work, "output-ready.bin"),
      );
      await page.getByRole("button", { name: "Change queue (1)", exact: true }).click();
      console.log("READY_OUTPUT_BEFORE_HELD_READ_VERIFIED");
    }

    if (probeSessionRead && !probeRejection) {
      let before = await page.evaluate(() => {
        window.sessionReadProbe.armed = true;
        return window.sessionReadProbe.hashes;
      });
      await queue
        .getByLabel("Load queue session file")
        .setInputFiles(path.join(work, "session-v2.json"));
      await page.waitForFunction(() => window.sessionReadProbe.held);
      assert.equal(
        await queue.getByText("Validating queue session…").isVisible(),
        true,
      );
      if (probeReadyOutput) {
        await queue.getByRole("button", { name: "Close", exact: true }).click();
        await queue.waitFor({ state: "hidden" });
        if (readProbeMode === "source") {
          const navigationBaseline = navigations;
          await page
            .getByRole("button", { name: "Load another firmware", exact: true })
            .click();
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
          await page
            .getByRole("button", { name: "Change queue (0)", exact: true })
            .click();
          for (const name of ["Undo queue change", "Redo queue change"])
            assert.equal(
              await queue.getByRole("button", { name, exact: true }).isDisabled(),
              true,
            );
          for (const name of ["Modified firmware image", "Output details"])
            assert.equal(
              await page.getByRole("button", { name, exact: true }).isDisabled(),
              true,
            );
          await queue.getByRole("button", { name: "Close", exact: true }).click();
          await page
            .getByRole("button")
            .filter({ hasText: /^Cache Ram/ })
            .first()
            .click();
          const show = page.getByRole("button", {
            name: "Queue Show for Cache Ram Phoenix item",
            exact: true,
          });
          assert.equal(await show.isDisabled(), false);
          await show.click();
          await page
            .getByRole("button", { name: "Change queue (1)", exact: true })
            .click();
          await queue
            .getByRole("button", { name: "Apply selected", exact: true })
            .click();
          await queue.getByRole("button", { name: "Close", exact: true }).click();
          const fresh = await downloadVerifiedOutput(
            page,
            path.join(work, "output-reopened.bin"),
          );
          assert(
            fresh.equals(readyOutput),
            "Fresh reopened output must match without logging bytes.",
          );
          assert.equal(
            navigations,
            navigationBaseline,
            "Source replacement must stay in the same document.",
          );
          before = await page.evaluate(() => window.sessionReadProbe.hashes);
          console.log(
            "SAME_BYTE_SOURCE_REOPEN_FRESH_BASE_HISTORY_OUTPUT_RESET_AND_REBUILD",
          );
        }
      } else {
        await queue.getByRole("button", { name: "Clear queue", exact: true }).click();
        assert.match(await queue.innerText(), /The queue is empty/);
        await queue
          .getByRole("button", { name: "Undo queue change", exact: true })
          .click();
        assert.match(await queue.innerText(), /SHOW[\s\S]*Cache Ram/);
        assert.equal(await queue.getByRole("alert").count(), 0);
      }
      await page.evaluate(() => window.sessionReadProbe.release());
      await page.waitForFunction(() => window.sessionReadProbe.delivered);
      // A second browser task observes after native text delivery/microtasks.
      // Session identity() starts both native digests before its first await.
      assert.equal(
        await page.evaluate(() => window.sessionReadProbe.hashes),
        before,
        "Cancelled text delivery must not initiate source/template digests.",
      );
      if (probeReadyOutput) {
        for (const name of ["Modified firmware image", "Output details"])
          assert.equal(
            await page.getByRole("button", { name, exact: true }).isDisabled(),
            false,
          );
        const retained = await downloadVerifiedOutput(
          page,
          path.join(work, "output-retained.bin"),
          false,
        );
        assert(
          retained.equals(readyOutput),
          "Retained output must match without logging bytes.",
        );
        await page
          .getByRole("button", { name: "Change queue (1)", exact: true })
          .click();
        console.log(
          readProbeMode === "source"
            ? "REOPENED_SOURCE_OLD_TEXT_NO_HASHES_FRESH_OUTPUT_RETAINED"
            : "CLOSED_DIALOG_OLD_TEXT_NO_HASHES_READY_OUTPUT_RETAINED",
        );
      }
      assert.match(await queue.innerText(), /SHOW[\s\S]*Cache Ram/);
      assert.equal(await queue.getByRole("alert").count(), 0);
      assert.equal(await queue.getByText(/Queue session loaded/).count(), 0);
      assert.equal(await queue.getByText("Validating queue session…").count(), 0);
      assert.equal(
        await page
          .getByRole("button", { name: "Modified firmware image", exact: true })
          .isDisabled(),
        !probeReadyOutput,
      );
      if (readProbeMode === "1")
        console.log("HELD_NATIVE_TEXT_CLEAR_UNDO_CANCELLED_WITHOUT_HASHING");
    }

    if (probeRejection) {
      const invalid = structuredClone(v2);
      invalid.operations[0].itemOffset = Number.MAX_SAFE_INTEGER;
      invalid.operations[0].enabled = false;
      const invalidPath = path.join(work, "session-invalid.json");
      fs.writeFileSync(invalidPath, JSON.stringify(invalid));
      const sessionInput = queue.getByLabel("Load queue session file");
      const heldHashes = await page.evaluate(() => {
        window.sessionReadProbe.digestsUntilHold = 2;
        return window.sessionReadProbe.hashes;
      });
      await sessionInput.setInputFiles(invalidPath);
      await page.waitForFunction(() => window.sessionReadProbe.digestHeld);
      assert.equal(
        await page.evaluate(() => window.sessionReadProbe.hashes),
        heldHashes + 2,
      );
      assert.equal(
        await queue.getByText("Validating queue session…").isVisible(),
        true,
      );
      if (probeClosedRejection) {
        await queue.getByRole("button", { name: "Close", exact: true }).click();
        await queue.waitFor({ state: "hidden" });
      } else {
        await queue.getByRole("button", { name: "Clear queue", exact: true }).click();
        assert.match(await queue.innerText(), /The queue is empty/);
        await queue
          .getByRole("button", { name: "Undo queue change", exact: true })
          .click();
        assert.match(await queue.innerText(), /SHOW[\s\S]*Cache Ram/);
        assert.equal(
          await page
            .getByRole("button", { name: "Modified firmware image", exact: true })
            .isDisabled(),
          true,
        );
      }
      await page.evaluate(() => window.sessionReadProbe.releaseDigest());
      await page.waitForFunction(() => window.sessionReadProbe.digestDelivered);
      if (probeClosedRejection) {
        for (const name of ["Modified firmware image", "Output details"])
          assert.equal(
            await page.getByRole("button", { name, exact: true }).isDisabled(),
            false,
          );
        const retained = await downloadVerifiedOutput(
          page,
          path.join(work, "output-retained.bin"),
          false,
        );
        assert(
          retained.equals(readyOutput),
          "Retained output must match without logging bytes.",
        );
        await page
          .getByRole("button", { name: "Change queue (1)", exact: true })
          .click();
      }
      assert.match(await queue.innerText(), /SHOW[\s\S]*Cache Ram/);
      assert.equal(await queue.getByRole("alert").count(), 0);
      assert.equal(await queue.getByText("Validating queue session…").count(), 0);
      assert.equal(await queue.getByText(/Queue session loaded/).count(), 0);
      for (const name of ["Modified firmware image", "Output details"])
        assert.equal(
          await page.getByRole("button", { name, exact: true }).isDisabled(),
          !probeClosedRejection,
        );
      console.log(
        probeClosedRejection
          ? "CLOSED_DIALOG_OLD_NATIVE_HASH_NO_STALE_REJECTION_READY_OUTPUT_RETAINED"
          : "OLD_NATIVE_HASH_DELIVERED_NO_STALE_REJECTION_OUTPUT_STAYS_INVALIDATED",
      );
      if (!probeClosedRejection)
        assert.equal(
          await queue
            .getByRole("button", { name: "Redo queue change", exact: true })
            .isDisabled(),
          false,
        );

      const before = await page.evaluate(() => window.sessionReadProbe.hashes);
      await sessionInput.setInputFiles(invalidPath);
      const rejection = queue.getByRole("alert");
      await rejection.waitFor();
      assert.match(await rejection.innerText(), /targets a missing or ambiguous item/);
      assert.equal(
        await page.evaluate(() => window.sessionReadProbe.hashes),
        before + 2,
      );
      assert.match(await queue.innerText(), /SHOW[\s\S]*Cache Ram/);
      for (const name of ["Modified firmware image", "Output details"])
        assert.equal(
          await page.getByRole("button", { name, exact: true }).isDisabled(),
          !probeClosedRejection,
        );
      console.log(
        "CURRENT_PAUSED_MISSING_ITEM_REJECTED_ATOMICALLY_WITH_TWO_NATIVE_HASHES",
      );
      if (!probeClosedRejection)
        assert.equal(
          await queue
            .getByRole("button", { name: "Redo queue change", exact: true })
            .isDisabled(),
          false,
        );
      const retryHashes = await page.evaluate(() => window.sessionReadProbe.hashes);
      await sessionInput.setInputFiles(path.join(work, "session-v2.json"));
      await page.waitForFunction(
        (count) => window.sessionReadProbe.hashes === count + 2,
        retryHashes,
      );
      await waitForDisabled(
        queue.getByRole("button", { name: "Save queue session", exact: true }),
        false,
      );
      await waitForDisabled(
        page.getByRole("button", { name: "Modified firmware image", exact: true }),
        true,
      );
      assert.equal(await queue.getByRole("alert").count(), 0);
      assert.equal(
        await queue
          .getByRole("button", { name: "Redo queue change", exact: true })
          .isDisabled(),
        true,
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Modified firmware image", exact: true })
          .isDisabled(),
        true,
      );
      console.log("VALID_RETRY_CLEARED_ALERT_AND_INVALIDATED_OUTPUT");
      await queue.getByRole("button", { name: "Apply selected", exact: true }).click();
      await queue.getByRole("button", { name: "Close", exact: true }).click();
      const retry = await downloadVerifiedOutput(
        page,
        path.join(work, "output-retry.bin"),
      );
      assert(
        retry.equals(readyOutput),
        "Retry output must match without logging bytes.",
      );
      await page.getByRole("button", { name: "Change queue (1)", exact: true }).click();
      console.log("VALID_RETRY_FRESH_OUTPUT_VERIFIED");
    }

    await queue.getByRole("button", { name: "Clear queue", exact: true }).click();
    const sessionInput = queue.getByLabel("Load queue session file");
    const hashesBeforeLoad = probeSessionRead
      ? await page.evaluate(() => window.sessionReadProbe.hashes)
      : 0;
    await sessionInput.setInputFiles(path.join(work, "session-v2.json"));
    await queue.getByRole("button", { name: "Apply selected", exact: true }).waitFor();
    await waitForDisabled(
      queue.getByRole("button", { name: "Apply selected", exact: true }),
      false,
    );
    assert.match(await queue.innerText(), /SHOW[\s\S]*Cache Ram/);
    if (probeSessionRead) {
      assert.equal(
        await page.evaluate(() => window.sessionReadProbe.hashes),
        hashesBeforeLoad + 2,
        "Current load must run both real source/template digests.",
      );
      console.log("CURRENT_LOAD_TWO_NATIVE_DIGESTS_POSITIVE_CONTROL");
    }
    await queue.getByRole("button", { name: "Apply selected", exact: true }).click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    await downloadVerifiedOutput(page, path.join(work, "output-v2.bin"));
    console.log("V2_RESTORED_OUTPUT_VERIFIED");

    const v1 = structuredClone(v2);
    v1.version = 1;
    v1.operations = v1.operations.map(({ itemOffset, enabled }) => ({
      itemOffset,
      enabled,
    }));
    fs.writeFileSync(path.join(work, "session-v1.json"), JSON.stringify(v1));
    await page.getByRole("button", { name: "Change queue (1)", exact: true }).click();
    await sessionInput.setInputFiles(path.join(work, "session-v1.json"));
    await waitForDisabled(
      page.getByRole("button", { name: "Modified firmware image", exact: true }),
      true,
    );
    await queue.getByRole("button", { name: "Apply selected", exact: true }).click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    await downloadVerifiedOutput(page, path.join(work, "output-v1.bin"));
    assert(
      fs
        .readFileSync(path.join(work, "output-v1.bin"))
        .equals(fs.readFileSync(path.join(work, "output-v2.bin"))),
      "The v1 and v2 complete images must match without logging private bytes.",
    );
    console.log("V1_MIGRATED_OUTPUT_IDENTICAL_AND_VERIFIED");

    await page.reload();
    await page
      .locator("input[type=file]")
      .first()
      .setInputFiles(
        path.join(
          work,
          readProbeMode === "reject"
            ? "output-retry.bin"
            : probeReadyOutput
              ? "output-retained.bin"
              : "output-v2.bin",
        ),
      );
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
    console.log("ACTUAL_DOWNLOAD_REOPENED_CACHE_RAM_SHOW_ALREADY_APPLIED");
    await page.getByRole("button", { name: "Change queue (0)", exact: true }).click();
    const reopenedQueue = page.getByRole("dialog", {
      name: "Change queue",
      exact: true,
    });
    await reopenedQueue
      .getByLabel("Load queue session file")
      .setInputFiles(path.join(work, "session-v2.json"));
    const rejection = reopenedQueue.getByRole("alert");
    await rejection.waitFor();
    assert.match(await rejection.innerText(), /different firmware image or template/);
    assert.equal(
      await page
        .getByRole("button", { name: "Modified firmware image", exact: true })
        .isDisabled(),
      true,
    );
    console.log("REOPENED_OUTPUT_REJECTED_ORIGINAL_SESSION_EMPTY_QUEUE");
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
