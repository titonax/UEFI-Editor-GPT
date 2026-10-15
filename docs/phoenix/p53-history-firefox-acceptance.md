# Exact P53 static Ref queue history in deployed Firefox

Reproduced on 2026-10-15 at <https://titonax.github.io/UEFI-Editor-GPT/>
against `25d7d94dc821b0eeff7bd9838bd647f0d1890c41` (merged PR #164).
[Code quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/38654656453)
and [Pages](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/38654656418)
were successful for that exact SHA before the run.

Firefox 153.0, Playwright 1.62.1 build 1538, headless Linux, viewport 1600 × 1000,
loaded `index-_Q4xhBY9.js`, `index-D4JOsfQ5.css`, `firmware-decompress.wasm`
and `ifrextractor.wasm`. Explicit container sandbox/certificate settings did not
change the app. No editor, queue, codec, builder or download was mocked.

The authorized existing complete SPI source is 33,554,432 bytes, SHA-256
`68eba5b369baf36c879551c0482a6feea31d68082bc4dd0631bf9e4427a88a64`.
Firmware and downloads stayed private and local. See
[mirrored engine acceptance](p53-mirrored-lzma-output-acceptance.md) and
[static Ref session acceptance](p53-session-firefox-acceptance.md) for source,
operation and ownership evidence.

## Actual history flow

1. Analyse the original source through vendor-neutral HII controls and move
   Debug Settings from Intel Advanced Menu to PCI Subsystem Settings. Undo
   empties the staged queue; Redo restores the one selected operation. Check,
   download and details stay disabled.
2. Clear and Undo before Apply. The selected Ref operation returns, without
   an applied plan or verified output.
3. Apply, Check and explicitly download the complete verified SPI.
4. Redo the earlier Clear with that output ready, then Undo. Both transitions
   invalidate output; restoring the identical Ref queue does not restore the
   applied state or cached download. Apply selected is enabled, but Check
   remains disabled until a new Apply.
5. Apply/Check/download anew. Both files are byte-identical and each passes
   exact size/hash, changed-byte count and complete-image boundary comparisons.
6. Clear/Undo after the second verified output again invalidates it. Remove the
   operation as a new mutation: Redo becomes disabled. Undo restores the selected
   operation without restoring verified bytes.
7. Reload the page and analyse the same original source: empty queue/history,
   Undo and Redo disabled, no applied output. This is page reload, not an
   in-place source replacement race.
8. Reload the actual downloaded output and run fresh HII analysis. Its
   navigation table has exactly one Debug Settings Ref row, FormId `0x1006`,
   with PCI Subsystem Settings as parent, not Intel Advanced Menu. This uses
   the HII navigation table, not AMI's editor-JSON export. No page errors occurred.

| Reproduced field              | Value                                                              |
| ----------------------------- | ------------------------------------------------------------------ |
| Complete output, both files   | 33,554,432 bytes                                                   |
| SHA-256, both files           | `4c52549b9df88a7763eedf4fa0cf842909d800431b10a88c76d73c851792d10b` |
| Changed bytes, each           | 8,991,518                                                          |
| Changes outside owners / BIOS | 0 / 0                                                              |
| Original enclosing FFS owners | `[13238344, 17752012)` and `[21495880, 26009548)`                  |
| Non-BIOS bytes preserved      | 10,485,760                                                         |

Normal allocation, codec, checksum, mirrored-copy and independent
reconstruction-reader guards run unchanged before every download. No source,
format or runtime-root acceptance is expanded.

An initial checker attempt incorrectly waited for AMI's `data.json` export
after HII reload and timed out. That attempt was not accepted as a completed
flow. The final checker uses the existing HII navigation table for reread;
the complete history/rebuild flow was rerun, without extending time limits.

## Reproduce and limits

With Playwright and real Firefox installed, supply the private accepted source:

```bash
FIRMWARE_ACCEPTANCE_IMAGE=/path/to/source.bin \
node scripts/firmware-p53-history-firefox-acceptance.mjs
```

Optional browser settings match the P53 session checker. Reconstruction stays
bounded to 15 minutes; private intermediates are removed on success or failure.
Public CI never supplies the firmware.

This establishes exact-source vendor-neutral HII static Ref history acceptance
in Firefox. Other sources, paused/reordered plans, the 50-entry limit, in-place
source replacement and late asynchronous completion remain separate
synthetic/jsdom or pending real-browser gates. Hardware, desktop picker, new
formats and dynamic/runtime roots are not established. Unsupported codecs,
growth and capsules stay blocked; P53 dynamic-root research and new BIOS remain
parked.
