// Opt-in deployed Firefox acceptance for the exact P53 static Ref queue session.
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
assert.equal(sourceBytes.length, 33554432);
assert.equal(
  sha256(sourceBytes),
  "68eba5b369baf36c879551c0482a6feea31d68082bc4dd0631bf9e4427a88a64",
);

const expectedOutputSha =
  "4c52549b9df88a7763eedf4fa0cf842909d800431b10a88c76d73c851792d10b";
const work = fs.mkdtempSync(path.join(os.tmpdir(), "uefi-p53-session-firefox-"));
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
  assert.equal(session.operations.length, 1);
  assert.deepEqual(Object.keys(session.operations[0]).sort(), [
    "action",
    "destinationFormIndex",
    "enabled",
    "referenceChildIndex",
    "sourceFormIndex",
  ]);
  assert.equal(session.operations[0].action, "move-ref");
  assert.equal(session.operations[0].enabled, true);
  for (const field of [
    "sourceFormIndex",
    "referenceChildIndex",
    "destinationFormIndex",
  ]) {
    assert.equal(Number.isSafeInteger(session.operations[0][field]), true);
    assert.equal(session.operations[0][field] >= 0, true);
  }
  assert.doesNotMatch(
    JSON.stringify(session),
    /patches|expected|replacement|ifrBinary|Debug Settings|PCI Subsystem Settings|history|applied|fileName/,
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
    const inFirstOwner = index >= 13238344 && index < 17752012;
    const inSecondOwner = index >= 21495880 && index < 26009548;
    if (!inFirstOwner && !inSecondOwner) outsideOwners += 1;
    if (index < 10485760) outsideBios += 1;
  }
  assert.equal(changed, 8991518);
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
      name: "Start vendor-neutral HII analysis",
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
      name: "Move Debug Settings menu",
      exact: true,
    });
    assert.equal(await moves.count(), 1);
    await moves.click();
    const destination = page.getByPlaceholder("Choose the new parent menu");
    await destination.fill("PCI Subsystem Settings");
    await page
      .getByText(/^Safe · PCI Subsystem Settings ·/)
      .last()
      .click();
    await page
      .getByRole("dialog", { name: "Move HII menu", exact: true })
      .getByRole("button", { name: "Move menu", exact: true })
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
    assertMetadataOnly(v2);
    console.log("V2_EXPORTED_METADATA_ONLY", JSON.stringify(v2.operations[0]));

    await queue.getByRole("button", { name: "Clear queue", exact: true }).click();
    const sessionInput = queue.getByLabel("Load queue session file");
    await sessionInput.setInputFiles(path.join(work, "session-v2.json"));
    await waitForDisabled(
      queue.getByRole("button", { name: "Apply selected", exact: true }),
      false,
    );
    assert.match(await queue.innerText(), /MOVE[\s\S]*Debug Settings/);
    await queue.getByRole("button", { name: "Apply selected", exact: true }).click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    await downloadVerifiedOutput(page, path.join(work, "output-v2.bin"));
    console.log("V2_RESTORED_OUTPUT_VERIFIED");

    const v1 = structuredClone(v2);
    v1.version = 1;
    v1.kind = "hii-ref-moves";
    v1.operations = v1.operations.map(
      ({ sourceFormIndex, referenceChildIndex, destinationFormIndex, enabled }) => ({
        sourceFormIndex,
        referenceChildIndex,
        destinationFormIndex,
        enabled,
      }),
    );
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
    await openSource(page, path.join(work, "output-v2.bin"));
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
    assert.match(
      await rejection.innerText(),
      /different firmware image or opened HII context/,
    );
    assert.match(await reopenedQueue.innerText(), /The queue is empty/);
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
