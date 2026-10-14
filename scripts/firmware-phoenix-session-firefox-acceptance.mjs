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

    await queue.getByRole("button", { name: "Clear queue", exact: true }).click();
    const sessionInput = queue.getByLabel("Load queue session file");
    await sessionInput.setInputFiles(path.join(work, "session-v2.json"));
    await queue.getByRole("button", { name: "Apply selected", exact: true }).waitFor();
    await waitForDisabled(
      queue.getByRole("button", { name: "Apply selected", exact: true }),
      false,
    );
    assert.match(await queue.innerText(), /SHOW[\s\S]*Cache Ram/);
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
    assert.deepEqual(
      fs.readFileSync(path.join(work, "output-v1.bin")),
      fs.readFileSync(path.join(work, "output-v2.bin")),
    );
    console.log("V1_MIGRATED_OUTPUT_IDENTICAL_AND_VERIFIED");

    await page.reload();
    await page
      .locator("input[type=file]")
      .first()
      .setInputFiles(path.join(work, "output-v2.bin"));
    await page
      .getByRole("button", { name: "Start Phoenix Setup analysis", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Change queue (0)", exact: true })
      .waitFor({ timeout: 240000 });
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
