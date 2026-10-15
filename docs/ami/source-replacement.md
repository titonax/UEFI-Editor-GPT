# AMI same-page source replacement

Implemented on 2026-10-15 as a bounded phase-10 UI lifecycle change.

The AMI footer now offers **Load another firmware**, as the HII and Phoenix
footers already did. It returns to image selection without reloading the page.
App drops the opened extracted files/provenance, replaces the editor base with
empty data, resets the selected Form and clears the previous error. The normal
queue source reset discards entries, Apply and both histories. Unmounting the
footer drops its verified output/report and cancels pending queue-session and
build completions through their existing guards. Reopening identical bytes is
a fresh workspace, not restoration of a checked output.

The legacy AMI `data.json` import now also has a source/lifetime request guard.
Closing invalidates it synchronously; file-context replacement and unmount
invalidate it in layout cleanup. After each asynchronous file-read/checksum
boundary, stale success, validation failure and rejection cannot enqueue data,
overwrite the new workspace's error or reset its file input. A newer JSON import
also supersedes a pending older import. Version, source-hash, offset-checksum,
binary hydration, root-plan and navigation checks are unchanged.

## Reproducible synthetic validation

```bash
npm ci
npx vitest run src/App.test.tsx src/components/Footer/Footer.test.tsx
npm run check
```

`App.test.tsx` exercises App and the actual queue with synthetic extraction and
layout boundaries: select source, select Form, stage/apply, close, return to
upload and reopen with no entries, Apply, history, selection or previous error.
`Footer.test.tsx` exercises the real footer/queue with a mocked binary builder:

- Close verified output and reopen with download/check/history disabled.
- Complete or reject an old build only after a newly opened source is verified;
  retain the new output and download filename, without rebuilding on download.
- Complete or reject an old file read after close/reopen; discard it silently.
- Finish a pending checksum after replacing files; discard the stale diagnostic
  while still reporting the same invalid checksum for a current import.

These are React/jsdom lifecycle tests with synthetic data and controlled
Promises, not a real-source engine rerun, Firefox or hardware acceptance. No
firmware was required or recovered for this implementation block. Existing
Tiano Firefox records remain scoped to their recorded revisions and flows.
The exact Tiano same-document gate now passes separately as recorded below.
Real-browser stale failures, pending-import cancellation and other asynchronous
boundaries remain pending; the synthetic tests do not establish those gates.

No parser, codec, checksum algorithm, allocation capacity, source acceptance,
writer or independent reader changed. Full-SPI preservation requirements and
unsupported compression/growth/capsule/root gates remain unchanged. Missing
qualifying uncompressed AMI/mixed-HII sources and hardware acceptance remain open;
new BIOS intake and P53 dynamic-root research remain parked.

## Exact deployed Tiano Firefox acceptance

Reproduced on 2026-10-15 at <https://titonax.github.io/UEFI-Editor-GPT/>
against `805e0f801fcddd96618945a35688568ebf33622b` (merged PR #168).
[Code quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/38676914368)
and [Pages](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/38676914424)
were successful for that exact SHA. Firefox 153.0 / Playwright 1.62.1 build
1538, headless Linux, 1600 × 1000, loaded `index-DWQ-9pFS.js`,
`index-D4JOsfQ5.css`, `tiano-decompress.wasm` and `ifrextractor.wasm`.
The browser and application APIs, codecs, timing and results were not replaced.

1. Freshly recover the authorized original source and verify its 8,388,608-byte
   size and SHA-256
   `297390ca838c455791a5bf3a3f0001fbf36a8cb31be362ea2123b8df84dfffe8`.
2. Open it in deployed Firefox and stage the accepted four operations: DRAM Ref
   move from Form 3 to Form 5, Security flags `01` → `00`, the source-bound
   suppression override at `0x8B359`, and hide Boot. As in the
   [combined record](tiano-combined-queue-acceptance.md), the unassociated
   suppression uses local `data.json`; the other three use direct controls.
   Apply/Check and explicitly download the verified complete SPI.
3. Click **Load another firmware**. The uploader returns, and queue, output and
   report controls are absent. Select the identical source in that same page.
   Check/download/details are disabled; the empty queue has Apply, Undo and Redo
   disabled. Export the freshly parsed base: 70 Forms, original Security `01`,
   Boot value one, DRAM Ref present only in Form 3 and suppression still active.
4. Stage/apply the same four operations afresh. Output/details remain disabled
   until a new Check completes. Download the newly verified SPI and compare
   every byte with the pre-replacement output: identical.
5. Close again and open the actual new download using normal fresh extraction,
   without a page reload. Exported data independently confirms all 70 Forms,
   Security `00`, Boot zero, no DRAM Ref in Form 3 and exactly one in Form 5,
   and an empty suppression body (`start === end`) at `0x8B359`. The newly
   opened output has no cached downloadable result.

The main-frame navigation count and `performance.timeOrigin` remain unchanged
after both replacements and the output reanalysis. This proves a same-document
transition, not the page-reload history reset established by earlier records.
No application page errors occurred.

Both downloads are complete 8,388,608-byte SPI images with SHA-256
`264f90a0934848916bdc3e123564ce5c67c068faa6c48ee03e756f7c21f3aaae`.
Each has 140,913 changed bytes, all within original FFS owners
`[3239384, 3419918)` and `[4612464, 4781106)`. All 1,572,864 non-BIOS bytes
are unchanged. The builder also performs its normal independent full-image
verification before enabling each download. Private firmware, JSON and downloads
remain local; the checker removes its private intermediates on exit.

```bash
FIRMWARE_ACCEPTANCE_IMAGE=/path/to/source.bin \
node scripts/firmware-tiano-source-replacement-firefox-acceptance.mjs
```

Browser options match [Tiano history acceptance](tiano-history-firefox-acceptance.md).
Each output check retains its 15-minute limit. The checker selects `.bin` and
`.json` download events explicitly, never the companion changelog. Public CI
does not supply this private source or run this opt-in acceptance. An initial
attempt verified the first SPI but then timed out because its uploader assertion
incorrectly expected the analysis button before selecting a file. After fixing
that selector, the complete flow above reran successfully; the failed attempt
is not counted as acceptance.

This accepts one exact-source ready-output replacement lifecycle in real
Firefox with the actual engine/codecs/queue/readers. It is not acceptance of
replacement during an outstanding build/import, stale asynchronous failures,
other sources/families, a native desktop file-picker dialog or hardware.
