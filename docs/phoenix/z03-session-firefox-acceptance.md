# Exact Z03 queue sessions in deployed Firefox

## Deployment and source

Recorded on 2026-10-14 at <https://titonax.github.io/UEFI-Editor-GPT/> against
revision `4be6cb6c519a5014018ee7e2b345c3aab03c70fc` (PR #157), production bundle
`assets/index-_Q4xhBY9.js`.
[Pages deployment](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/38529076439)
and [Code quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/38529076331)
completed successfully for that revision.

The browser was Firefox 153.0, Playwright 1.62.1 build 1538, headless Linux,
viewport 1600 by 1000. Content sandbox level zero was required by the test
container; the deployed application was unchanged. The Phoenix parser, editor,
session controls, queue, LH5 reconstruction, independent re-read and downloads
were the deployed production modules. No application module, network response,
codec or download adapter was mocked.

The input was the existing accepted 1,048,576-byte Z03 image, SHA-256
`d34c9695d6d54595836212021797dd7557cabae0d25fd33cd0faa87c25640194`.
The source, exported sessions and downloaded images remained local and private.
No new BIOS case or hardware result is claimed.

## Observed v2 and v1 flows

1. Open the complete source with **Start Phoenix Setup analysis**, select
   **Cache Ram** and queue its proven Show operation at item offset `0xEC9`.
2. Save `firmware-session.json` from **Change queue (1)**. The version-2 JSON
   contains only the format/kind/version, complete-image and decoded-template
   identities, and `{ "action": "show", "itemOffset": 3785, "enabled": true }`.
   It contains no firmware bytes, patches, labels, history, applied state or
   filename.
3. Clear the queue and load that v2 file through the deployed session control.
   The restored operation is enabled but unapplied. Apply it, check the firmware
   output and download the complete image.
4. Independently compare the download with the original. Its SHA-256 is
   `bbc4671779479575ec3fcb104e83e54242b09cb2e2da46655bc9d7d81b780134`;
   13,032 bytes differ and zero differences occur outside the existing
   `[0x6ED30, 0x72068)` TEMPLAT allocation.
5. Derive the strict legacy version-1 form locally by changing only `version` to
   `1` and removing the operation action. Load it over the checked v2 plan. The
   import invalidates the prior verified download, migrates in memory, restores
   an unapplied queue and requires Apply and Check again. Its new complete-image
   download is byte-identical to the v2 download and passes the same hash and
   allocation-preservation checks.
6. Reload the v2 output as a fresh Phoenix source and try to load the original
   v2 session. The deployed importer rejects the different image/template
   identity, leaves the queue empty and keeps download disabled.

The opt-in runner is
`scripts/firmware-phoenix-session-firefox-acceptance.mjs`. It requires the exact
private source through `FIRMWARE_ACCEPTANCE_IMAGE` plus a local Playwright
Firefox executable; public CI intentionally has neither. It checks the expected
source identity before opening the browser and deletes its temporary session and
output files after the run.

## Scope

This establishes a real-source, deployed-Firefox round trip for the already
supported Phoenix Show session, including v2 export/import, bounded v1 migration,
fresh Apply/Check, complete-image download, independent byte comparison and
source-identity rejection. It is separate from the synthetic schema tests and
React/jsdom tests.

It does not establish a human desktop file-picker flow, physical flashing or
recovery, root registration, structural menu editing, allocation growth, other
session actions, other firmware sources or broader Firefox compatibility. The
existing unsupported callback, compression, capsule, growth and dynamic-root
gates are unchanged.

## Native session-read cancellation before hashing

Reproduced on 2026-10-18 against deployed PR #205 main
`c4a10a43b41d8f2deb181f58ac0ba7dd4f1c13e8`.
[Code quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39135980166)
and [Pages](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39135980016)
had passed for that exact SHA. Firefox 153.0 / Playwright 1.62.1 build 1538,
headless Linux, viewport 1600 by 1000, loaded `index-DvYis56o.js` and
`index-D4JOsfQ5.css`. The same explicit container sandbox setting and a
certificate-error override were used. This Phoenix flow loaded no WASM asset.

The opt-in runner now accepts `FIRMWARE_BROWSER_SESSION_READ_PROBE=1` in addition
to the original private-source/browser settings. It wraps native `File.text`
delivery and counts calls to native `crypto.subtle.digest`; actual text and
digest results are unchanged. The app, queue, session validator, codecs, network
responses and download adapter are not mocked. Only native text delivery timing
is controlled. Firmware, session files and rebuilt images remain private/local.

1. Stage the original Cache Ram Show and export its metadata-only v2 session.
2. Start loading that real session. After native reading succeeds, hold its text
   before the application receives it; observe the validating status.
3. Keep the source and queue dialog open. Clear the queue, then Undo to the same
   Show entry. No newer session request supersedes the held load.
4. Release the original text. After delivery and a further browser task, the
   native digest call count remains unchanged: **zero new source/template hashes**.
   The restored Show queue remains present, without a stale loaded message,
   validating status or error; firmware download remains disabled. In this
   adapter both identity digests start before its first await, so this observes
   the new early-cancellation boundary, not only final commit cancellation.
5. Clear and load the current v2 session normally. Exactly **two native digests**
   run as the positive control. Apply/Check/download freshly produces the known
   1,048,576-byte ROM. The strict v1 migration also freshly produces identical
   bytes. Each independently scanned download has 13,032 changed bytes, all
   inside `[0x6ED30, 0x72068)`, and the existing accepted output SHA-256 above.
6. Reload the actual v2 download: Cache Ram Show is already applied and cannot
   be queued again. Loading the original session rejects the changed image/
   template, leaves the queue empty and keeps download disabled. No page errors
   occur.

This is controlled native timing in real Firefox with the exact existing Z03
source, not ordinary scheduling, a read/I/O failure, observation of the old
React handler's full return, or acceptance of another family/source. The probe
starts with an unapplied queue; it does not establish retention of a ready output
across cancellation. Dialog-close/source-replacement cases, late failures and
hardware remain separate gates. The existing 5-minute reconstruction limit,
allocation, codec, ownership and independent reader guards are unchanged.

## Closed-dialog cancellation with a ready output

Reproduced on 2026-10-18 against deployed PR #206 main
`4d044d7bfe333fbced7ce44b2b1c37905c9c00e4`.
[Code quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39140747065)
and [Pages](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39140747029)
were successful for that exact SHA. Firefox 153.0 / Playwright 1.62.1 build
1538, headless Linux, viewport 1600 by 1000, loaded `index-DvYis56o.js` and
`index-D4JOsfQ5.css`, with the same explicit container/certificate settings.
The private source identity and native timing instrumentation are unchanged.

Set `FIRMWARE_BROWSER_SESSION_READ_PROBE=close` on the original runner to
reproduce this distinct scenario; `=1` retains the earlier Clear/Undo probe.
Other supplied values reject explicitly.

1. Export the original Show queue's metadata-only v2 session. Apply, Check and
   explicitly download a fresh verified output before starting the held read.
2. Reopen the queue and load the real session. Hold successful native text
   delivery after the file is read and observe the validating status.
3. Close the queue dialog and wait until it is hidden. Do not clear, undo,
   replace the source or start a newer session request.
4. Release the old text. After delivery and another browser task, **zero new
   native identity digests** have started. Download and Output details remain
   enabled. Without pressing Check again, download the retained image and
   verify it equals the pre-read output. Reopen the queue: its Show entry is
   intact, with no stale loaded message, validating status or error.
5. Clear and load the current v2 file. Exactly **two native identity digests**
   run as positive control; Apply/Check freshly reproduces the known output.
   Strict v1 migration also freshly reproduces that output. All four actual ROM
   downloads (before hold, retained, v2 and v1) have 1,048,576 bytes, the accepted
   output SHA-256, 13,032 changed bytes and zero changes outside
   `[0x6ED30, 0x72068)`. Byte-equality assertions never print private buffers.
6. Reload the actual **retained** download. Cache Ram Show is already applied
   and cannot be queued again. The original session rejects its changed image/
   template identity, leaving an empty queue and disabled download. No page
   errors occur.

This establishes this exact Z03 closed-dialog/ready-output boundary with
controlled native delivery, not ordinary scheduling, I/O failure, source
replacement, late rejection or other-family acceptance. Waiting for the hidden
dialog combines closing and its component lifetime; this does not isolate
cancellation before animated unmount or observe the old handler's full return.
No app module, text/hash result, codec or network response is mocked; no writer
guard, timeout or accepted source is changed. Hardware remains unvalidated.

## Same-byte source reopen during a held session read

Reproduced on 2026-10-18 against deployed PR #207 main
`0eda4d6f566ff1b03971d5e4a9f54c97df618ff9`.
[Code quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39145259686)
and [Pages](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39145259546)
passed for that exact SHA. Firefox 153.0 / Playwright 1.62.1 build 1538,
headless Linux, viewport 1600 by 1000, loaded `index-DvYis56o.js` and
`index-D4JOsfQ5.css`. The same explicit container/certificate settings were used.

Use `FIRMWARE_BROWSER_SESSION_READ_PROBE=source` with the existing source/browser
settings. The earlier `=1` and `=close` modes remain separate scenarios. This
mode retains the same native text-delivery timing gate and native digest counter;
source/session content, native results and all app modules remain unchanged.

1. Save the original Show queue's v2 session, Apply/Check and download the known
   ROM. Begin loading that session and hold the successful native text read.
2. Close the queue, select **Load another firmware**, then open/analyse the same
   original bytes. A main-frame navigation counter proves this stays in the same
   document. The new editor has an empty queue, disabled Undo/Redo and disabled
   output/details. Cache Ram Show is available again, proving original state.
3. Stage Show directly, Apply/Check and download a fresh known ROM. No newer
   session save/load request has superseded the old held read.
4. Snapshot the digest counter after the new analysis/build, then deliver the old
   text. After delivery and a further browser task, **zero new native digests**
   start. The fresh output/details remain enabled. Download without another Check:
   it matches the ready output. The new Show queue has no stale loaded message,
   validating status or error.
5. A current v2 load executes exactly **two native digests** and freshly produces
   the accepted output. Strict v1 migration also freshly produces it. All five
   downloads (old ready, new ready, retained, v2 and v1) are 1,048,576 bytes with
   the known output SHA-256, 13,032 changed bytes and zero changes outside
   `[0x6ED30, 0x72068)`. Equality failures never log private buffers.
6. The actual retained download independently reopens with Cache Ram Show
   already applied. The original session rejects this changed image/template
   identity, retaining an empty queue and disabled output. No page errors occur.

This is exact-source same-byte close/reopen acceptance, not a different-image
replacement. Dialog closure and source/component lifetime reset are combined;
neither cancellation mechanism is isolated. Native timing control is not
ordinary scheduling, an actual I/O failure, a late rejection or observation of
the old React handler's full return. Other sources/families, distinct-image
replacement and hardware remain separate gates. No codec, allocation, checksum,
source ownership, reconstruction limit or independent reader guard is changed.
