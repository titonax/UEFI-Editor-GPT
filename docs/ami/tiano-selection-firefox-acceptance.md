# Exact Tiano queue selection and ordering in deployed Firefox

Reproduced on 2026-10-15 at <https://titonax.github.io/UEFI-Editor-GPT/>
against `93c678cc0da0d14841de2d2f24638abeb2bf8d6a` (merged PR #165).
[Code quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/38662545961)
and [Pages](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/38662545957)
were successful for that exact SHA before this run.

Firefox 153.0, Playwright 1.62.1 build 1538, headless Linux, viewport 1600 × 1000,
loaded `index-_Q4xhBY9.js`, `index-D4JOsfQ5.css`, `tiano-decompress.wasm` and
`ifrextractor.wasm`. Container sandbox/certificate options did not change the app.
The editor, queue, codecs, builder and browser downloads were not mocked.

The freshly recovered authorized source is the existing 8,388,608-byte complete
SPI, SHA-256 `297390ca838c455791a5bf3a3f0001fbf36a8cb31be362ea2123b8df84dfffe8`.
See [combined engine acceptance](tiano-combined-queue-acceptance.md) and
[history acceptance](tiano-history-firefox-acceptance.md). Firmware, editor JSON
and downloads stayed private and local; only technical metadata is recorded.

## Reproduced controls and boundaries

1. Stage the accepted four operations: move DRAM Timing Control to CPU Power
   Management, set Security flags `01` to `00`, import the source-bound
   `0x8B359` suppression override, and hide Boot. Apply, Check and explicitly
   download the verified complete SPI.
2. Open and close Original / selected plan with output ready. Download remains
   enabled: read-only comparison does not change the applied plan.
3. Pause Security through its real queue checkbox. Three operations remain
   selected; Apply is available, but Check, download and details are invalidated.
   Then pause the remaining operations: zero selected, Apply disabled and
   comparison explicitly reports no net changes.
4. Reselect the four original operations. Apply is available again, but neither
   the applied plan nor cached output returns.
5. Move Hide Boot earlier across the independent suppression operation. Assert
   actual queue order: move, Security flags, hide Boot, suppression. Undo and
   Redo restore their respective orders, always without restoring verified output.
6. Apply/Check/download this reordered queue. The output is byte-identical to
   the original-order download and matches the existing accepted combined hash.
7. Stage Show Boot after Hide Boot, as a fifth operation, without building it.
   Pause its prerequisite Hide Boot: Apply is disabled, the queue reports a
   removed/paused/reordered dependency, and comparison is unavailable rather
   than displaying a partial plan. Re-enable Hide Boot: coherence returns.
8. Move Show Boot before Hide Boot. The same strict dependency gate rejects
   that order. Undo restores coherence; removing Show Boot returns to the
   four-operation reordered queue, still without verified output.
9. Reload the actual reordered download, run fresh analysis and export newly
   parsed editor data. It confirms 70 Forms, Security flags `00`, Boot root value
   zero, no DRAM Ref in its old Form and exactly one in CPU Power Management,
   plus the empty suppression body at `0x8B359`. No page errors occurred.

Both complete downloads have size 8,388,608 bytes and SHA-256
`264f90a0934848916bdc3e123564ce5c67c068faa6c48ee03e756f7c21f3aaae`.
Each has 140,913 changed bytes, all inside original FFS allocations
`[3239384, 3419918)` and `[4612464, 4781106)`. All 1,572,864 non-BIOS bytes
are unchanged. Normal allocation, codec, checksum and independent reconstruction
verification run before each download.

## Reproduce and limits

```bash
FIRMWARE_ACCEPTANCE_IMAGE=/path/to/source.bin \
node scripts/firmware-tiano-selection-firefox-acceptance.mjs
```

Browser settings match the Tiano history checker. Reconstruction retains its
15-minute limit, and the checker removes private intermediates on exit.
Public CI does not supply the source.

This accepts only the described real-source Firefox selection, comparison,
independent reorder and dependency-rejection flow. Paused subsets and the
five-operation restore plan were not reconstructed; no output acceptance is
claimed for them. Other permutations, sources/families, the 50-entry limit,
in-place source replacement and late asynchronous races retain separate gates.
Hardware, desktop picker, AMITSE retarget output, broader compression, growth
and capsules are not established. P53 dynamic roots and new BIOS remain parked.
