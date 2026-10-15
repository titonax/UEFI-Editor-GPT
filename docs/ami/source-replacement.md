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

The pending AMI editor-JSON guard also binds the queue revision. A newer queue
mutation cancels old reads/checksums/errors even when the source stays open,
including Undo returning to identical entries. Four new React/jsdom regressions
failed before this fix: read/checksum success and rejection after a newer edit
could still report an obsolete error. They pass with revision invalidation;
an additional Undo regression checks identical restored contents. Existing
current-import rejection and source-replacement tests remain in force. This
implementation block does not claim a new real-source/Firefox rerun or hardware
acceptance; binary import checks, codecs and writer requirements are unchanged.

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
other asynchronous interleavings remain pending except for the separately scoped
native checksum-delivery and pending-build replacement probes below; synthetic tests do not
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

## Controlled native checksum cancellation after Clear/Undo

Reproduced on 2026-10-15 against deployed
`95682c65566b5cfa49512dd491a628d1c5b41da5` (merged PR #171).
[Code quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/38691787727)
and [Pages build/deploy](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/38691787721)
passed for that exact SHA. Firefox 153.0 / Playwright 1.62.1 build 1538,
headless Linux at 1600 × 1000, loaded `index-B1tQu_qt.js`,
`index-D4JOsfQ5.css`, `tiano-decompress.wasm` and `ifrextractor.wasm`.
The authorized original source was recovered afresh and its exact size and
SHA-256 checked as above.

This is a controlled-timing browser probe. The private test page wraps
`crypto.subtle.digest` for only the first SHA-256 call whose complete input
matches the positively tested JSON's offset string. The original receiver,
arguments and native digest result are forwarded unchanged. Only delivery of
that already calculated native result waits behind a Promise. Other digests
pass through normally; no checksum, bytes, codec, writer, hydration or validation
decision is substituted. Application code is unchanged.

1. Export the original base, change only Security flags to `05`, import it
   normally and verify one queue entry and exported Security `05`. Clear it.
   This is current-import acceptance, not binary-output acceptance for `05`.
2. Stage/apply the accepted four operations and Check/download a baseline.
   Select the same positively tested JSON under the digest gate. Assert one
   native call/completion, zero deliveries and one held result.
3. Without replacing the source or starting another import, Clear the four-entry
   queue and Undo back to four entries. Apply again and require a fresh Check:
   cached output/details are disabled until it completes. Download the newly
   verified SPI while the old native checksum remains held.
4. Release the exact old digest. After microtasks and two animation frames,
   assert one delivery and no held result, four queue entries, enabled verified
   output/details, no output error or load alert, and exported Security `00`,
   not stale `05`. Download the cached output without another Check.
5. Restore the native method, close/open that actual download and independently
   reanalyse all 70 Forms and four edits with the normal browser engine/readers.
   No main-frame navigation or document-time-origin change occurs; no application
   page errors occur.

All three downloads match the accepted complete 8,388,608-byte SPI SHA-256 above.
Each has exactly 140,913 changed bytes within the two original FFS owners, none
outside BIOS, and all 1,572,864 non-BIOS bytes unchanged. Private JSON, source
and downloads stay local; private checker intermediates are removed on exit.

```bash
FIRMWARE_ACCEPTANCE_IMAGE=/path/to/source.bin \
node scripts/firmware-tiano-pending-checksum-firefox-acceptance.mjs
```

Browser options match the preceding checker; each Check retains 15 minutes.
The checksum formula is checked against the exported original offset checksum
before arming the gate. The reviewed importer checks the revision-bound context
immediately after this await and returns before hydration/commit on stale state.
The probe observes native digest delivery and the resulting stale-return branch,
not a captured full old-import return or a successful old import.
This accepts one exact-source checksum-success/queue-revision boundary, including
Undo to identical entries. Ordinary scheduling, checksum rejection, source
replacement during checksum/build, other interleavings, sources and hardware
remain separate gates. Missing uncompressed AMI/mixed sources remain blocked.

## Controlled native build delivery across source replacement

Reproduced on 2026-10-15 against deployed
`ad0e4414d8f8cee6a78d25639ced7cfaa3435b22` (merged PR #172).
[Code quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/38699150936)
and [Pages build/deploy](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/38699151349)
passed for that exact SHA. Firefox 153.0 / Playwright 1.62.1 build 1538,
headless Linux at 1600 × 1000, loaded `index-B1tQu_qt.js`,
`index-D4JOsfQ5.css`, `tiano-decompress.wasm` and `ifrextractor.wasm`.
The authorized original source was recovered afresh and its size/SHA-256
verified before the run; no earlier temporary input was used.

This is a controlled-timing probe, using the native-instance delivery mechanism
reviewed in [the same-source late-completion record](tiano-late-firefox-acceptance.md).
The private page wraps `WebAssembly.instantiate`, forwarding original arguments
to the native API and returning the exact native instance/result object. Only
one already completed native instantiation's delivery waits behind a Promise;
no source, codec result, hash, allocation or verification decision is substituted.
No application code changes.

1. Stage/apply the accepted four-operation queue and Check/download a baseline.
   Measure its actual native instantiation count rather than arming a frozen
   count. This run measured 202 delivered instances, zero pending.
2. Clear/Undo/Apply the same queue, start an old Check and hold delivery of its
   last native instance: 202 calls, 201 delivered, zero native pending, one held.
   The old Check is outstanding and its output is disabled.
3. Click **Load another firmware** while that result is held. Queue/output/report
   controls disappear. Reopen identical original bytes in the same document.
   Check/output/details and empty-queue Apply/Undo/Redo are disabled. A fresh base
   export independently confirms 70 Forms, original Security `01`, Boot one,
   DRAM Ref only in Form 3 and active suppression at `0x8B359`.
4. Stage/apply all four operations anew and Check/download the new verified SPI,
   still holding the old native result. Measure the additional native calls from
   reopening separately; the new Check adds exactly the baseline's count of
   completed native instantiations. No native call remains pending.
5. Release the exact old instance, drain microtasks across two animation frames,
   and require exactly one more delivery with no extra native calls. The newer
   queue remains four entries, output/details remain enabled and no output error
   or load alert appears. Download the cached SPI without another Check or native
   instantiation and compare every byte with the newer output and baseline.
6. Restore the native API, close/open the actual post-delivery download and run
   fresh ordinary extraction. All four requested edits and 70 Forms match the
   independent read-back assertions above. Main-frame navigation count and
   document time origin remain unchanged throughout; no page errors occur.

All three downloads are complete 8,388,608-byte SPI images with SHA-256
`264f90a0934848916bdc3e123564ce5c67c068faa6c48ee03e756f7c21f3aaae`.
Each has 140,913 changed bytes confined to original FFS owners
`[3239384, 3419918)` and `[4612464, 4781106)`. All 1,572,864 non-BIOS bytes
are identical. The builder retains its normal allocation, codec, checksum,
ownership and independent complete-image verification requirements.

```bash
FIRMWARE_ACCEPTANCE_IMAGE=/path/to/source.bin \
node scripts/firmware-tiano-pending-build-replacement-firefox-acceptance.mjs
```

Browser options match the preceding checkers. Each output check and the entire
controlled race retain their 15-minute limits. Firmware, JSON and downloads
remain private/local; checker intermediates are removed on exit. Public CI does
not supply this private source or run this opt-in probe. An initial checker
attempt timed out on an unnecessary second Apply after staging had already
applied the queue; removing that redundant test action allowed the complete
flow to rerun. That failed attempt is not accepted evidence.

The observed event is native delivery and retention across its reviewed
continuation, not an exposed/captured full return from the discarded old build.
No successful old-build result is claimed. The remaining native decoder and
reader/verification/comparison continuation is synchronous or Promise microtasks;
review this probe again if a new external asynchronous boundary is added.
This adds one exact-source pending-build replacement boundary in Firefox, not
ordinary scheduling, stale build rejection, every pending-build interleaving,
other families/sources or hardware. Synthetic React/jsdom success/rejection
coverage remains separate. Other checksum races, stale failures and missing
qualifying uncompressed AMI/mixed sources remain open; P53 dynamic roots and
new BIOS intake remain parked.

## Controlled native WASM failure delivery in Firefox

Reproduced on 2026-10-15 against deployed main
`c767fbc125c0c047f6dceaad2f56966d35bf0ae6` (PR #174), Firefox 153.0,
Playwright 1.62.1, headless Linux, 1600 × 1000. Assets were
`index-B1tQu_qt.js`, `index-D4JOsfQ5.css`, `tiano-decompress.wasm` and
`ifrextractor.wasm`. Quality and automatic Pages runs for this exact SHA were
successful. This is a **fault-injection** acceptance, not spontaneous native
failure or ordinary scheduling.

The opt-in checker retains the exact Tiano source, four edits, output hash and
FFS/non-BIOS byte checks from the ready-output record above. At the first WASM
instantiation of an old Check it deliberately supplies an empty imports object
to the browser's original `WebAssembly.instantiate`, with the actual compiled
module unchanged. Firefox produces a native `TypeError`; the checker catches
and holds that exact rejection, then later throws it unchanged. Other
instantiations forward their original inputs and native results. No firmware,
codec implementation or application guard is patched.

1. Build and download a real baseline: 202 native instantiations completed.
2. Clear/Undo/Apply the four edits and hold the old Check's first native failure.
   Close/reopen the original source in the same document. Check/output/report
   are reset and disabled; queue, Apply and both histories are empty; exported
   base has all 70 Forms and the original four target values.
3. Stage/apply the four edits and build/download a new verified SPI while the
   old failure remains held. The fresh Check completes 202 native instances.
4. Deliver the old native rejection. Counters show exactly one delivered failure
   and no pending native call. Output/report remain enabled, no obsolete error
   appears, and a cached download is byte-identical without further instances.
5. Positive control: Clear/Undo/Apply again, inject the same native failure into
   the next current Check without holding it. The actual application displays
   `Output check failed:` and leaves output/report disabled. A fresh Check with
   original imports succeeds and downloads the identical SPI.
6. Restore the native API and independently reopen the actual post-race download.
   Fresh extraction confirms Security `00`, Boot zero, the DRAM Ref moved from
   Form 3 to Form 5, empty suppression at `0x8B359` and no cached output.

All four downloads have 8,388,608 bytes and SHA-256
`264f90a0934848916bdc3e123564ce5c67c068faa6c48ee03e756f7c21f3aaae`.
Each has 140,913 modified bytes, zero outside the two original FFS owners and
zero outside BIOS. Navigation count and document time origin are unchanged;
no application page errors occurred. Each Check and the replacement race retain
the existing 15-minute limit. The checker deletes private intermediates on exit.

```bash
FIRMWARE_ACCEPTANCE_IMAGE=/path/to/source.bin \
node scripts/firmware-tiano-late-failure-firefox-acceptance.mjs
```

Browser options match the existing replacement checker. Public CI has no source
and does not run this opt-in acceptance. This establishes controlled native
failure delivery across source replacement, a current-failure positive control
and successful retry with the real source/engine/browser. It does not capture
the old React hook's full return, establish naturally occurring failures,
checksum-failure interleavings, other sources, desktop picker or hardware.
Missing AMI-uncompressed/mixed sources and parked P53 dynamic roots are unchanged.

## Current import error visibility and native checksum rejection

On 2026-10-15 the late-checksum probe against deployed main
`7ff0112ba2596b032bed8d65ed8e6bc9e1b32a05` exposed a UI defect: App kept
current AMI import errors in state but rendered its alert only in the uploader.
The native rejection occurred, but the active editor showed no error. Those
attempts timed out at the current-error assertion and are **not** complete
acceptance. App now displays `Editor import failed` inside the AMI editor.
It retains the existing queue and verified output when an import fails; a
successful import clears the alert and invalidates output normally. Import
lifetime/revision guards, checksum validation and all writers are unchanged.

The new synthetic App/real-queue regression failed before the fix and passed
after it. It verifies visible error text, retention of the applied queue and
clearing after a success callback. Extraction and Footer are mocked in that
test; it is not binary or real-browser evidence.

The complete opt-in probe then passed in **Firefox 153.0 against a local
production build** of this change, with Playwright 1.62.1, headless Linux,
1600 × 1000. This is separate from deployed Pages acceptance. It loaded
`index-LM6CCH_b.js`, `index-D4JOsfQ5.css` and the actual published
`tiano-decompress.wasm` / `ifrextractor.wasm` assets. The exact authorized source
was recovered afresh and verified against the original 8,388,608-byte size and
SHA-256 recorded above. Source, decoded data, editor JSON and downloads stayed
local and were not sent to the preview server or GitHub.

This is a **fault-injection and controlled-timing** probe. Only the first digest
whose input exactly matches the independently checked exported offset string
uses an unsupported algorithm name. The original native `SubtleCrypto.digest`
therefore produces `NotSupportedError`; the checker holds and later throws that
same error unchanged. Other digests use their original inputs/algorithm/results.
No application validation decision, firmware bytes or codec result is replaced.

1. Import the original source-bound JSON with Security `05` normally and confirm
   it is accepted; clear it. Stage/apply the four accepted operations and build
   and download the baseline SPI.
2. Hold the native checksum rejection from the old JSON import. Clear/Undo back
   to the same four entries, Apply and require a fresh Check. Download the
   independently verified new SPI while the old failure is held.
3. Deliver the old failure. Require one rejection/delivery, no held result, four
   queue entries, enabled output/report, no import/output alert and exported
   Security `00`. Download the cached output without another Check.
4. Restore the native API and explicitly deselect the stale file before selecting
   it again. Inject the same native rejection for this current import, without a
   gate. Require one native rejection and a visible editor import alert; the
   existing four-entry queue and verified output/report remain intact.
5. Retry the import with the original native digest. Require the alert to clear,
   Security `05` to be exported and cached output/report to become disabled.
   No binary output acceptance for Security `05` is claimed.
6. Close/open the actual cached SPI downloaded in step 3. Fresh ordinary
   extraction verifies 70 Forms, Security `00`, Boot zero, the DRAM Ref only in
   Form 5 and the empty suppression scope at `0x8B359`. Output/report are disabled
   for this new source. No main-frame navigation, document time-origin change
   or application page error occurs.

All three complete SPI downloads have the accepted SHA-256
`264f90a0934848916bdc3e123564ce5c67c068faa6c48ee03e756f7c21f3aaae`,
140,913 changed bytes, zero changes outside the two original FFS owners and zero
outside BIOS. All 1,572,864 non-BIOS bytes are unchanged. The ordinary builder's
allocation, checksum, codec and independent reconstruction guards remain active.

```bash
FIRMWARE_ACCEPTANCE_IMAGE=/path/to/source.bin \
node scripts/firmware-tiano-late-checksum-firefox-acceptance.mjs
```

`FIRMWARE_BROWSER_URL` optionally selects the local production preview; absent
that variable, the checker uses Pages. Other browser options match the preceding
checkers. Each Check retains its 15-minute limit. Private checker intermediates
are removed on exit; public CI does not supply the source or run this probe.
The native rejection delivery and resulting UI are observed, not a captured full
return of the discarded React import. Naturally occurring failures, deployed
post-fix acceptance, replacement during checksum rejection, file-read failures,
other sources, desktop picker and hardware remain separate gates. Missing
uncompressed AMI/mixed sources and parked P53 dynamic roots are unchanged.

## Deployed post-fix native checksum rejection acceptance

Reproduced on 2026-10-15 against deployed main
`d2bf8878205b9ee012fff0a1d457f98d9018fe55` (PR #176), Firefox 153.0,
Playwright 1.62.1, headless Linux, 1600 × 1000. The exact SHA's
[Code quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/38779008757)
and automatic [Pages deployment](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/38779008701)
both completed successfully. Pages returned `index-LM6CCH_b.js`,
`index-D4JOsfQ5.css`, `tiano-decompress.wasm` and `ifrextractor.wasm`.

The unchanged late-checksum scenario above now passes against Pages, not just
a local production build: normal current-import positive control; held native
`NotSupportedError`; Clear/Undo to identical entries and a fresh verified build;
late rejection delivery without an obsolete alert or output invalidation;
visible current-import failure retaining the four-entry applied queue and
verified output/report; normal retry clearing the alert, accepting Security
`05` and invalidating output; independent ordinary reanalysis of the cached
Security `00` SPI confirming all four edits. No binary output for Security `05`
is claimed. The exact source was recovered from the authorized existing archive
and size/SHA-256 checked afresh; private bytes and JSON stayed local.

All three 8,388,608-byte SPI downloads matched
`264f90a0934848916bdc3e123564ce5c67c068faa6c48ee03e756f7c21f3aaae`.
There were 140,913 changed bytes, zero outside the two original FFS owners and
zero outside BIOS. Navigation count and document time origin stayed unchanged;
no application page errors occurred. The checker's existing native rejection,
output hash, ownership, 15-minute Check and independent reread assertions were
not relaxed. Container execution used its existing sandbox compatibility option.

The checker additionally accepts `FIRMWARE_BROWSER_PROXY_SERVER` as an optional
Playwright launch proxy; it changes transport only, not application behavior or
acceptance assertions. The ordinary no-proxy deployed run passed separately.

This closes only the deployed post-fix gate for this controlled-timing,
fault-injected checksum rejection scenario. It does not observe the old import's
full return or establish spontaneous failures, replacement during checksum
rejection, file-read failures, other sources, desktop picker or hardware.
Missing uncompressed AMI/mixed sources and parked P53 dynamic roots are unchanged.

## Source replacement during native checksum rejection

Reproduced on 2026-10-16 (Europe/Madrid) against deployed main
`2894f0214f326ef5ea4ac0b04ab9b81ece0af162` (PR #177), Firefox 153.0,
Playwright 1.62.1, headless Linux, 1600 × 1000. Code quality, build and automatic
Pages deployment completed successfully for this exact SHA. Observed assets were
`index-LM6CCH_b.js`, `index-D4JOsfQ5.css`, `tiano-decompress.wasm` and
`ifrextractor.wasm`. The existing authorized 8 MiB source was checked against its
original size/SHA-256 afresh; private firmware, JSON and downloads remained local.

The new opt-in checker retains the preceding native unsupported-algorithm
fault injection and current-import positive controls. Instead of Clear/Undo,
it closes the source while the original native `NotSupportedError` is held,
then reopens identical bytes in the same document. Check/output/report reset;
queue, Apply and Undo/Redo are empty/disabled. Exported fresh base has 70 Forms,
Security `01`, Boot `1`, the DRAM Ref only in Form 3 and the original active
suppression at `0x8B359`. The browser probe still has one held, undelivered
native rejection; the document time origin and navigation count are unchanged.

The four accepted edits are then staged/applied again. A new verified full SPI
is built and downloaded before the old error is released. Delivery counters
confirm one rejection/delivery and no held failure. No obsolete import/output
alert appears, the newer four-entry queue and verified output/report remain,
and exported Security is `00`, not the obsolete import's `05`. Cached download
matches the fresh rebuild. The same native failure on a current import displays
the editor alert while retaining queue/output; a normal retry clears it, accepts
Security `05` and invalidates output. No Security `05` binary output is claimed.

All three 8,388,608-byte SPI downloads have SHA-256
`264f90a0934848916bdc3e123564ce5c67c068faa6c48ee03e756f7c21f3aaae`,
140,913 changed bytes and zero changes outside the two original FFS owners or
BIOS. Ordinary independent reanalysis of the cached post-delivery SPI confirms
all four edits, including the Ref only in Form 5 and empty suppression scope.
No application page error or main-frame navigation occurs. Each Check retains
its 15-minute limit; the replacement race also must finish within 15 minutes.

```bash
FIRMWARE_ACCEPTANCE_IMAGE=/path/to/source.bin \
node scripts/firmware-tiano-replacement-checksum-firefox-acceptance.mjs
```

Browser options match the preceding checker. Public CI does not supply the
private source or execute this opt-in probe. This is controlled timing and an
injected native failure, not spontaneous failure or observation of the old
React import's full return. File-read failures, other interleavings/sources,
desktop picker and hardware remain separate gates. No new writer or format is
enabled; missing uncompressed AMI/mixed sources and parked P53 research remain.

## Controlled native File.text API failure across source replacement

Reproduced on 2026-10-16 (Europe/Madrid) against deployed main
`25e25f2d81879a67010ce0d5eae7ccc26b93cb06` (PR #178), Firefox 153.0,
Playwright 1.62.1, headless Linux, 1600 × 1000. Quality, build and automatic
Pages deployment succeeded for that SHA. Observed assets were
`index-LM6CCH_b.js`, `index-D4JOsfQ5.css`, `tiano-decompress.wasm` and
`ifrextractor.wasm`. The authorized existing source's size and SHA-256 were
checked afresh. Firmware, editor JSON and downloads remained local.

The opt-in checker first proves normal acceptance of the source-bound JSON
with Security `05`, clears it and builds the accepted four-operation baseline.
Only the first `File.text()` for the checker's `pending-import.json` is then
intercepted. The browser's original native method is invoked with an invalid
receiver, producing a native `TypeError`; the checker holds and later throws
that exact error unchanged. Other calls forward their real receiver/arguments.
This is **API fault injection**, not an unreadable file, operating-system I/O
failure, spontaneous rejection or successful old text delivery.

While the error is held, close/reopen of identical source bytes resets
Check/output/report, queue, Apply and both histories. Export verifies the
original 70 Forms and all four original target states. A new four-edit complete
SPI is verified and downloaded before error release. Exactly one held native
failure is delivered; the newer queue/output remain, no obsolete alert appears,
Security remains `00` and cached download matches the fresh build. The same API
failure on a current import displays the editor alert without discarding the
existing queue/output. Restoring the native method and retrying accepts Security
`05`, clears the alert and invalidates output. No Security `05` binary is claimed.

All three 8,388,608-byte SPIs match
`264f90a0934848916bdc3e123564ce5c67c068faa6c48ee03e756f7c21f3aaae`:
140,913 changed bytes, zero outside the two original FFS owners and zero outside
BIOS. Ordinary independent reanalysis verifies the cached SPI's four edits.
No document navigation/time-origin change or page error occurs. Each Check and
the replacement race retain 15-minute limits. The original native method's own
property descriptor (or inherited lookup) is restored before retry/reanalysis.

```bash
FIRMWARE_ACCEPTANCE_IMAGE=/path/to/source.bin \
node scripts/firmware-tiano-late-read-rejection-firefox-acceptance.mjs
```

Browser options match the preceding checker; public CI does not supply the
private source or execute this opt-in test. This observes native error delivery
and resulting UI, not the old React import's full return. Real I/O failures,
other interleavings/sources, desktop picker and hardware remain unaccepted.
No writer or format is enabled; missing uncompressed AMI/mixed sources and
parked P53 dynamic-root research remain unchanged.
