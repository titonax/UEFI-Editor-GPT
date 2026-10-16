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
