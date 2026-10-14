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
