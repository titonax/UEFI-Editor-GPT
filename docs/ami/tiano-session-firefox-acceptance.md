# Exact Tiano combined v2/v1 sessions in deployed Firefox

## Revision and source

Reproduced on 2026-10-14 at <https://titonax.github.io/UEFI-Editor-GPT/>
against `fa8b62438ce41dcdaed561b93b7950f962382560` (merged PR #159).
[Code quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/38567419157)
and [Pages](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/38567418971)
were successful for that exact SHA before the run.

Firefox 153.0, Playwright 1.62.1 build 1538, headless Linux, viewport 1600 × 1000,
loaded `index-_Q4xhBY9.js`, `index-D4JOsfQ5.css`, `tiano-decompress.wasm` and
`ifrextractor.wasm`. Container content sandbox level zero and certificate-error
handling were browser settings. No app, editor, queue, codec or download was mocked.

The existing accepted complete SPI source is 8,388,608 bytes, SHA-256
`297390ca838c455791a5bf3a3f0001fbf36a8cb31be362ea2123b8df84dfffe8`.
See [combined engine acceptance](tiano-combined-queue-acceptance.md) for the
original source and ownership evidence. Firmware, editor JSON, session JSON and
downloads stayed local and private; only code and technical metadata are committed.

## Actual session flow

The deployed controls staged the same accepted combination in this order:

1. Move DRAM Timing Control to CPU Power Management through the move dialog.
2. Change Security's SetupData flags from `01` to `00` on Main.
3. Export the projected `data.json`, change only the existing `0x8B359`
   suppression's active value to false and import through the source-bound JSON
   control. This is the supported import route for an unassociated scope, not
   a direct question-row Show control.
4. Open Top-level menu and hide Boot, root index 4.

Save queue session exported version 2, kind `hii-menu-actions`, format
`uefi-editor-queue-session`. The source contains only complete-image hash/size
and opened-context hash. The four enabled operations contain only these selectors:

| Action         | Selectors / desired value                                     |
| -------------- | ------------------------------------------------------------- |
| `move-ref`     | source Form index 3, child index 49, destination Form index 5 |
| `ami-values`   | Form index 0, child index 1, field `accessLevel`, value `00`  |
| `suppressions` | condition index 5, active false                               |
| `ami-roots`    | root index 4, visible false                                   |

The checker asserts the complete exported schema and operations. No source
filename, binary patches, source bytes, labels, offsets, history or Apply status
are present. Clear empties the queue; loading that v2 session restores the four
operations. Apply selected and Check firmware output run anew before download.

## Complete output and rejection

The explicitly downloaded result is 8,388,608 bytes, SHA-256
`264f90a0934848916bdc3e123564ce5c67c068faa6c48ee03e756f7c21f3aaae`,
identical to the accepted combined engine output. Independent local comparison
counts 140,913 changed bytes and zero changes outside the original owners
`[3239384, 3419918)` and `[4612464, 4781106)`. All 1,572,864 bytes outside BIOS
remain identical. The production builder's allocation, codec, checksum and
independent re-extraction guards run unchanged.

Reloading the app and analysing the complete downloaded image succeeds. Loading
the original session then rejects with the different-image/context error,
leaves the new queue empty and keeps firmware download disabled. No application
page errors occurred.

## Reproduce and limits

With Playwright and its real Firefox installed, supply the private accepted source:

```bash
FIRMWARE_ACCEPTANCE_IMAGE=/path/to/source.bin \
node scripts/firmware-tiano-session-firefox-acceptance.mjs
```

The script supports the same optional browser module/executable/container settings
as the P53 session checker. It bounds reconstruction to 15 minutes and removes its
temporary firmware/session/editor files on completion. Public CI has no private input.

This original run established exact-source Firefox v2 combined-session acceptance. It did not
establish combined v1 replay, AMITSE menu reassignment, other sources or codecs,
human desktop file-picker behavior, hardware flashing or recovery. Ref-only v1
acceptance remains separately recorded for P53; its old format cannot represent
this combined queue. P53 dynamic roots and new BIOS cases remain parked.

## Bounded paused v2 session

Reproduced on 2026-10-16 (Europe/Madrid) against deployed main
`8009a07fe24d56dec36b79e5911c0cde577f26b8` (PR #181), after successful exact-SHA
Quality, build and automatic Pages deployment. Firefox 153.0 / Playwright 1.62.1,
headless Linux, 1600 × 1000 loaded `index-LM6CCH_b.js`, `index-D4JOsfQ5.css`,
`tiano-decompress.wasm` and `ifrextractor.wasm`. Browser sandbox/certificate
settings match the earlier checker. The same authorized source was checked
afresh for its complete size and SHA-256. No browser API, application, editor,
queue, codec or writer was mocked or fault-injected.

1. Stage the same four operations above, then pause Security, suppression and
   Hide Boot through their real checkboxes. Keep all entries in order, with only
   the Ref move enabled. Apply/Check/download produces the existing accepted
   move-only full SPI, not the four-edit result.
2. Save the queue from that ready-output state. Assert the exact metadata-only
   v2 schema and selectors above, with enabled flags `[true, false, false, false]`.
   Saving preserves the verified download and details; no source filename,
   firmware bytes, decoded data, offsets, history or Apply state are exported.
3. Clear the queue: output, Check and details invalidate. Load the session via
   the normal file control. All four entries/order and the exact paused selection
   return, but no Apply or verified output does. Re-export is JSON-value identical
   to the original session. Fresh Apply/Check/download yields a byte-identical
   move-only complete SPI.
4. Change only the paused root operation's selector to nonexistent root index
   `999`, keeping it disabled and source/context identities unchanged. Loading
   rejects with `targets a missing or ambiguous root`; the prior queue, selection,
   verified output and details remain intact. Another export equals the original
   session. A paused entry therefore still undergoes semantic root validation;
   this is not merely a malformed-schema or changed-source rejection.
5. Reactivate the three restored entries. Each mutation invalidates output.
   Fresh Apply/Check/download matches the existing accepted four-edit full SPI.
6. Independently reopen and normally analyze the restored move-only download
   and the reselected full download. Both retain 70 Forms and the Ref absent from
   Ai Tweaker and present exactly once in CPU Power Management. The subset retains
   Security `01`, Boot `1` and the active nonempty suppression at `0x8B359`; the
   full output has Security `00`, Boot zero and an empty suppression body.
   Reopening resets output/details. Loading the original paused session on the
   changed full SPI rejects with different image/context, leaving the queue empty
   and download disabled. No application page errors occur.

All three downloads remain complete 8,388,608-byte SPIs. Both move-only outputs
have SHA-256 `b1d6224b3ff47692e56ee5c42e7e9055c2154fccfcb3b79ac9fe713df745705f`
and 12,295 changed bytes only in Setup FFS `[4612464, 4781106)`; the companion
FFS remains unchanged. The full output retains SHA-256
`264f90a0934848916bdc3e123564ce5c67c068faa6c48ee03e756f7c21f3aaae`
and 140,913 changed bytes inside the two original FFS owners above. Every byte
outside BIOS is identical. Both expected hashes/counts come from existing engine
evidence, not calibration to this browser run. Normal allocation, codec,
checksum and independent reconstruction guards remain in force.

```bash
FIRMWARE_ACCEPTANCE_IMAGE=/path/to/source.bin \
node scripts/firmware-tiano-paused-session-firefox-acceptance.mjs
```

The opt-in checker retains the 15-minute Check limit and removes private
intermediates on exit; public CI does not supply the source. This closes only
the exact one-enabled/three-paused combined v2 round trip and its described
rejections. Other selections, dependent paused sessions, session Undo/Redo,
asynchronous save/load races, other sources/families, desktop picker, combined v1
and hardware remain separate gates. No writer/format or source gate is unlocked.

## Bounded session-load Undo/Redo

Reproduced on 2026-10-16 (Europe/Madrid) against deployed main
`873dabb19c66cb94776e4e761ca67ca19e39197c` (PR #182), after fresh exact-SHA
Quality, build and automatic Pages deployment success. The extended checker
above ran with Firefox 153.0 / Playwright 1.62.1, headless Linux, 1600 × 1000,
the same browser sandbox/certificate options and the same `index-LM6CCH_b.js`,
`index-D4JOsfQ5.css`, `tiano-decompress.wasm` and `ifrextractor.wasm` assets.
The authorized source was checked afresh for size/SHA-256. No browser API,
application, queue, codec or writer was mocked or fault-injected.

The earlier paused-session export/clear/import, invalid paused-root atomic
rejection and full reselection steps all pass again. The extension then:

1. Loads the original one-enabled/three-paused v2 session directly over the
   four-enabled queue with its complete output ready, without clearing first.
   The whole selection changes and Check, download and details invalidate.
2. Clicks Undo once: all four original entries return selected, in original
   order, without Apply/output restoration. Redo once returns the exact paused
   selection. A new export equals the original session, including metadata-only
   schema and enabled flags; no imported/saved history is needed.
3. Applies/checks/downloads the Redo selection afresh. This move-only complete
   SPI is byte-identical to the earlier restored-session move-only output.
4. Clicks Undo from that verified-output state: all four entries return selected
   and output invalidates again. Fresh Apply/Check/download is byte-identical
   to the earlier four-edit output. Apply and Check leave Redo available.
5. Clicks Redo with this full output ready: the paused selection returns, but
   Check, download and details are disabled again rather than reviving old bytes.
6. Independently reopens/analyzes the actual post-Redo move-only and post-Undo
   full downloads. The 70 Forms, unique moved Ref, original paused Security/Boot/
   suppression states in the subset and requested four-edit full states match
   the assertions above. Changed-image session rejection still leaves an empty
   queue and disabled download. No application page errors occur.

All five downloads are complete 8,388,608-byte SPIs. The three move-only results
retain SHA-256 `b1d6224b3ff47692e56ee5c42e7e9055c2154fccfcb3b79ac9fe713df745705f`
and 12,295 changes confined to original Setup FFS. The two full results retain
SHA-256 `264f90a0934848916bdc3e123564ce5c67c068faa6c48ee03e756f7c21f3aaae`
and 140,913 changes confined to the original two owners. Every non-BIOS byte
remains identical. No expected hash, allocation, codec, checksum, timeout or
independent reconstruction guard changed. Private intermediates are removed on
exit; the same opt-in command above reproduces this extended flow.

This closes only the described session-load single-mutation Undo/Redo gate for
this exact source/selection. Other history sequences, sources, dependent paused
plans, asynchronous save/load races, combined v1, desktop picker and physical
hardware remain separate. P53 dynamic roots and new BIOS remain parked.

## Controlled late session read across history change and dialog closure

Reproduced on 2026-10-16 (Europe/Madrid) against deployed main
`ad90df8534a236da4f804646a1dfdd31b0271522` (PR #183), after fresh exact-SHA
Quality and automatic Pages build/deployment success. Firefox 153.0 / Playwright
1.62.1, headless Linux, 1600 × 1000 loaded `index-LM6CCH_b.js`,
`index-D4JOsfQ5.css`, `tiano-decompress.wasm` and `ifrextractor.wasm`.
The authorized source was recovered afresh and checked for the original complete
size/SHA-256. Firmware, decoded bodies, editor/session JSON and downloads remain
local. No application, queue, codec, writer or validation guard changed.

This extension is a **controlled-timing native API probe**, not ordinary
scheduling. It forwards `File.prototype.text` with the original receiver and
arguments for one selected local paused-session file. Only delivery of its real
completed text waits behind a Promise gate; that text is not altered. A second
wrapper forwards native `SubtleCrypto.digest` calls unchanged and counts their
completion without changing algorithm, input or returned digest.

1. The normal paused-session load earlier in the same run completes five native
   digests, with zero pending, before exporting/rebuilding the restored selection.
   The probe measures this count; it does not substitute a frozen call target.
   Existing paused-root rejection and full reselection continue to pass.
2. Start loading the exact saved one-enabled/three-paused session while the
   four-edit output is ready. Hold the actual text after one native read has
   completed, with no delivered text. Loading alone retains the existing output.
3. Clear/Undo back to the four selected entries, require Apply/output invalidation,
   Apply again and close the queue dialog. Run a fresh complete Check and download
   while the old text is still held. The new full SPI equals the accepted full
   result byte for byte.
4. Release the old native text. Require one text delivery, no held read, and all
   five native digests of its validation to complete with zero pending. Drain
   microtasks across two animation frames. Review of the exact AMI action path
   confirms the remaining replay/commit continuation has no external await after
   these hashes. No competing save/load starts before these observations.
5. Reopen the queue: all four entries retain their order and enabled flags, output
   and details remain enabled, and no stale loaded/error message appears. A fresh
   metadata-only session export equals the original session with all enabled
   flags true. Download the cached SPI without another Check; it equals the fresh
   post-mutation result. Document time origin is unchanged across the race.
6. The existing single-step session Undo/Redo and fresh subset/full reconstruction
   steps still pass. Independently reopen/analyze the actual post-delivery cached
   SPI as well as the history downloads: 70 Forms, unique Ref moved to Form 5,
   requested full Security/Boot/suppression states and original paused states in
   the move-only variant. Changed-image rejection still leaves the empty queue
   and disabled output. No application page errors occur.

All seven downloads are complete 8,388,608-byte SPIs. The three move-only results
retain SHA-256 `b1d6224b3ff47692e56ee5c42e7e9055c2154fccfcb3b79ac9fe713df745705f`
and 12,295 changed bytes confined to Setup FFS. The four full results retain
SHA-256 `264f90a0934848916bdc3e123564ce5c67c068faa6c48ee03e756f7c21f3aaae`
and 140,913 changes within the original two owners. Every byte outside BIOS is
unchanged. The checker above reproduces this extension and removes its private
intermediates on exit. Public CI has no private source. The normal 15-minute
Check limit, allocations, checksums, codecs and independent reconstruction
requirements remain unchanged.

This accepts only this exact successful late-read sequence combining Clear/Undo
and dialog closure. Both context invalidation mechanisms occur; it does **not**
isolate queue revision alone from dialog closure. Native read/hash delivery and
the retained resulting state are observed, not an exposed full return of the old
React operation. Save races, stale rejection, source replacement during session
validation, other contexts/selections, ordinary scheduling, actual I/O failure,
desktop picker and hardware remain separate. This extends real Firefox evidence;
it does not add standalone engine or new synthetic-test acceptance. P53 dynamic
roots, new BIOS and missing qualifying uncompressed AMI/mixed sources stay parked
or blocked as before.

## Controlled pending session read across source close/reopen

Reproduced on 2026-10-16 (Europe/Madrid) against deployed main
`e07bd5aeda286763dff92bcf3ac331ba7ee248a7` (PR #184), after fresh exact-SHA
Quality, build and automatic Pages deployment success. The same opt-in checker
above ran with Firefox 153.0 / Playwright 1.62.1, headless Linux, 1600 × 1000,
the documented container/certificate options and the same `index-LM6CCH_b.js`,
`index-D4JOsfQ5.css`, `tiano-decompress.wasm` and `ifrextractor.wasm` assets.
The existing authorized source was size/SHA-256 checked afresh. Firmware,
decoded bodies, editor/session JSON and outputs remain private and local.

The checker now shares its normal four-action staging and native text gate
between the earlier race and this separate lifetime sequence. It forwards the
original native File.text call for one selected session filename, retaining only
delivery of the actual successful text. It does not change text, digests,
algorithms, writer inputs or validation. This is **controlled native timing**,
not ordinary scheduling or a real unreadable-file/I/O failure.

1. While the four-edit output is ready, start loading the saved one-enabled/
   three-paused session. Require one completed native read, zero deliveries and
   the held state; loading alone keeps the old verified download enabled.
2. Close the queue dialog and use Load another firmware. Reopen the same original
   complete SPI bytes, without document navigation. The queue is empty, Undo/Redo
   disabled and Apply/output absent. Export freshly parsed base data: 70 Forms,
   Security `01`, all seven original root bytes `1111111`, the Ref still in Form 3
   and absent from Form 5, and the original active nonempty suppression. The old
   native text remains held throughout. This is a fresh workspace even though
   the source hash matches; no Clear/Undo occurs in this replacement sequence.
3. Stage the accepted four actions again through the actual move/flags/JSON-
   suppression/root controls, then Apply/Check/download a fresh full SPI while
   old text is held. It matches the accepted full result byte for byte.
4. Release old native text. Require exactly one delivery and all five old native
   validation hashes completed with zero pending, measured against the successful
   current-load control earlier in the same run. Drain two animation frames before
   starting any newer queue-session save/load. The replay path after those hashes
   has no further external await; the old React operation's full return is not
   separately exposed or claimed.
5. The newly opened queue still has all four entries selected in order, with
   output/details ready and no stale loaded/error message. A new metadata-only
   session export equals the expected full selection. Download the cached SPI
   without another Check: it equals the fresh replacement output. Document time
   origin remains unchanged. Restore the native API wrappers normally.
6. The current session-load Undo/Redo flow still works afterward. Independently
   reopen/analyze the actual retained replacement SPI as well as the history
   variants and earlier retained race output. All full results retain the four
   requested edits and 70 Forms; the move-only result preserves paused states.
   Changed-image session rejection and zero application page errors still pass.

All nine downloads remain complete 8,388,608-byte SPIs. The three move-only
results retain SHA-256
`b1d6224b3ff47692e56ee5c42e7e9055c2154fccfcb3b79ac9fe713df745705f`
and 12,295 changed bytes only in original Setup FFS `[4612464, 4781106)`.
The six full results retain SHA-256
`264f90a0934848916bdc3e123564ce5c67c068faa6c48ee03e756f7c21f3aaae`
and 140,913 changes only inside that FFS and original companion owner
`[3239384, 3419918)`. Every non-BIOS byte is identical. Expected hashes/counts,
allocation fit, codecs, checksum repair, independent reconstruction and the
15-minute Check bound are unchanged. Public CI has no private source; the checker
removes private intermediates on exit.

This accepts only successful late-read delivery after dialog closure plus
same-byte source close/reopen in the same page, with no newer session operation
masking delivery. It does not isolate dialog closure from source unmount/reset,
or establish a distinct-image replacement, pending save/hash-only boundary,
stale rejection, ordinary scheduling, other source/selection or hardware gate.
No standalone engine or new synthetic acceptance is claimed. P53 dynamic roots,
new BIOS and missing qualifying uncompressed AMI/mixed HII sources remain parked
or blocked.

## Controlled pending session save across source close/reopen

Reproduced on 2026-10-16 (Europe/Madrid) against deployed main
`271218ca5131e6d0fcf2d47b61123e9b1df3b18d` (PR #185), after fresh exact-SHA
Quality, build and automatic Pages deployment success. The same opt-in checker
ran with Firefox 153.0 / Playwright 1.62.1, headless Linux, 1600 × 1000 and the
documented container/certificate settings. Assets remained `index-LM6CCH_b.js`,
`index-D4JOsfQ5.css`, `tiano-decompress.wasm` and `ifrextractor.wasm`.
The existing authorized complete source was size/SHA-256 checked afresh. Private
firmware, decoded/editor/session JSON and outputs remain local; the checker
removes its private intermediates on exit. Public CI has no private source.

1. A successful current full-queue session export measures five completed native
   SHA-256 calls, with none pending, and equals the expected metadata-only v2
   session. The probe uses that measured count, not a frozen digest index.
2. Start another Save queue session while the full output is ready. Forward
   native `SubtleCrypto.digest` with unchanged receiver, arguments and result;
   retain only delivery of the final successful digest. All five native calls
   have completed, four results have delivered and the final one is held. No
   session download or JSON Blob URL is created; existing output/details stay
   enabled. Restore the original digest method as soon as the final call starts,
   before doing any replacement analysis or reconstruction.
3. Close the dialog and use Load another firmware. Reopen the same original SPI
   in the same document. Verify empty queue, disabled Undo/Redo and no applied or
   checked output, plus the original 70 Forms, Security `01`, seven enabled roots,
   original Ref placement and active nonempty suppression from a fresh Data
   export. Stage the four actions again and Apply/Check/download a new exact full
   SPI. The old final digest is still held throughout; no newer session save/load
   has started.
4. Release that native digest and require all five results delivered, no held
   result, then drain two animation frames. Before any new session operation,
   require no additional session download and no additional JSON Blob URL. The
   latter is counted synchronously by a forwarding `URL.createObjectURL` wrapper
   for `application/json`; it returns the native URL unchanged and retains no
   Blob content. This checks save commit activity, not only download-event timing.
   Review of `saveHiiQueueSession` confirms no further external await after its
   final identity digest. The old React operation's full return is not separately
   exposed or claimed.
5. Reopen the queue: the four selected entries/order and verified output/details
   remain intact, with no stale saved/error message. A new current Save succeeds:
   exactly one session download and one JSON Blob URL, with the exact expected
   metadata-only full session. Restore the URL wrapper. Download the cached SPI
   without another Check; it equals the fresh replacement result byte for byte.
   Document time origin is unchanged throughout.
6. The existing session-load Undo/Redo, paused-root rejection, subset/full rebuilds
   and earlier late-read probes still pass. Independently reopen the retained
   post-save replacement SPI as well as both history outputs and both earlier
   retained race outputs: five reanalyses, 70 Forms, unique moved Ref and the
   correct full/paused Security, Boot and suppression states. Changed-image
   session rejection leaves the queue empty and download disabled. No application
   page errors occurred.

All eleven downloads are complete 8,388,608-byte SPIs. The three move-only
results retain SHA-256
`b1d6224b3ff47692e56ee5c42e7e9055c2154fccfcb3b79ac9fe713df745705f`
and 12,295 changes only in original Setup FFS `[4612464, 4781106)`.
The eight full results retain SHA-256
`264f90a0934848916bdc3e123564ce5c67c068faa6c48ee03e756f7c21f3aaae`
and 140,913 changes only in that FFS and companion `[3239384, 3419918)`.
Every byte outside BIOS and outside those original owners is identical. Existing
allocation, codec, checksum, buffer ownership, independent reconstruction and
15-minute Check guards are unchanged. No standalone engine run or new synthetic
acceptance is claimed.

The initial attempt stopped before this save probe because a reopened dialog's
checkbox list was inspected before its contents mounted. The checker now waits
for the actual first row under the existing timeout before asserting the exact
complete order. That attempt is not counted as a pass; the final full rerun
passed. No application timing, timeout or expected queue/output was relaxed.

This is controlled successful native hash delivery across dialog closure plus
same-byte source unmount/reset, not ordinary scheduling or an actual I/O failure.
It does not isolate those cancellation mechanisms, establish distinct-image
replacement, queue-revision-only save cancellation, stale save rejection,
load-hash-only cancellation, other selections or hardware. Combined v1, missing
qualifying uncompressed AMI/mixed sources, P53 dynamic roots and new BIOS retain
their existing separate gates.

## Controlled final load hash across Clear/Undo with the dialog kept open

Reproduced on 2026-10-16 (Europe/Madrid) against deployed main
`cfc8e117f0b0b8209b53e0e5c9dda766a1f422c2` (PR #186), after fresh exact-SHA
Quality, build and automatic Pages deployment success. The same opt-in checker
ran in Firefox 153.0 / Playwright 1.62.1, headless Linux, 1600 × 1000 with the
documented container/certificate settings. Loaded assets were
`index-LM6CCH_b.js`, `index-D4JOsfQ5.css`, `tiano-decompress.wasm` and
`ifrextractor.wasm`. The same authorized original SPI was checked afresh for
size/SHA-256. No source, decoded bodies, editor/session JSON or output is published.

This probe separates a pending **load hash** from the earlier held text and
source/dialog sequences. It forwards the real native `SubtleCrypto.digest`
receiver, arguments and unchanged successful digest. The successful paused-session
load earlier in the same run measures five completed native calls, zero pending;
the probe uses that measured count to hold delivery of only the final call.
`File.text` is native and unheld. The digest wrapper restores the original method
as soon as the selected final call starts, so subsequent normal work is unaffected.

1. Open the four-enabled queue with its full SPI and details ready. Load the
   original one-enabled/three-paused session. Require all five native hashes
   completed, four results delivered and the final result held, with the loading
   status visible. All four current entries remain selected; download/details
   are still enabled before mutation.
2. Keep the queue dialog open. Clear empties the queue and invalidates Check,
   download and details. Undo restores the exact original four entry titles,
   order and enabled selection, but not Apply/output. Require the old final
   digest still held. Do not close the dialog, replace the source, Apply or start
   another session operation.
3. Release the unchanged final digest. Require all five results delivered and
   no held result, then drain two animation frames before any further operation.
   The four selected entries/order remain; no stale loaded message or alert is
   shown. Check/download/details stay invalidated and Apply is available. The
   old paused-session selection does not replace the restored full selection.
4. Only now Apply, close the dialog and perform a fresh Check/download. Its
   full SPI equals the previously checked full result byte for byte. Page time
   origin remains unchanged. The existing current-session load/Undo/Redo tests
   afterward still verify actual selection replacement, output invalidation and
   fresh known subset/full results; cancellation has not disabled valid loads.
5. Independently reopen/analyze this new post-cancellation full SPI along with
   the five earlier history/retained-race outputs. All six reanalyses retain
   70 Forms, a unique Ref moved to Form 5 and the correct requested full or
   original paused Security, Boot and suppression states. Changed-image session
   rejection still leaves the empty queue and disabled download. No application
   page errors occurred. The complete run passed on its first attempt.

All twelve downloads are complete 8,388,608-byte SPIs: three move-only results
with SHA-256
`b1d6224b3ff47692e56ee5c42e7e9055c2154fccfcb3b79ac9fe713df745705f`
and 12,295 changes confined to Setup FFS `[4612464, 4781106)`, and nine full
results with SHA-256
`264f90a0934848916bdc3e123564ce5c67c068faa6c48ee03e756f7c21f3aaae`
and 140,913 changes confined to that FFS plus companion `[3239384, 3419918)`.
Every byte outside the original owners and outside BIOS is identical. The
15-minute Check bound, source/buffer ownership, codec, allocation, checksum and
independent reconstruction requirements remain unchanged. The same command above
reproduces the checker and removes private intermediates; public CI has no source.

This establishes controlled successful hash delivery across queue/history
context invalidation without a competing dialog close, source reset or session
request. Code review confirms the remaining exact AMI suppression/root replay
has no external await after the last hash; the old React operation's full return
is not separately exposed. The browser does not inspect internal entry reference
identity or isolate individual revision/request-token implementation details.
It does not establish stale rejection, load-hash delivery across source replacement,
other histories/selections, ordinary scheduling, actual I/O failure or hardware.
No standalone engine or new synthetic acceptance is claimed. Combined v1,
missing qualifying uncompressed AMI/mixed sources, P53 dynamic roots and new BIOS
retain their existing separate gates.

## Controlled final load hash across source close/reopen

Reproduced on 2026-10-16 (Europe/Madrid) against deployed main
`d754bb17752daa9a21bc1894060e6431c4346119` (PR #187), after fresh exact-SHA
Quality, build and automatic Pages deployment success. Firefox 153.0 /
Playwright 1.62.1, headless Linux, 1600 × 1000 used the documented browser
container/certificate settings and `index-LM6CCH_b.js`, `index-D4JOsfQ5.css`,
`tiano-decompress.wasm` and `ifrextractor.wasm`. The authorized original SPI was
size/SHA-256 checked afresh. Private firmware, decoded/editor/session JSON and
outputs stay local and are removed by the checker on exit; public CI has no source.

The checker reuses the preceding final-native-load-hash gate, separately from
the open-dialog Clear/Undo sequence. The successful current load measures five
native hashes, zero pending. Original native receiver/arguments and successful
digest bytes are unchanged; only delivery of the last result is held. The native
digest method is restored when that last call starts, before replacement work.
File.text is native and unheld. No production editor, codec or writer is changed.

1. With the four-enabled queue/output ready, load the original one-enabled/
   three-paused session. Require five native hashes completed, four delivered,
   the final result held, a visible validating status and the old output ready.
2. Close the dialog and use Load another firmware. Reopen the same original
   complete SPI without navigation. Verify original base data, 70 Forms, Security
   `01`, seven enabled roots, original Ref placement and active suppression;
   queue/history/Apply/output reset. Reuse the same assertions as the earlier
   source-bound text/save probes, without weakening any of them.
3. Stage the normal four actions and Apply/Check/download a fresh full SPI.
   It matches the known full output byte for byte. Require the old final load
   digest still held throughout. No Clear/Undo or newer session save/load occurs
   in this replacement sequence before old delivery.
4. Release the unchanged last result. Require all five delivered and none held;
   drain two animation frames before observing the new queue. Its four selected
   entries/order and ready output/details remain intact, with no stale loaded
   message or alert. No newer session operation has superseded that old load.
   As in the preceding probe, exact AMI replay after this last hash has no further
   external await; the old React operation's full return is not separately exposed.
5. Only after those observations, export the current full session. It equals the
   expected metadata-only v2 session. Download the cached SPI without another
   Check: it equals the fresh replacement result. Document time origin is unchanged.
6. Existing valid session load/Undo/Redo, atomic paused-root rejection and earlier
   races still pass. Independently reopen the retained post-hash-replacement SPI
   and all six earlier history/retained outputs: seven reanalyses confirm 70 Forms,
   a unique moved Ref and correct full/paused Security, Boot and suppression
   states. Changed-image session rejection still leaves an empty queue and disabled
   output. No application page errors occurred. The full run passed first attempt.

All fourteen downloads are complete 8,388,608-byte SPIs. Three move-only results
retain SHA-256
`b1d6224b3ff47692e56ee5c42e7e9055c2154fccfcb3b79ac9fe713df745705f`
and 12,295 changes only in Setup FFS `[4612464, 4781106)`; eleven full results
retain SHA-256
`264f90a0934848916bdc3e123564ce5c67c068faa6c48ee03e756f7c21f3aaae`
and 140,913 changes only inside that FFS and companion `[3239384, 3419918)`.
Every non-BIOS and outside-owner byte is unchanged. Original hashes/counts,
buffer ownership, codec, allocation, checksum, independent reconstruction and
15-minute Check guards are unchanged. The opt-in command above reproduces this
extension; no standalone engine run or new synthetic acceptance is claimed.

This is controlled successful native hash delivery across dialog closure plus
same-byte source unmount/reset. It does not isolate those cancellation mechanisms
or establish distinct-image replacement, stale rejection, other hash boundaries,
other histories/selections, ordinary scheduling, actual I/O failure or hardware.
Combined v1, missing qualifying uncompressed AMI/mixed sources, P53 dynamic roots
and new BIOS retain their existing separate gates.

## Controlled late paused-root rejection after open-dialog Clear/Undo

Reproduced on 2026-10-16 (Europe/Madrid) against deployed main
`9ab1806f6e4bdb5545ad03e7ec8bce2bfa1ebedb` (PR #188), after fresh exact-SHA
Quality, build and automatic Pages deployment success. Firefox 153.0 /
Playwright 1.62.1, headless Linux, 1600 × 1000 used the documented browser
container/certificate settings and `index-LM6CCH_b.js`, `index-D4JOsfQ5.css`,
`tiano-decompress.wasm`, `ifrextractor.wasm`. The existing authorized complete
SPI was size/SHA-256 checked afresh. Private source, decoded/editor/session JSON
and outputs stay local; the checker removes intermediates on exit. CI has no source.

This is a genuine domain-validation rejection from deliberately invalid session
metadata, not a fabricated API error or spontaneous file failure. Reuse the same
schema-valid paused session whose only invalid selector is root index `999`,
still disabled, with unchanged source/context identities. The earlier current
paused-root rejection already proves that paused actions are validated. Reuse the
final-native-load-hash gate: five hashes measured from the normal current load,
all native calls completed, four results delivered and the last result held.
The native digest receiver, input, algorithm and successful bytes are unchanged;
the original method is restored when the last call starts. File.text stays native
and unheld. No firmware, codec, writer or root-validation behavior is modified.

1. With the full four-enabled queue and checked output ready, start loading that
   invalid paused-root file and require the final native hash held and validating
   status visible. Existing output remains ready before mutation.
2. Keep the dialog and source open. Clear empties the queue and invalidates
   Apply/Check/download/details. Undo restores the four selected entries/order
   without output. Require the old final hash still held; no newer session request,
   source reset, Apply or dialog closure occurs.
3. Deliver the unchanged final digest, require all five results delivered and
   none held, then drain two animation frames. Before another operation, require
   the restored full selection, no stale loaded message or alert, output still
   invalidated and Apply available. The normal AMI replay reaches the missing-root
   rejection after this hash without a further external await; the old React
   operation's full return is not separately exposed or claimed.
4. Apply/Check/download afresh. The complete full SPI equals the preceding full
   result byte for byte; document time origin remains unchanged.
5. Positive control: load the exact same invalid file without a timing gate or
   queue mutation. The current dialog visibly rejects with `targets a missing or
ambiguous root`, preserving the full queue/selection and newly checked output
   and details. Continue directly in that open dialog: the original valid paused
   session must load, invalidate output, clear the alert and pass the existing
   single-mutation Undo/Redo and fresh known subset/full rebuilding assertions.
   No close hides the error before that valid retry.
6. Independently reopen the new post-stale-rejection full SPI plus all seven
   earlier history/retained outputs. Eight reanalyses confirm 70 Forms, the unique
   moved Ref and correct full/paused Security, Boot and suppression states.
   Changed-image session rejection leaves an empty queue and disabled output.
   No application page errors occurred in the final complete run.

All fifteen downloads are complete 8,388,608-byte SPIs: three move-only results
with SHA-256
`b1d6224b3ff47692e56ee5c42e7e9055c2154fccfcb3b79ac9fe713df745705f`
and 12,295 changes only in Setup FFS `[4612464, 4781106)`, and twelve full
results with SHA-256
`264f90a0934848916bdc3e123564ce5c67c068faa6c48ee03e756f7c21f3aaae`
and 140,913 changes only inside that FFS and companion `[3239384, 3419918)`.
Every non-BIOS and outside-owner byte is unchanged. Expected hashes/counts,
allocation, codec, checksum, buffer ownership, independent reconstruction and
15-minute Check guards remain intact. The command above reproduces this extension;
no standalone engine rerun or new synthetic acceptance is claimed.

The first attempt passed the new stale/current rejection assertions, then stopped
because the old history transition tried to open an already open modal. It is not
counted as a complete pass. Removing only that redundant click keeps the dialog
open through the valid retry and adds an explicit cleared-alert assertion. The
final full rerun passed; no application timing, expected state or timeout changed.
Firefox installation also recovered from a failed primary download via its normal
fallback mirror before testing; that was not a firmware/application failure.

This establishes controlled timing of this semantic rejection across queue/history
context invalidation, without competing dialog/source/new-request cancellation.
It does not isolate internal reference/token details or establish rejection across
source replacement, other rejection causes, ordinary scheduling, actual I/O or
hardware. Combined v1, missing qualifying uncompressed AMI/mixed sources, P53
dynamic roots and new BIOS retain their existing separate gates.

## Controlled late paused-root rejection across source close/reopen

Reproduced on 2026-10-17 (Europe/Madrid) against deployed main
`70ba29a1a16a5f7dc1a1d7df49df4c07ef0fd451` (PR #189), after fresh exact-SHA
[Quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/38949298007)
and automatic [Pages build/deployment](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/38949297820)
success. Firefox 153.0 / Playwright 1.62.1, headless Linux, 1600 × 1000 used the
documented container/certificate settings and `index-LM6CCH_b.js`,
`index-D4JOsfQ5.css`, `tiano-decompress.wasm`, `ifrextractor.wasm`. The existing
authorized original SPI was size/SHA-256 checked afresh. Private firmware,
decoded/editor/session JSON and outputs remain local and are removed by the
checker on exit. Public CI has no private input.

This extends the same genuine missing-root semantic rejection, not an injected
browser error. The schema-valid session retains root index `999`, paused, and
unchanged source/context identities. Reuse the existing final-native-load-hash
gate: the normal current load measures five completed native hashes, zero pending;
the gate forwards unchanged receiver, arguments and digest bytes, holding only
delivery of the final result. All five native calls complete, four results deliver,
and the original digest method is restored when the final call starts. File.text
is native and unheld. No production editor, codec, writer or guard changes.

1. From a ready four-enabled queue/output, load that invalid paused-root file.
   Require final hash held, validating status visible and existing output ready.
2. Close the dialog and Load another firmware. Reopen the same original full SPI
   without document navigation. Require empty queue, disabled Undo/Redo and
   invalidated Apply/output; fresh base export proves 70 Forms, Security `01`,
   seven enabled roots, original Ref placement and active nonempty suppression.
3. Stage the four supported edits again. Apply/Check/download a new full SPI;
   compare it byte for byte with the known earlier full result. Require the old
   final digest still held throughout. No Clear/Undo or newer session request
   occurs in this replacement sequence before delivery.
4. Release the unchanged final hash, require all five results delivered and no
   held result, then drain two animation frames. Before any newer session action,
   the new queue retains its four selected entries/order, no stale loaded message
   or alert, and ready output/details. The exact AMI replay reaches root validation
   after the last hash without a further external await; the old React operation's
   full return is not separately exposed or claimed.
5. Download the cached SPI without another Check: it equals the fresh replacement
   result. Document time origin remains unchanged. Load the exact same invalid
   file ungated: the current missing/ambiguous-root alert is visible and the full
   queue/output remain ready. In that same open dialog, valid paused-session retry
   clears the alert, invalidates output and passes single-mutation Undo/Redo plus
   fresh known subset/full rebuilding.
6. Independently reopen the retained post-rejection-replacement SPI and the eight
   earlier history/retained outputs. Nine reanalyses confirm 70 Forms, a unique
   moved Ref and correct full/paused Security, Boot and suppression states.
   Changed-image session rejection leaves an empty queue and disabled output.
   No application page errors occurred. The complete checker passed first attempt.

All seventeen downloads are complete 8,388,608-byte SPIs: three move-only results,
SHA-256 `b1d6224b3ff47692e56ee5c42e7e9055c2154fccfcb3b79ac9fe713df745705f`,
12,295 changes only in Setup FFS `[4612464, 4781106)`; fourteen full results,
SHA-256 `264f90a0934848916bdc3e123564ce5c67c068faa6c48ee03e756f7c21f3aaae`,
140,913 changes only inside that FFS and companion `[3239384, 3419918)`.
Every non-BIOS and outside-owner byte is unchanged. Expected hashes/counts,
allocation, codec, checksum, buffer ownership, independent reconstruction and
15-minute Check guards remain unchanged. The opt-in command above reproduces
this extension. No standalone engine rerun or new synthetic acceptance is claimed.
Firefox installation recovered from a primary archive failure through its normal
fallback mirror before testing; that was not an application failure.

This establishes controlled semantic-rejection timing across dialog closure plus
same-byte source unmount/reset, not isolated source cancellation, distinct-image
replacement, other rejection causes, ordinary scheduling, actual I/O or hardware.
Combined v1, other save/load races/hash boundaries, missing qualifying uncompressed
AMI/mixed sources, P53 dynamic roots and new BIOS retain their separate gates.

## Controlled final save hash across Clear/Undo with the dialog kept open

Reproduced on 2026-10-18 (Europe/Madrid) against deployed main
`0d1f6bf61831d1c5d2600a7347945f8083b15da3` (PR #195), after fresh exact-SHA
[Quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39071768001)
and automatic [Pages build/deployment](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39071768039)
success. Firefox 153.0 / Playwright 1.62.1, headless Linux, 1600 × 1000 used the
documented container/certificate settings. Loaded assets were
`index-LM6CCH_b.js`, `index-D4JOsfQ5.css`, `tiano-decompress.wasm` and
`ifrextractor.wasm`. The authorized original SPI was size/SHA-256 checked afresh;
firmware, decoded/editor/session JSON and downloads remain private and local.
The checker removes its private intermediates on exit; CI has no private input.

The checker shares the existing final-native-save-hash gate between the earlier
source-reopen sequence and this separate queue/history sequence. Its successful
current save measures five completed native hashes, zero pending. The gate uses
that measured count, forwards native receiver/arguments/result unchanged and
holds only delivery of the last successful digest. The native digest method is
restored when that call starts. A forwarding JSON Blob URL counter retains no
content and returns native URLs unchanged. No production behavior changes.

1. From a ready four-enabled queue/output, start Save queue session. Require all
   five native calls completed, four results delivered, final result held, zero
   JSON URLs and no session download; validating status is visible and output/
   details remain ready before mutation.
2. Keep dialog and source open. Clear empties the queue and invalidates Apply/
   Check/download/details. Undo restores the four selected entries in the same
   order without restoring output. The old final digest remains held; no dialog
   close, source reset, Apply or newer session request occurs.
3. Deliver the unchanged final digest, require all five results delivered and
   none held, then drain two animation frames. Before any further session action,
   require zero JSON Blob URLs and no session download, no stale saved message
   or alert, the full selection unchanged, output still invalidated and Apply
   available. Returning to equal entries has not revived the old save context.
   Review of `saveHiiQueueSession` confirms no further external await after its
   final identity digest; the old React operation's full return is not separately
   exposed. Individual entry-reference/request-token internals are not isolated.
4. Positive control in that same open dialog: a current Save creates exactly one
   JSON Blob URL and session download, equals the expected metadata-only full v2
   session and shows the saved message. Selection and invalidated output remain
   unchanged. Restore the URL wrapper, then Apply/Check/download afresh. The full
   SPI equals the known full result byte for byte; document time origin is unchanged.
5. All earlier paused/full outputs, session load Undo/Redo, source-reopen probes
   and current/stale semantic rejection controls still pass. Independently reopen
   this new post-history-save full SPI and the nine earlier history/retained
   outputs: ten reanalyses confirm 70 Forms, the unique moved Ref and correct
   full/paused Security, Boot and suppression states. Changed-image session
   rejection leaves an empty queue and disabled download. No application page
   errors occurred. The complete checker passed on its first attempt.

All eighteen downloads are complete 8,388,608-byte SPIs: three move-only results,
SHA-256 `b1d6224b3ff47692e56ee5c42e7e9055c2154fccfcb3b79ac9fe713df745705f`,
12,295 changes only in Setup FFS `[4612464, 4781106)`; fifteen full results,
SHA-256 `264f90a0934848916bdc3e123564ce5c67c068faa6c48ee03e756f7c21f3aaae`,
140,913 changes only inside that FFS and companion `[3239384, 3419918)`.
Every non-BIOS and outside-owner byte remains identical. Expected hashes/counts,
allocation, codec, checksum, buffer ownership, independent reconstruction and
15-minute Check guards are unchanged. The same opt-in command above reproduces
the extension. No standalone engine rerun or new synthetic acceptance is claimed.

This accepts controlled successful final save-hash delivery across this queue/
history invalidation, without competing dialog/source/new-request cancellation.
It does not establish other save hash boundaries, stale save rejection, ordinary
scheduling, actual I/O, distinct-source replacement, other selections or hardware.
Combined v1, other session races, missing qualifying uncompressed AMI/mixed
sources, P53 dynamic roots and new BIOS retain their separate gates.

## Dependent Hide/Show Boot v2 sessions and paused restoration

Reproduced on 2026-10-18 (Europe/Madrid) against deployed main
`baa10361cac80441b7ad46a6192d4ac32f115438` (PR #196), after fresh exact-SHA
[Quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39075283563)
and automatic [Pages build/deployment](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39075283570)
success. Firefox 153.0 / Playwright 1.62.1, headless Linux, 1600 × 1000 used the
documented container/certificate settings and `index-LM6CCH_b.js`,
`index-D4JOsfQ5.css`, `tiano-decompress.wasm`, `ifrextractor.wasm`. The existing
authorized complete SPI was size/SHA-256 checked afresh. No browser API, queue,
codec or writer was mocked, timing-gated or fault-injected in this run.

The extended Boot restore checker retains its original four-edit baseline,
five-entry Hide/Show output, removed-dependency UI rejection, net-three equivalence
and independent rereads. The additional session sequence is:

1. From the coherent five-enabled queue with restored output ready, save v2
   `hii-menu-actions`. Assert exact top-level/source keys and all five operation
   objects: the existing Ref move, mapped Security flags and suppression override,
   then root index 4 hidden and root index 4 visible. Only identities, selectors,
   desired values and enabled flags are exported, not source/decoded bytes,
   patches, offsets, labels, history or Apply/output state.
2. Clear the queue and require output invalidation. Load the exported session,
   require all five titles/order/enabled flags and no restored output. Re-export
   is JSON-value identical. Fresh Apply/Check/download equals the previously
   checked five-entry result byte for byte and matches the independent engine hash.
3. Change only Hide's enabled flag to false in private session metadata, leaving
   Show enabled; identities and selectors are unchanged. Import rejects with
   `contains a menu action with no change`: Show cannot regenerate a meaningful
   restoration against a prefix in which Hide was not selected. The original
   five-enabled queue/order, Check, download and details remain intact. Export
   after this rejection exactly equals the original valid session.
4. Repeat with both Hide and Show paused. Import still rejects with the same
   semantic diagnostic and retains the full queue/output. Pausing Show does not
   exempt it from regeneration against the selected prefix. This is not schema,
   missing-root or source-identity rejection; no validator is changed to accept it.
5. Without closing the dialog to hide that error, load the valid variant with
   Hide enabled and only Show paused. Observe the actual five-entry/four-selected
   projection, cleared alert and invalidated output. Re-export equals that exact
   paused session. Fresh Apply/Check/download matches the known four-edit full
   SPI with Boot hidden. Reselect Show through its checkbox: output invalidates
   again; fresh Apply/Check/download equals the restored five-entry result.
6. The existing removal of Show and Hide still yields the identical three-edit
   result. Independently reopen five actual downloads: original restored,
   net-three, session-restored, paused-Show and reselected-Show. All retain 70 Forms,
   Security `00`, the empty suppression scope and the unique Ref moved to Form 5.
   Paused Show retains root vector `1111011`; the other four have `1111111`.
   Source replacement resets output/details. No application page errors occurred.
   The complete checker passed first attempt.

All six downloads are complete 8,388,608-byte SPIs. The two hidden-Boot outputs
retain SHA-256 `264f90a0934848916bdc3e123564ce5c67c068faa6c48ee03e756f7c21f3aaae`
and 140,913 changes. The four restored/net-three outputs retain SHA-256
`d9c22589b68884e973af22f87f718b7fc9fb130bfbdcca3871a55c12d294f3be`
and 49,938 changes. Every changed byte remains inside the original FFS owners
`[3239384, 3419918)` and `[4612464, 4781106)`; every non-BIOS byte is identical.
Expected hashes/counts, allocation, codec, checksum, ownership, independent
reconstruction and 15-minute Check guards remain unchanged. The checker now waits
for the actual first row before inspecting a mounted dialog's order, under the
unchanged timeout. Firefox installation recovered through its normal fallback
mirror after the primary archive failed; this was not an application failure.

```bash
FIRMWARE_ACCEPTANCE_IMAGE=/path/to/source.bin \
node scripts/firmware-tiano-boot-restore-firefox-acceptance.mjs
```

Private firmware, decoded/editor/session JSON and outputs stay local and are
removed on exit; public CI has no private input. This adds exact-source real
Firefox acceptance, not a standalone engine rerun or new synthetic acceptance.
Other dependent selections, five-entry session Undo/Redo, reordering, asynchronous
session races, combined v1, distinct sources and hardware remain separate gates.
Uncompressed AMI/mixed HII still lack qualifying real-source acceptance; no
format, allocation-growth, capsule, new BIOS or P53 dynamic-root allowance is added.

## Dependent paused-session Undo/Redo and fresh output

Reproduced on 2026-10-18 (Europe/Madrid) against deployed main
`17a84c89e4f149e3bfe28e0ac67ca6503c2b5016` (PR #197), after fresh exact-SHA
[Quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39079090307)
and automatic [Pages build/deployment](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39079090306)
success. Firefox 153.0 / Playwright 1.62.1, headless Linux, 1600 × 1000 used the
documented container/certificate settings and `index-LM6CCH_b.js`,
`index-D4JOsfQ5.css`, `tiano-decompress.wasm`, `ifrextractor.wasm`. The original
authorized complete SPI was size/SHA-256 checked afresh. No browser API, editor,
queue, codec or writer was mocked, timing-gated or fault-injected in this run.

The same Boot restore checker above retains the complete preceding dependency
session flow, including both missing-Hide rejections and valid paused-Show retry.
After loading that valid five-entry session over the five-enabled queue:

1. Undo once restores all five entries selected, in the exact same physical
   order, without restoring Apply/output. Export equals the original full v2
   session exactly. Redo once returns the first four selected and Show paused;
   export equals the paused session exactly. Check/download/details remain
   invalidated throughout. One load is one undoable replacement, not five edits.
   The wait observes all five actual checkbox flags before checking titles/order;
   it does not mistake an already enabled Apply button for load completion.
2. Apply/Check/download the post-Redo queue afresh: it equals the known hidden-Boot
   SPI. Undo from this ready-output state returns the five selected entries and
   invalidates Check/download/details again. Redo remains available. Fresh Apply/
   Check/download equals the known restored five-entry SPI byte for byte.
3. Redo is still available after Apply/Check. Redo once from ready restored output
   returns Show paused and invalidates output again, rather than reviving old
   checked bytes. Redo is now exhausted. Fresh Apply/Check/download equals the
   earlier hidden-Boot result byte for byte. The existing Show reselection and
   net-three removal/rebuilding sequence then still passes.
4. Independently reopen the two new post-history downloads and the five earlier
   restored/net-three/session variants: seven reanalyses confirm 70 Forms,
   Security `00`, the empty suppression scope and unique Ref moved to Form 5.
   The post-Redo image has exact vector `1111011`; post-Undo has `1111111`.
   Source replacement resets output/details. No application page errors occurred.
   The complete checker passed on its first attempt.

All eight downloads are complete 8,388,608-byte SPIs. Three hidden-Boot outputs
retain SHA-256 `264f90a0934848916bdc3e123564ce5c67c068faa6c48ee03e756f7c21f3aaae`
and 140,913 changes; five restored/net-three outputs retain SHA-256
`d9c22589b68884e973af22f87f718b7fc9fb130bfbdcca3871a55c12d294f3be`
and 49,938 changes. All changes remain within the original FFS owners
`[3239384, 3419918)` and `[4612464, 4781106)`; every non-BIOS byte is identical.
Expected hashes/counts, allocation, codec, checksum, buffer ownership, independent
reconstruction and 15-minute Check guards remain unchanged. No production code
changes. Firefox installation recovered through its normal fallback mirror after
the primary archive failed, before application testing.

Use the same Boot restore opt-in command above. Private source, decoded/editor/
session JSON and output files stay local and are removed on exit; CI has no
private input. This is exact-source real-Firefox acceptance, not a standalone
engine rerun or new synthetic acceptance. Other five-entry histories/selections,
reordering, session races, combined v1, distinct sources and hardware remain
separate. Missing uncompressed AMI/mixed sources and unsupported formats,
allocation growth, capsules, new BIOS and P53 dynamic roots retain their gates.

## Dependent session order and atomic rejection

Reproduced on 2026-10-18 (Europe/Madrid) against deployed main
`9af4668100878394413245bd979962213837fec7` (PR #198), after fresh exact-SHA
[Quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39090130804)
and automatic [Pages build/deployment](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39090130848)
success. Firefox 153.0 / Playwright 1.62.1, headless Linux, 1600 × 1000 used the
documented container/certificate settings and `index-LM6CCH_b.js`,
`index-D4JOsfQ5.css`, `tiano-decompress.wasm`, `ifrextractor.wasm`.
The authorized original SPI was size/SHA-256 checked afresh. No browser API,
queue, codec or writer was mocked, timing-gated or fault-injected.

The Boot restore checker retains the preceding session/history/output sequence
and now adds the following after five-enabled restored output is ready:

1. Swap only the final Hide and Show operation objects in private v2 metadata;
   leave identity, selectors and the first three operations unchanged. With Show
   enabled, load rejects with `contains a menu action with no change`: Show runs
   before its prerequisite Hide against the selected prefix. The exact original
   five titles/order/selections and enabled Check/download/details remain intact.
   Re-export equals the original full session exactly and clears the alert.
2. Repeat with the earlier Show paused. It still rejects semantically, with the
   same retained queue/ready controls and exact original re-export. Each attempt
   starts without an alert, so an earlier rejection cannot satisfy the next wait.
   No schema or validator is relaxed to accept a paused no-op.
3. Load the valid order move, SetupData, Hide Boot, Show Boot, suppression. All
   five actual titles/order/checkbox flags must change to that exact sequence;
   re-export equals the reordered metadata. Apply remains available but Check,
   download and details invalidate. Fresh Apply/Check/download reproduces the
   known restored SPI byte for byte. Removing Show and Hide still produces the
   identical net-three output.
4. Independently reopen the new reordered output and the seven earlier variants.
   All eight reanalyses retain 70 Forms, Security `00`, the unique Ref moved to
   Form 5 and the empty suppression scope. The reordered image has all seven
   roots visible; both hidden post-session/history variants retain `1111011`.
   Source replacement resets output/details. No application page errors occur.
   The complete checker passed on its first attempt.

All nine downloads are complete 8,388,608-byte SPIs: three hidden outputs retain
SHA-256 `264f90a0934848916bdc3e123564ce5c67c068faa6c48ee03e756f7c21f3aaae`
and 140,913 changes; six restored/net-three outputs retain
`d9c22589b68884e973af22f87f718b7fc9fb130bfbdcca3871a55c12d294f3be`
and 49,938 changes. All changes stay inside original FFS owners
`[3239384, 3419918)` and `[4612464, 4781106)`; every non-BIOS byte is identical.
No expected hash/count, codec, checksum, allocation, ownership, independent
reconstruction or 15-minute Check guard changed. No production code changes.
The normal Firefox/FFmpeg installer fallback recovered from invalid primary
archives before application testing.

Use the same Boot restore opt-in command above. Private firmware, decoded/editor/
session JSON and outputs remain local and are removed on exit; CI has no private
input. This is exact-source Firefox acceptance, not a standalone engine rerun,
new synthetic acceptance or hardware validation. Other dependent selections,
permutations/histories, session races, distinct-source replacement, combined v1
and hardware remain separate. Uncompressed AMI/mixed missing-source gates,
unsupported formats, growth, capsules, new BIOS and P53 dynamic roots are unchanged.

## Combined v1 migration and independent four-edit reread

Reproduced on 2026-10-19 (Europe/Madrid) against deployed main
`d5ca88e449bc7161a6fa8879fc3af309516b0fdf`, after successful exact-SHA
[Quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39185810408)
and automatic [Pages build/deployment](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39185810407).
Firefox 153.0 / Playwright 1.62.1 build 1538, headless Linux, 1600 × 1000 used
the documented container/certificate settings, `index-DvYis56o.js`,
`index-D4JOsfQ5.css`, `tiano-decompress.wasm` and `ifrextractor.wasm`.
The existing authorized archive supplied the exact source, checked by size and
SHA-256. No new source or semantic inventory was added. No browser API, editor,
queue, codec, writer, response or download was mocked, timing-gated or fault-injected.

The base combined-session checker above now separately exercises v2 and legacy
`hii-menu-actions` v1. The latter changes only the exported version, retaining
the same four explicit action objects and identities; it is not the Ref-only
kind. For each version, Clear/load restores four selected operations without
Apply or cached output. Check/download/details remain disabled. Re-export must
pass the complete metadata-only schema and equal the original v2 deeply,
including every ordered selector, enabled flag and both identity hashes.
Fresh Apply/Check is required before each actual download.

Both complete 8,388,608-byte SPI downloads are byte-identical, SHA-256
`264f90a0934848916bdc3e123564ce5c67c068faa6c48ee03e756f7c21f3aaae`.
Each local full-image scan finds 140,913 changed bytes, all inside the two
original FFS owners above, with zero outside-owner or outside-BIOS changes.
All 1,572,864 Descriptor/ME bytes are identical. These are independent byte
comparisons, not a new byte-report UI acceptance or standalone engine rerun.

Each actual downloaded file is independently analysed after a fresh page reload.
Both retain 70 Forms, Security flags `00`, root vector `1111011`, no DRAM Timing
Control Ref in source Form index 3 and exactly one in destination Form index 5,
and the `0x8B359` suppression's unchanged expression with an empty body. Loading
the corresponding original v2/v1 session rejects with the changed-image/context
diagnostic, empty queue and disabled download. No application page errors
occurred; the extended base checker passed its first complete run.

Use the original base-checker command above. This closes only the exact four-enabled
combined-v1 gate. Paused/dependent v1 variants, other sequences, asynchronous
races, other sources, human file pickers and hardware/recovery remain separate.
All source/ownership, buffer, codec, checksum, allocation, 15-minute build and
independent reconstruction/reread guards are unchanged; no production code changed.
Private firmware, decoded/editor/session JSON and downloads remain local;
checker intermediates are removed on exit and public CI has no private input.
