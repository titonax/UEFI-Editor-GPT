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
The controlled native file-read cancellation gate below now also passes
separately. Real-browser stale failures, pending checksum/build boundaries and
other asynchronous interleavings remain pending; synthetic tests do not
establish those gates.

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

## Controlled native JSON-read cancellation in Firefox

Reproduced on 2026-10-15 against deployed
`5fc72dbf798448b16b43888e25250449d089e871` (merged PR #169).
[Code quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/38681855123)
and [Pages](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/38681855072)
were successful for that exact SHA. Firefox 153.0 / Playwright 1.62.1 build 1538,
headless Linux at 1600 × 1000, loaded the same production JS/CSS/WASM assets
listed above. The exact authorized source was recovered afresh and size/SHA-256
verified before this run; no previous temporary input was used.

This is explicitly a **controlled-timing browser probe**, not uninstrumented
scheduling. After an ordinary positive control and baseline build, the checker
wraps `File.prototype.text` for one selected local JSON file only. It forwards
the original receiver/arguments to the native method, waits for the real native
read to finish, and holds delivery of that exact text behind a Promise gate.
No file contents, hashes, parser/codec/builder results or validation decisions
are substituted. Other file reads forward normally. The shim exists only in
the private test page, not in application code.

1. Export the original base and change only Security's mapped flags from `01`
   to `05` in local source-bound JSON. Import this exact file normally first:
   the queue becomes one entry and a fresh export confirms Security `05`.
   This positive control proves current import acceptance, not binary output
   acceptance for that value. Clear the queue.
2. Stage the normal accepted four-operation queue, Apply/Check and download a
   real baseline. Select the positively tested JSON again, now under the gate.
   Assert one native read call, one completed native read, zero delivered text
   results and one held result. The old import remains outstanding.
3. Load another firmware and reopen the identical source in the same document.
   Verify original base/empty queue/history/Apply and no cached output. Stage
   the accepted four operations again and run a fresh Check. Download the new
   verified SPI while the old real text is still held.
4. Release the exact old native text. Drain microtasks across two animation
   frames; assert one delivered result and no held read. The reviewed importer
   checks source/lifetime immediately after this await and returns on stale
   context before parsing or starting another asynchronous checksum operation.
   The queue remains four entries, output/details stay enabled, no output error
   appears and a fresh editor export retains Security `00`, not stale `05`.
   Explicitly download the cached output again without another Check.
5. Restore the native text method. Close/open the actual post-delivery download
   and run ordinary independent extraction. All four requested edits and 70
   Forms match the read-back assertions above. Navigation count and document
   time origin remain unchanged; no application page errors occurred.

All three explicit downloads are byte-identical complete 8,388,608-byte SPI
images with the accepted output SHA-256 above, 140,913 changes within the two
original FFS owners, zero outside those owners or BIOS, and all 1,572,864
non-BIOS bytes unchanged. Private inputs/JSON/downloads remain local and the
checker removes its private intermediates on exit.

```bash
FIRMWARE_ACCEPTANCE_IMAGE=/path/to/source.bin \
node scripts/firmware-tiano-pending-json-firefox-acceptance.mjs
```

Browser options and the unchanged 15-minute output-check limit match the
preceding executable. Public CI never supplies the private source. This probes
one exact native file-read success boundary using the actual browser, source,
editor, queue, engine and independent readers. It is distinct from synthetic
React/jsdom, an injected read failure, ordinary browser scheduling and hardware.
The discarded import's full return is not exposed/captured; the measured event
is native text delivery and its reviewed immediate stale-return continuation.
No successful old import is claimed. Read rejections, pending checksum races,
pending build replacement, latest-import supersession, other interleavings,
sources/families and hardware remain separate gates. Review this probe again if
the stale branch gains another asynchronous boundary.
