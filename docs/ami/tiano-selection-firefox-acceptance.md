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

## Bounded paused move-only output

Reproduced on 2026-10-16 (Europe/Madrid) against deployed main
`b47297969ac1f797913e4769ce0845de31f41e3a` (PR #179), with successful Quality,
build and automatic Pages deployment for that SHA. Firefox 153.0 / Playwright
1.62.1, headless Linux, 1600 × 1000 loaded `index-LM6CCH_b.js`,
`index-D4JOsfQ5.css`, `tiano-decompress.wasm` and `ifrextractor.wasm`.
The existing authorized source was size/SHA-256 checked afresh. No browser API,
application, codec or builder was mocked or fault-injected.

1. Stage/apply the same four operations and build/download the accepted complete
   SPI. Read-only comparison leaves this verified output intact.
2. Pause Security, suppression and Hide Boot using their actual checkboxes.
   Each mutation invalidates Check, output and details. Physical queue order and
   all four entries remain; only the original Ref move is selected. Apply is
   available. Apply/Check/download builds the exact known move-only result from
   [engine acceptance](tiano-ref-move-output-acceptance.md), not the four-edit SPI.
3. Reselect all three paused entries. Every mutation invalidates output again;
   Apply/Check/download must run afresh. The result is byte-identical to step 1.
4. Independently reopen and ordinarily analyze both actual downloads. Both retain
   70 Forms and the DRAM Ref only in CPU Power Management. The subset has original
   Security `01`, Boot `1` and an active nonempty `0x8B359` suppression scope.
   The full result has Security `00`, Boot zero and the empty scope. Reopening
   each resets output/details. There are no application page errors.

All outputs are complete 8,388,608-byte SPIs. The baseline and reselected output
retain SHA-256 `264f90a0934848916bdc3e123564ce5c67c068faa6c48ee03e756f7c21f3aaae`
and 140,913 changed bytes inside the original two FFS owners. The move-only
subset has SHA-256 `b1d6224b3ff47692e56ee5c42e7e9055c2154fccfcb3b79ac9fe713df745705f`
and 12,295 changed bytes, all inside original Setup FFS `[4612464, 4781106)`;
the entire companion FFS remains identical. Every byte outside BIOS is unchanged
in all three downloads. Both expected hashes/counts were already recorded in
engine evidence before this run; no unknown output hash was accepted on sight.

```bash
FIRMWARE_ACCEPTANCE_IMAGE=/path/to/source.bin \
node scripts/firmware-tiano-paused-output-firefox-acceptance.mjs
```

The new opt-in checker retains the 15-minute Check limit and existing source,
hash, ownership and independent reread requirements. Private intermediates are
removed on exit; public CI does not supply the source. This closes only the
specific move-only subset/reselection browser gate. Other subsets, the five-entry
restore plan, sessions with paused entries, permutations/sources, asynchronous
races and hardware remain separate gates. No writer, format or growth allowance
is enabled; missing uncompressed AMI/mixed sources and parked P53 work remain.

## Bounded five-entry Boot restore output

Reproduced on 2026-10-16 (Europe/Madrid) against deployed main
`09dd3c5345cd88a357e7ceced6a2808873ef7c24` (PR #180), after successful exact-SHA
Quality, build and automatic Pages deployment. Firefox 153.0 / Playwright 1.62.1,
headless Linux, 1600 × 1000 loaded the same `index-LM6CCH_b.js`,
`index-D4JOsfQ5.css`, `tiano-decompress.wasm` and `ifrextractor.wasm` assets.
The same authorized complete SPI was size/hash checked afresh. There was no
browser API, application, codec or builder mocking or fault injection.

1. Stage/apply the four original operations in physical queue order: Ref move,
   Security flags, JSON suppression override and Hide Boot. Fresh Check/download
   matches the previously accepted four-edit full SPI hash above.
2. Stage Show Boot through the actual desired-root control as a fifth entry.
   Output, Check and details invalidate. Pause Hide Boot: Apply is disabled and
   comparison is unavailable with the strict dependency diagnostic. Re-enable
   Hide Boot: the five-entry plan is coherent but still requires fresh Apply.
3. Apply/Check/download the five-entry plan. Its complete SPI matches the
   separately reproduced [engine restore result](tiano-combined-queue-acceptance.md#bounded-hideshow-boot-cancellation),
   SHA-256 `d9c22589b68884e973af22f87f718b7fc9fb130bfbdcca3871a55c12d294f3be`.
   Read-only comparison preserves this verified output.
4. Remove Show Boot and then Hide Boot through their queue controls. Each removal
   invalidates output. The remaining three selected entries require a fresh
   Apply/Check/download, yielding a byte-identical result to the five-entry plan.
5. Independently reopen and normally analyze both actual restored/net-three
   downloads. Both retain 70 Forms, Security `00`, an empty `0x8B359` suppression
   body, the DRAM Ref absent from Ai Tweaker and present exactly once in CPU Power
   Management, and all seven original root values `1111111`, including Boot.
   Source replacement resets output/details. No application page errors occur.

Both restored/net-three downloads are complete 8,388,608-byte SPIs with 49,938
changed bytes, confined to the same original two FFS allocations above. Every
byte outside BIOS is identical. The expected restored hash/count came from
independent engine reconstruction before the Firefox run, not from accepting an
unknown browser output on sight. The writer retains allocation fit, codec round
trip, checksum repair and independent reconstruction verification.

```bash
FIRMWARE_ACCEPTANCE_IMAGE=/path/to/source.bin \
node scripts/firmware-tiano-boot-restore-firefox-acceptance.mjs
```

Browser settings match the earlier checker. Check retains its 15-minute limit;
private intermediates are removed on exit and public CI receives no source.
This closes only the exact coherent Hide/Show Boot restore-plan output gate.
Other subsets, sessions with paused entries, permutations/sources, asynchronous
races, desktop picker and physical hardware remain separate. Uncompressed AMI
and mixed HII still lack qualifying real-source acceptance; no format, allocation
growth, capsule or P53 dynamic-root allowance is added.
