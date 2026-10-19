// Opt-in deployed Firefox acceptance for exact Tiano combined v2/v1 sessions.
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
assert.equal(sourceBytes.length, 8388608);
assert.equal(
  sha256(sourceBytes),
  "297390ca838c455791a5bf3a3f0001fbf36a8cb31be362ea2123b8df84dfffe8",
);

const expectedOutputSha =
  "264f90a0934848916bdc3e123564ce5c67c068faa6c48ee03e756f7c21f3aaae";
const work = fs.mkdtempSync(path.join(os.tmpdir(), "uefi-tiano-session-firefox-"));
fs.writeFileSync(path.join(work, "source.bin"), sourceBytes);

function assertMetadataOnly(session, selection = [true, true, true, true]) {
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
      enabled: selection[0],
    },
    {
      action: "ami-values",
      changes: [{ formIndex: 0, childIndex: 1, field: "accessLevel", value: "00" }],
      enabled: selection[1],
    },
    {
      action: "suppressions",
      changes: [{ conditionIndex: 5, active: false }],
      enabled: selection[2],
    },
    {
      action: "ami-roots",
      changes: [{ rootIndex: 4, visible: false }],
      enabled: selection[3],
    },
  ]);
  assert.deepEqual(
    session.operations.map((op) => op.action),
    ["move-ref", "ami-values", "suppressions", "ami-roots"],
  );
  assert.deepEqual(
    session.operations.map((op) => op.enabled),
    selection,
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
  console.log("COMPLETE_SPI_VERIFIED", {
    size: output.length,
    sha256: sha256(output),
    changed,
    outsideOwners,
    outsideBios,
  });
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
    console.log("V2_EXPORTED_METADATA_ONLY", JSON.stringify(v2.operations));

    // Legacy menu-actions v1 retains explicit selectors, not the Ref-only kind.
    fs.writeFileSync(
      path.join(work, "session-v1.json"),
      JSON.stringify({ ...v2, version: 1 }),
    );
    let baseline;
    for (const version of [2, 1]) {
      await queue.getByRole("button", { name: "Clear queue", exact: true }).click();
      assert.match(await queue.innerText(), /The queue is empty/);
      const sessionInput = queue.getByLabel("Load queue session file");
      const sessionText = JSON.stringify({ ...v2, version });
      const boundaryFile = path.join(work, `session-limit-v${version}.json`);
      fs.writeFileSync(boundaryFile, sessionText.padEnd(1024 * 1024, " "));
      assert.equal(fs.statSync(boundaryFile).size, 1024 * 1024);
      await sessionInput.setInputFiles(boundaryFile);
      await waitForDisabled(
        queue.getByRole("button", { name: "Apply selected", exact: true }),
        false,
      );
      assert.match(await queue.innerText(), /MOVE[\s\S]*DRAM Timing Control/);
      assert.match(await queue.innerText(), /Show 1 suppressed item/);
      assert.match(await queue.innerText(), /Boot/);
      assert.match(await queue.innerText(), /4 SELECTED/);
      for (const name of [
        "Check firmware output",
        "Modified firmware image",
        "Output details",
      ])
        assert.equal(
          await page.getByRole("button", { name, exact: true }).isDisabled(),
          true,
        );
      const migratedDownload = page.waitForEvent("download");
      await queue
        .getByRole("button", { name: "Save queue session", exact: true })
        .click();
      const migratedPath = path.join(work, `migrated-v${version}.json`);
      await (await migratedDownload).saveAs(migratedPath);
      const migrated = JSON.parse(fs.readFileSync(migratedPath, "utf8"));
      assertMetadataOnly(migrated);
      assert.deepEqual(
        migrated,
        v2,
        "Every ordered selector and identity must survive restore/migration",
      );
      console.log("RESTORED_IDENTICAL_METADATA_ONLY_V2_UNAPPLIED", version);
      await queue.getByRole("button", { name: "Apply selected", exact: true }).click();
      await queue.getByRole("button", { name: "Close", exact: true }).click();
      const output = await downloadVerifiedOutput(
        page,
        path.join(work, `output-v${version}.bin`),
      );
      if (baseline)
        assert(
          output.equals(baseline),
          "v1 and v2 must rebuild byte-identical complete SPIs",
        );
      else baseline = output;
      console.log("RESTORED_OUTPUT_VERIFIED", version);
      await page.getByRole("button", { name: "Change queue (4)", exact: true }).click();

      const nonBoolean = structuredClone({ ...v2, version });
      nonBoolean.operations[0].enabled = "false";
      const unknownAction = structuredClone({ ...v2, version });
      unknownAction.operations[0].action = "write-bytes";
      const rejectedInputs = [
        ["malformed-json", "{", /is not valid JSON/],
        [
          "file-limit",
          sessionText.padEnd(1024 * 1024 + 1, " "),
          /exceeds the 1 MiB file limit/,
        ],
        [
          "future-version",
          JSON.stringify({ ...v2, version: 3 }),
          /unsupported format, version or editor kind/,
        ],
        [
          "unknown-field",
          JSON.stringify({ ...v2, version, firmware: [] }),
          /unsupported format, version or editor kind/,
        ],
        ["non-boolean", JSON.stringify(nonBoolean), /has an invalid Ref move/],
        ["unknown-action", JSON.stringify(unknownAction), /invalid menu action/],
        [
          "operation-limit",
          JSON.stringify({
            ...v2,
            version,
            operations: Array(1001).fill(v2.operations[0]),
          }),
          /too many or invalid operations/,
        ],
      ];
      for (const [name, text, error] of rejectedInputs) {
        const file = path.join(work, `invalid-${name}-v${version}.json`);
        fs.writeFileSync(file, text);
        assert.equal(fs.statSync(file).size, Buffer.byteLength(text));
        await sessionInput.setInputFiles(file);
        const alert = queue.getByRole("alert");
        await alert.waitFor();
        assert.match(await alert.innerText(), error);
        assert.deepEqual(
          await queue
            .getByRole("checkbox")
            .evaluateAll((boxes) => boxes.map((box) => box.checked)),
          [true, true, true, true],
        );
        for (const name of [
          "Check firmware output",
          "Modified firmware image",
          "Output details",
        ])
          assert.equal(
            await page.getByRole("button", { name, exact: true }).isDisabled(),
            false,
          );
        const saved = page.waitForEvent("download");
        await queue
          .getByRole("button", { name: "Save queue session", exact: true })
          .click();
        const exported = path.join(work, `retained-${name}-v${version}.json`);
        await (await saved).saveAs(exported);
        const retained = JSON.parse(fs.readFileSync(exported, "utf8"));
        assertMetadataOnly(retained);
        assert.deepEqual(retained, v2);
        assert.equal(await queue.getByRole("alert").count(), 0);
        console.log("INVALID_SESSION_ATOMIC_READY_QUEUE_RETAINED", version, name);
      }
      await queue.getByRole("button", { name: "Close", exact: true }).click();
      const retainedDownload = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Modified firmware image", exact: true })
        .click();
      const retainedFile = path.join(work, `output-retained-v${version}.bin`);
      await (await retainedDownload).saveAs(retainedFile);
      assert(verifyOutput(retainedFile).equals(baseline));
      console.log("REJECTIONS_RETAINED_ACTUAL_CACHED_SPI_IDENTICAL", version);
      await page.getByRole("button", { name: "Change queue (4)", exact: true }).click();
    }

    const emptySession = { ...v2, operations: [] };
    async function saveExactSession(name, expected) {
      const saved = page.waitForEvent("download");
      await queue
        .getByRole("button", { name: "Save queue session", exact: true })
        .click();
      const file = path.join(work, name);
      await (await saved).saveAs(file);
      assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), expected);
    }
    async function assertHistoryState(empty) {
      if (empty) await queue.getByText(/The queue is empty/).waitFor();
      else
        await waitForDisabled(
          queue.getByRole("button", { name: "Apply selected", exact: true }),
          false,
        );
      assert.deepEqual(
        await queue
          .getByRole("checkbox")
          .evaluateAll((boxes) => boxes.map((box) => box.checked)),
        empty ? [] : [true, true, true, true],
      );
      assert.equal(
        await queue
          .getByRole("button", { name: "Apply selected", exact: true })
          .isDisabled(),
        empty,
      );
      for (const name of [
        "Check firmware output",
        "Modified firmware image",
        "Output details",
      ])
        assert.equal(
          await page.getByRole("button", { name, exact: true }).isDisabled(),
          true,
        );
    }
    for (const version of [2, 1]) {
      const emptyFile = path.join(work, `empty-v${version}.json`);
      fs.writeFileSync(emptyFile, JSON.stringify({ ...emptySession, version }));
      const wrongIdentity = path.join(work, `empty-wrong-source-v${version}.json`);
      fs.writeFileSync(
        wrongIdentity,
        JSON.stringify({
          ...emptySession,
          version,
          source: { ...v2.source, sha256: "0".repeat(64) },
        }),
      );
      await queue.getByLabel("Load queue session file").setInputFiles(wrongIdentity);
      const rejected = queue.getByRole("alert");
      await rejected.waitFor();
      assert.match(
        await rejected.innerText(),
        /different firmware image or opened HII context/,
      );
      for (const name of [
        "Check firmware output",
        "Modified firmware image",
        "Output details",
      ])
        assert.equal(
          await page.getByRole("button", { name, exact: true }).isDisabled(),
          false,
        );
      await saveExactSession(`empty-rejection-retained-v${version}.json`, v2);
      assert.equal(await queue.getByRole("alert").count(), 0);
      await queue.getByLabel("Load queue session file").setInputFiles(emptyFile);
      await assertHistoryState(true);
      await saveExactSession(`empty-export-v${version}.json`, emptySession);
      const undo = queue.getByRole("button", {
        name: "Undo queue change",
        exact: true,
      });
      const redo = queue.getByRole("button", {
        name: "Redo queue change",
        exact: true,
      });
      await undo.click();
      await assertHistoryState(false);
      await saveExactSession(`empty-undo-v${version}.json`, v2);
      await redo.click();
      await assertHistoryState(true);
      await saveExactSession(`empty-redo-v${version}.json`, emptySession);
      await undo.click();
      await assertHistoryState(false);
      await saveExactSession(`empty-final-undo-v${version}.json`, v2);
      console.log("EMPTY_SESSION_IDENTITY_CLEAR_SINGLE_UNDO_REDO_NO_OUTPUT", version);
      await queue.getByRole("button", { name: "Apply selected", exact: true }).click();
      await queue.getByRole("button", { name: "Close", exact: true }).click();
      assert(
        (
          await downloadVerifiedOutput(
            page,
            path.join(work, `output-empty-undo-v${version}.bin`),
          )
        ).equals(baseline),
      );
      console.log("EMPTY_SESSION_UNDO_FRESH_SPI_IDENTICAL", version);
      await page.getByRole("button", { name: "Change queue (4)", exact: true }).click();
    }

    const selection = [true, false, false, false];
    const paused = structuredClone(v2);
    paused.operations.forEach((op, index) => {
      op.enabled = selection[index];
    });
    assertMetadataOnly(paused, selection);
    const pausedFile = path.join(work, "session-paused-v1.json");
    fs.writeFileSync(pausedFile, JSON.stringify({ ...paused, version: 1 }));
    await queue.getByLabel("Load queue session file").setInputFiles(pausedFile);
    await page.waitForFunction(() => {
      const boxes = [
        ...document.querySelectorAll('[role="dialog"] input[type="checkbox"]'),
      ];
      return (
        boxes.length === 4 && boxes.every((box, index) => box.checked === (index === 0))
      );
    });
    const assertSelection = async () =>
      assert.deepEqual(
        await queue
          .getByRole("checkbox")
          .evaluateAll((boxes) => boxes.map((box) => box.checked)),
        selection,
      );
    const assertOutputControls = async (disabled) => {
      for (const name of [
        "Check firmware output",
        "Modified firmware image",
        "Output details",
      ])
        assert.equal(
          await page.getByRole("button", { name, exact: true }).isDisabled(),
          disabled,
        );
    };
    const exportPaused = async (file) => {
      const downloaded = page.waitForEvent("download");
      await queue
        .getByRole("button", { name: "Save queue session", exact: true })
        .click();
      const destination = path.join(work, file);
      await (await downloaded).saveAs(destination);
      const restored = JSON.parse(fs.readFileSync(destination, "utf8"));
      assertMetadataOnly(restored, selection);
      assert.deepEqual(restored, paused);
    };
    await assertSelection();
    await assertOutputControls(true);
    await exportPaused("paused-migrated-v2.json");
    await queue.getByRole("button", { name: "Apply selected", exact: true }).click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    await downloadVerifiedOutput(
      page,
      path.join(work, "output-paused.bin"),
      "move-only",
    );
    console.log("PAUSED_V1_MIGRATED_FRESH_MOVE_ONLY_SPI_VERIFIED");
    await page.getByRole("button", { name: "Change queue (4)", exact: true }).click();
    const invalid = { ...structuredClone(paused), version: 1 };
    invalid.operations[3].changes[0].rootIndex = 999;
    assert.equal(invalid.operations[3].enabled, false);
    const invalidFile = path.join(work, "invalid-paused-root-v1.json");
    fs.writeFileSync(invalidFile, JSON.stringify(invalid));
    await queue.getByLabel("Load queue session file").setInputFiles(invalidFile);
    const rejection = queue.getByRole("alert");
    await rejection.waitFor();
    assert.match(await rejection.innerText(), /targets a missing or ambiguous root/);
    await assertSelection();
    await assertOutputControls(false);
    await exportPaused("retained-paused-v2.json");
    console.log("INVALID_PAUSED_V1_ROOT_REJECTED_ATOMICALLY_READY_OUTPUT_RETAINED");
    for (const checkbox of (await queue.getByRole("checkbox").all()).slice(1)) {
      await checkbox.check();
      await assertOutputControls(true);
    }
    await queue.getByRole("button", { name: "Apply selected", exact: true }).click();
    await queue.getByRole("button", { name: "Close", exact: true }).click();
    const reselected = await downloadVerifiedOutput(
      page,
      path.join(work, "output-reselected.bin"),
    );
    assert(
      reselected.equals(baseline),
      "Reselection must reproduce the full SPI exactly",
    );
    console.log("PAUSED_V1_RESELECTION_FULL_SPI_IDENTICAL");

    for (const variant of [
      "v2",
      "v1",
      "retained-v2",
      "retained-v1",
      "empty-undo-v2",
      "empty-undo-v1",
      "paused",
      "reselected",
    ]) {
      const moveOnly = variant === "paused";
      await page.reload();
      await openSource(page, path.join(work, `output-${variant}.bin`));
      const readDownload = page.waitForEvent("download");
      await page.getByRole("button", { name: "data.json", exact: true }).nth(1).click();
      const reopenedPath = path.join(work, `reopened-${variant}.json`);
      await (await readDownload).saveAs(reopenedPath);
      const reopened = JSON.parse(fs.readFileSync(reopenedPath, "utf8"));
      assert.equal(reopened.forms.length, 70);
      assert.equal(reopened.forms[0].children[1].accessLevel, moveOnly ? "01" : "00");
      assert.deepEqual(
        reopened.rootVisibility.entries.map((entry) => entry.value),
        moveOnly ? [1, 1, 1, 1, 1, 1, 1] : [1, 1, 1, 1, 0, 1, 1],
      );
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
      if (moveOnly)
        assert(
          Number.parseInt(suppression.end, 16) > Number.parseInt(suppression.start, 16),
        );
      else assert.equal(suppression.start, suppression.end);
      assert.equal(suppression.expression, condition.expression);
      console.log("INDEPENDENT_SELECTION_REREAD", variant);
      await page.getByRole("button", { name: "Change queue (0)", exact: true }).click();
      const reopenedQueue = page.getByRole("dialog", {
        name: "Change queue",
        exact: true,
      });
      await reopenedQueue
        .getByLabel("Load queue session file")
        .setInputFiles(
          moveOnly
            ? pausedFile
            : path.join(work, `session-${variant.endsWith("v2") ? "v2" : "v1"}.json`),
        );
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
