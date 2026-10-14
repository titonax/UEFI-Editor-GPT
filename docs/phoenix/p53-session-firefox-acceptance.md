# P53 deployed Firefox queue-session acceptance

## Deployment and scope

Recorded on 2026-10-14 against the deployed application at
<https://titonax.github.io/UEFI-Editor-GPT/>:

- Revision: `92a2796af53e90120e1eaa22bf0cc34e722b15fc` (merged PR #158).
- Browser: Firefox 153.0, Playwright 1.62.1 Firefox build 1538, headless Linux,
  viewport 1600 by 1000. The container required content sandbox level zero to
  create a page; this is a test-environment setting, not an application change.
- Source: the existing accepted 33,554,432-byte SPI image, SHA-256
  `68eba5b369baf36c879551c0482a6feea31d68082bc4dd0631bf9e4427a88a64`.
- Loaded production assets: `assets/index-_Q4xhBY9.js`,
  `assets/index-D4JOsfQ5.css`, `firmware-decompress.wasm` and
  `ifrextractor.wasm`.

This is actual deployed Firefox interaction with the existing real source, not
jsdom or a locally substituted editor. The source and generated JSON/output stayed
in an isolated local temporary directory. Firmware, decoded modules, NVRAM,
serials and session files were not uploaded or committed; this record contains
technical metadata only.

## Reproduced flow

1. Select the original complete SPI through the production file input and start
   vendor-neutral HII analysis. Stage **Debug Settings** from **Intel Advanced
   Menu** to **PCI Subsystem Settings** through the real tree and destination
   controls.
2. Save `firmware-session.json` from **Change queue (1)**. The parsed file is
   format `uefi-editor-queue-session`, version 2, kind `hii-menu-actions`, with
   the matching full-image size/hash, one selected `move-ref` operation and no
   firmware bytes, decoded payload, offsets or replacement bytes. The observed
   selectors are `sourceFormIndex: 0`, `referenceChildIndex: 2` and
   `destinationFormIndex: 3`.
3. Clear the queue, load that v2 file through the production session input, and
   require the same single operation before Apply. The restored plan has no
   verified output until a fresh Apply and **Check firmware output** complete.
4. Download the newly verified complete image. Independent local comparison
   confirms 33,554,432 bytes, SHA-256
   `4c52549b9df88a7763eedf4fa0cf842909d800431b10a88c76d73c851792d10b`
   and 8,991,518 changed bytes. Every change lies within the two enclosing FFS
   allocations `[13238344, 17752012)` and `[21495880, 26009548)`; all bytes
   before the 10,485,760-byte BIOS region boundary are unchanged.
5. Locally derive a strict legacy file by changing only version to 1, kind to
   `hii-ref-moves` and removing the v2 action discriminator. Load it over the
   verified v2 plan. Migration replaces the queue as an unapplied plan and
   invalidates the prior download. A fresh Apply, Check and download produce an
   output byte-identical to the v2 result above.
6. Open that output as a new source and run HII analysis again. Loading the
   original v2 session is rejected for the different full-image/context identity;
   the queue stays empty and download stays disabled.

The executable reproduction is
`scripts/firmware-p53-session-firefox-acceptance.mjs`. It requires the exact
private source through `FIRMWARE_ACCEPTANCE_IMAGE` and an explicit Firefox
executable. Its assertions cover the exported schema, selected operation,
session-only metadata, output ownership, complete SPI preservation, v1/v2 byte
equality, invalidation and atomic identity rejection.

## Limits

This record accepts portable v2 export/import and bounded v1 migration only for
the exact supported static P53 Setup Ref move and source identity above. It does
not establish other session actions, another P53 image, dynamic/runtime roots,
human-operated desktop file-picker behavior, other browser versions or physical
flashing/recovery. Synthetic engine and React/jsdom tests remain distinct from
this deployed Firefox plus real-source result.
