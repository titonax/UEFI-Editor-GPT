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

## Complete-SPI byte reports before and after history invalidation

Reproduced on 2026-10-18 (Europe/Madrid) against deployed main
`fa9d377a0c46d2287ddc16b38fea2855914eb43d` (PR #202), after exact-SHA
[Quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39111459872)
and [Pages build/deployment](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39111459930)
success. The authorized original source was recovered afresh and verified for
its complete size/SHA-256 above. Firefox 153.0 / Playwright 1.62.1, headless
Linux, 1600 × 1000 loaded `index-LM6CCH_b.js`, `index-D4JOsfQ5.css`,
`firmware-decompress.wasm` and `ifrextractor.wasm`. Container sandbox/certificate
options match the existing checker. No browser API, application, queue, codec,
writer or download result was mocked or fault-injected.

The extended opt-in checker above now independently scans each actual complete
SPI download and checks the report shown for that exact verified result:

1. Stage the same accepted Debug Settings Ref move, run the existing staging
   Undo/Redo and Clear/Undo checks, then Apply/Check/download the first complete
   SPI. Only after size/hash and every-byte confinement checks pass, open Output
   details and compare every displayed byte-report field with an independent
   run-based scan of the original source and actual download.
2. Require exact changed/unchanged totals and total contiguous range count.
   Compare all 64 displayed start/end-exclusive offsets, lengths and original/
   rebuilt samples with the first physical ranges found by that scan. At least
   one displayed range exceeds 16 bytes, exercising sample truncation; the total
   exceeds 64, exercising omitted ranges. Expectations never come from the DOM
   or the production comparison helper. Source/rebuilt samples stay local and
   are not printed in checker row-comparison diagnostics.
3. Verify the full-image summary, BIOS boundary, preserved non-BIOS count and
   both enclosing FFS ranges against the existing accepted source evidence.
   The modified-module report has two physical copies at decoded FFS offset
   `0x3EFAD0`, buffers 2 and 4. Both LZMA rows have the accepted original/rebuilt
   packed sizes, checked capacity and remaining bytes. Closing the report leaves
   Check/download/details enabled.
4. Redo the old Clear, then Undo back to the same Ref queue. Check/output/details
   invalidate until a new Apply/Check completes. Download the fresh SPI and
   repeat the entire independent report comparison. Both files are byte-identical;
   neither Apply nor verified bytes were restored from history. The subsequent
   Clear/Undo/removal/Redo-discard and page-reload history reset checks still pass.
5. Independently reload and analyse **both actual downloaded files** with the
   ordinary vendor-neutral HII path. Each has exactly one Debug Settings Ref row,
   FormId `0x1006`, with PCI Subsystem Settings as parent and no Intel Advanced
   Menu parent. The new source has no cached output. No application page errors
   occur.

| Reproduced report field, each SPI              |                  Value |
| ---------------------------------------------- | ---------------------: |
| Complete image bytes                           |             33,554,432 |
| Changed / unchanged bytes                      | 8,991,518 / 24,562,914 |
| Total / displayed contiguous ranges            |            35,004 / 64 |
| Maximum bytes in each original/rebuilt sample  |                     16 |
| Preserved non-BIOS bytes                       |             10,485,760 |
| Verified physical Setup copies                 |                      2 |
| Original packed / rebuilt bytes, each LZMA row |  4,513,620 / 4,491,300 |
| Checked capacity / remaining bytes, each row   |     4,513,620 / 22,320 |

Both complete SPI files retain SHA-256
`4c52549b9df88a7763eedf4fa0cf842909d800431b10a88c76d73c851792d10b`.
All changes are inside the original two enclosing FFS owners; every byte outside
BIOS is identical. The report's numeric allocation/copy fields match the
independently established engine record above; this is not permission to grow an
allocation or edit another module. Normal writer checks still independently
reopen and verify the physical copies before enabling a download.

Use the same opt-in command above. Firefox was initially absent from this
execution environment, so the first launch could not run. After installing the
matching Firefox 153.0 build, the complete extended checker passed, without
changing any timeout, expected output or guard. Private firmware and downloads
remain local; intermediates are removed on exit and public CI has no source.
This adds exact-source **deployed Firefox report acceptance**, not a standalone
engine rerun, new synthetic acceptance, dynamic-root work or physical flashing.
Other sources/report variants, sessions beyond their separate accepted scopes,
zero-change output and hardware remain separate gates. Missing qualifying
uncompressed AMI/mixed sources, unsupported codecs/growth/capsules, new BIOS and
P53 dynamic roots keep their existing limits.
