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
