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
Vendor-neutral HII history, other sources, paused/reordered plans,
in-place source replacement and late asynchronous completion remain
separate synthetic/jsdom or pending real-browser gates. Hardware, desktop picker,
AMITSE retargeting and broader compression are not established. Unsupported
codecs, growth and capsules stay blocked; P53 dynamic roots and new BIOS remain
parked.

## Fifty-step retained-history limit

Reproduced on 2026-10-19 (Europe/Madrid) against deployed main
`6f80e02bd4976461148a0b3c7dd0d3040efaf94f`, after successful exact-SHA
[Quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39223271828)
and automatic [Pages build/deployment](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39223271773).
Firefox 153.0 / Playwright 1.62.1 build 1538, headless Linux, 1600 × 1000 used
the same documented container/certificate settings and `index-DvYis56o.js`,
`index-D4JOsfQ5.css`, `tiano-decompress.wasm` and `ifrextractor.wasm`.
The authorized ChatGPT archive was recovered afresh, and the same exact source
size/SHA-256 above checked. No new BIOS or inventory was added.

After the two normal history reconstructions above, the extended checker:

1. Saves the exact four-enabled metadata-only v2 session from the ready queue.
   Toggles only the last Hide Boot entry's selected checkbox 52 times. The
   other three entries stay selected; actual selection is asserted at every
   step, Apply remains available, Redo is disabled and Check/download/details
   invalidate. The final state is the same full selection as the baseline.
2. Performs exactly 50 Undo steps, each from an enabled Undo control, asserting
   the alternating selected projection and disabled output after each. Undo then
   becomes disabled, while Redo is enabled. The oldest retained full-state
   session export is deeply identical to the original. Earlier staging/Clear
   history is no longer reachable through the UI.
3. Performs exactly 50 Redo steps with the same per-state assertions. Redo
   then becomes disabled and Undo remains enabled. The newest full-state export
   again equals the original, preserving identity, order, selectors and flags.
   Read-only session saving at the oldest state does not consume the Redo chain.
4. Requires fresh Apply/Check/download; restoring identical entries never
   revives the previous verified bytes or reports. The third SPI equals the
   first baseline byte-for-byte. Existing Clear/Undo, divergent mutation and
   same-source page-reload history-reset regressions still pass.
5. Independently reloads and analyzes all three actual downloads, not just the
   final result: 70 Forms, Security `00`, Boot zero, the unique moved Ref in CPU
   Power Management and the empty `0x8B359` suppression are confirmed each time.

The first complete run passed without mocks, timing gates or fault injection,
with no application page errors. All three are complete 8,388,608-byte SPIs,
SHA-256 `264f90a0934848916bdc3e123564ce5c67c068faa6c48ee03e756f7c21f3aaae`.
Each has 140,913 changes inside the two original FFS owners above; all 1,572,864
non-BIOS bytes and every outside-owner byte are identical. The normal writer's
codec, checksum, allocation and independent reconstruction checks remain intact.

Use the same checker command above. This closes the exact AMI selected-entry
50-step UI history boundary, not a maximum session-operation count or a heap/
memory measurement. Synthetic reference-retention tests, standalone engine
acceptance, other sources/adapters/history mutations, asynchronous races and
hardware remain separate. The firmware-change-review skill guided review; no
production code, history limit, coverage, timeout, buffer/ownership, codec,
checksum, allocation or reread guard changed. Private firmware, decoded/editor/
session JSON and downloads stay local; checker intermediates are removed on exit
and public CI has no private source.
