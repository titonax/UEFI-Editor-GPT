# Exact Tiano late native-completion boundary in Firefox

Reproduced on 2026-10-15 at <https://titonax.github.io/UEFI-Editor-GPT/>
against `0ab4356cc531421e8581e3eae2dc9bb519149ff4` (merged PR #166).
[Code quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/38663680784)
and [Pages](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/38663680675)
were successful for that exact SHA.

Firefox 153.0 / Playwright 1.62.1 build 1538, headless Linux, 1600 × 1000, loaded
`index-_Q4xhBY9.js`, `index-D4JOsfQ5.css`, `tiano-decompress.wasm` and
`ifrextractor.wasm`. The deployed bundle is unchanged, but this is explicitly
a **controlled-timing browser probe**, not an uninstrumented scheduling result.

## Timing mechanism and actual flow

The checker wraps native `WebAssembly.instantiate` after source analysis and
queue staging. Every call forwards its original arguments to the native API and
returns the exact native instance/result object. No codec result, hash, builder,
source, allocation or verification result is substituted. Only one completed
native instantiation's Promise delivery is held temporarily. The shim and its
metadata-only counters exist only in the test page, never in application code.

1. Stage the accepted four-operation Tiano queue: DRAM Ref move, Security flags,
   source-bound suppression override and hide Boot, as in
   [the combined record](tiano-combined-queue-acceptance.md). Apply/Check/download
   a real baseline. Measure its native instantiations: 202, all completed.
2. Clear/Undo/Apply the identical plan. Start an old Check and hold its 202nd
   native instance before returning it to the final decoder. There are 201
   delivered instances, zero native instantiations pending and one held result.
3. While the old Check is held, Clear/Undo/Apply again. The restored identical
   queue has no cached output. Run a new Check and explicitly download its
   verified complete SPI before releasing the old instance.
4. Assert 404 native calls, 403 delivered results, zero native calls pending and
   the old result still held. The newer output is ready.
5. Release the old real instance. The reviewed final WASI decoder is synchronous;
   the remaining extractor, artifact/root/layout checks and byte comparison use
   synchronous work or Promise microtasks, not another external asynchronous
   boundary. Drain microtasks across two animation frames. Assert 404 delivered
   results, no held/pending instance and no further instantiations.
6. Newer download and details remain enabled, with no output-check error.
   Download the cached SPI again: exact accepted bytes, identical to the newer
   file and baseline, with no additional codec instantiation.
7. Restore the original native API, reload the actual post-race download and run
   fresh ordinary analysis. Exported editor data confirms 70 Forms, Security
   flags `00`, Boot root value zero, DRAM Ref moved from Form 3 to Form 5 and
   empty suppression body at `0x8B359`. No page errors occurred.

All three downloads are complete 8,388,608-byte SPI images with SHA-256
`264f90a0934848916bdc3e123564ce5c67c068faa6c48ee03e756f7c21f3aaae`.
Each has 140,913 changed bytes confined to original FFS owners
`[3239384, 3419918)` and `[4612464, 4781106)`. All 1,572,864 non-BIOS bytes
remain identical. The original authorized source was freshly recovered and
verified as SHA-256 `297390ca838c455791a5bf3a3f0001fbf36a8cb31be362ea2123b8df84dfffe8`.
Firmware, decoded data, JSON and downloads stayed private and local.

An initial checker attempt captured the companion changelog instead of the
post-race binary and failed its strict size assertion. The final checker filters
binary and JSON download events explicitly and reran the whole flow successfully;
the failed attempt is not counted as completed acceptance.

## Reproduce and limits

```bash
FIRMWARE_ACCEPTANCE_IMAGE=/path/to/source.bin \
node scripts/firmware-tiano-late-firefox-acceptance.mjs
```

Browser options match [Tiano history acceptance](tiano-history-firefox-acceptance.md).
The whole controlled race must finish within 15 minutes; normal output checks
retain the same limit. Private intermediates are removed on exit. Public CI
never supplies this source or claims to run this probe.

This establishes one exact-source late native-completion ordering with actual Firefox,
queue, engine, codecs and independent readers under a native Promise timing
gate. It is distinct from synthetic/React-jsdom tests, uninstrumented Firefox
scheduling and hardware. It does not cover stale failures, source replacement,
other completion boundaries, families/sources, all race interleavings or the
50-entry history limit. The discarded old build's final return value is not
exposed by the application and is not independently captured here; no successful
old-build output is claimed. The measured gate is the native completion and its
reviewed continuation, not an observation hook on the entire build Promise.
New async boundaries after the reviewed final decoder
require this probe to be reviewed again. Missing qualifying uncompressed
AMI/mixed-HII sources and physical hardware acceptance remain blocked.
Unsupported compression, growth, capsules and P53 dynamic roots remain blocked;
new BIOS intake and dynamic-root research remain parked.
