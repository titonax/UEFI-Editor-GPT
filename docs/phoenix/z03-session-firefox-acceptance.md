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
