# Exact Tiano combined queue history in deployed Firefox

Reproduced on 2026-10-15 at <https://titonax.github.io/UEFI-Editor-GPT/>
against `f770ba396df119988235d9d717b7057bd0ce0d5b` (merged PR #163).
[Code quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/38624343790)
and [Pages](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/38624343952)
were successful for that exact SHA before the run.

Firefox 153.0, Playwright 1.62.1 build 1538, headless Linux, viewport 1600 × 1000,
loaded `index-_Q4xhBY9.js`, `index-D4JOsfQ5.css`, `tiano-decompress.wasm` and
`ifrextractor.wasm`. Explicit container sandbox/certificate settings did not
change the app. No editor, queue, codec, builder or download was mocked.

The authorized existing complete SPI source is 8,388,608 bytes, SHA-256
`297390ca838c455791a5bf3a3f0001fbf36a8cb31be362ea2123b8df84dfffe8`.
Firmware, editor JSON and downloads stayed private and local. See
[combined engine acceptance](tiano-combined-queue-acceptance.md) and
[combined session acceptance](tiano-session-firefox-acceptance.md) for source,
operation and ownership evidence.

## Actual history flow

1. Stage the accepted four-operation queue through deployed controls: move DRAM
   Timing Control to CPU Power Management, set Security flags `01` to `00`,
   import the source-bound `0x8B359` suppression override and hide Boot.
   The unassociated suppression uses editor JSON, not a direct Show button.
2. Clear and Undo before Apply. All four selected operation titles return;
   output checking, download and details remain disabled.
3. Apply, Check and explicitly download the complete verified SPI.
4. Redo the earlier Clear with that output ready, then Undo. Both transitions
   invalidate output; restoring the identical four-operation queue does not
   restore the applied state or cached download. Apply selected is enabled,
   but Check remains disabled until a new Apply.
5. Apply/Check/download anew. Both files are byte-identical and each passes
   exact size/hash, changed-byte count and complete-image boundary comparisons.
6. Clear/Undo after the second verified output again invalidates it. Remove the
   last operation as a new mutation: Redo becomes disabled. Undo restores all
   four selected operations without restoring verified bytes.
7. Reload the page and analyse the same original source: empty queue/history,
   Undo and Redo disabled, no applied output. This is page reload, not an
   in-place source replacement race.
8. Reload the actual downloaded output and export freshly parsed editor data.
   It confirms 70 Forms, Security flags `00`, Boot root value zero, no DRAM
   Timing Control Ref in its old Form and exactly one in CPU Power Management,
   plus an empty suppression body at `0x8B359`. No page errors occurred.

| Reproduced field              | Value                                                              |
| ----------------------------- | ------------------------------------------------------------------ |
| Complete output, both files   | 8,388,608 bytes                                                    |
| SHA-256, both files           | `264f90a0934848916bdc3e123564ce5c67c068faa6c48ee03e756f7c21f3aaae` |
| Changed bytes, each           | 140,913                                                            |
| Changes outside owners / BIOS | 0 / 0                                                              |
| Original FFS owners           | `[3239384, 3419918)` and `[4612464, 4781106)`                      |
| Non-BIOS bytes preserved      | 1,572,864                                                          |

Normal allocation, codec, checksum and independent reconstruction-reader guards
run unchanged before every download. No source or format acceptance is expanded.

## Reproduce and limits

With Playwright and real Firefox installed, supply the private accepted source:

```bash
FIRMWARE_ACCEPTANCE_IMAGE=/path/to/source.bin \
node scripts/firmware-tiano-history-firefox-acceptance.mjs
```

Optional browser settings match the Tiano session checker. Reconstruction stays
bounded to 15 minutes; private intermediates are removed on success or failure.
Public CI never supplies the firmware.

This establishes exact-source AMI four-operation history acceptance in Firefox.
Vendor-neutral HII history, other sources, paused/reordered plans, the 50-entry
limit, in-place source replacement and late asynchronous completion remain
separate synthetic/jsdom or pending real-browser gates. Hardware, desktop picker,
AMITSE retargeting and broader compression are not established. Unsupported
codecs, growth and capsules stay blocked; P53 dynamic roots and new BIOS remain
parked.
