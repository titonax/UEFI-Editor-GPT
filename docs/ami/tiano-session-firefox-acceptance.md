# Exact Tiano combined v2 session in deployed Firefox

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

This establishes exact-source Firefox v2 combined-session acceptance. It does not
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
