# Exact nested-LZMA combined v2 session in deployed Firefox

## Revision and source

Reproduced on 2026-10-14 at <https://titonax.github.io/UEFI-Editor-GPT/>
against `79a970b7f3c33f68acc8edf0052af004ffb6734b` (merged PR #160).
[Code quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/38600737254)
and [Pages](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/38600737132)
were successful for that exact SHA before the run.

Firefox 153.0, Playwright 1.62.1 build 1538, headless Linux, viewport 1600 × 1000,
loaded `index-_Q4xhBY9.js`, `index-D4JOsfQ5.css`, `firmware-decompress.wasm`,
`tiano-decompress.wasm` and `ifrextractor.wasm`. The container needed content
sandbox level zero and certificate-error handling as explicit browser settings.
No app, editor, queue, codec, builder or download was mocked.

The authorized existing source is a complete 4,194,304-byte Intel SPI, SHA-256
`cd22f87daee0d50bf82520aaa6669a6731bdaaf3692690649533790c8e027f9a`.
See [root and combined engine acceptance](nested-lzma-root-queue-output-acceptance.md)
and [combined Firefox output acceptance](nested-lzma-combined-firefox-output-acceptance.md)
for its bounded ownership and requested edits. Firmware, editor JSON, session
JSON and outputs remained private and local. Only code and technical metadata
are committed.

## Actual session flow

The real controls staged this accepted combination:

1. Show Chipset through its existing root control.
2. Move the selected CPU Configuration Ref from Advanced to PCI Subsystem Settings.
3. Change System Language's SetupData flags from `01` to `00` on Main.
4. Export projected `data.json`, change only the remapped `0x2B14B` suppression
   to inactive and import it through the source-bound JSON control. This is the
   import route for the unassociated scope, not a direct Show-button claim.

The queue had four selected operations and 681 net logical fields, including
structural offset remapping. Save queue session exported version 2, kind
`hii-menu-actions`, format `uefi-editor-queue-session`. Source metadata contains
only complete-image hash/size and opened-context hash. Enabled operations contain:

| Action         | Selectors / desired state                                    |
| -------------- | ------------------------------------------------------------ |
| `ami-roots`    | root index 4, visible true                                   |
| `move-ref`     | source Form index 4, child index 0, destination Form index 5 |
| `ami-values`   | Form index 0, child index 0, field `accessLevel`, value `00` |
| `suppressions` | condition index 46, active false                             |

The checker asserts each allowed key, value type and action. No filename,
offset, source bytes, binary patch, label, history or Apply state is exported.
Clear empties the queue. Loading v2 restores the same four selected actions,
leaves them unapplied and keeps output checking disabled until Apply. A fresh
Check runs the unchanged complete-image builder before explicit download.

## Output, invalidation and independent reload

| Reproduced field                      | Value                                                              |
| ------------------------------------- | ------------------------------------------------------------------ |
| Complete output                       | 4,194,304 bytes                                                    |
| SHA-256                               | `014af11ec7d614471d873974b83b90c1ae5583adb51beeeda68d3c6940bd64e6` |
| Changed bytes                         | 850,394                                                            |
| Bytes changed outside owner / BIOS    | 0 / 0                                                              |
| Original owning outer FFS             | `[1704008, 3198149)`                                               |
| Non-BIOS bytes preserved              | 1,572,864                                                          |
| Original packed size / capacity       | 1,494,108 / 1,494,108                                              |
| Rebuilt packed size / remaining bytes | 1,493,440 / 668                                                    |

The report and independent local comparison reproduce the accepted engine hash
and complete-SPI bounds. Removing an operation disables download and output details.

A fresh browser reload and analysis of the actual downloaded image opens 68
Forms with an empty queue. Newly exported editor data independently confirms:

- one CPU Configuration Ref under Advanced and one under PCI Subsystem Settings,
  the latter at `0x2B49B`;
- the suppression at `0x2B14B` has an empty body at `0x2B14F`;
- System Language access is `00`;
- all eight freshly detected root bytes are one.

Loading the original session on that changed image rejects with the
different-image/context error, leaves the queue empty and download disabled.
No application page errors occurred.

## Reproduce and limits

With Playwright and real Firefox installed, supply the private accepted source:

```bash
FIRMWARE_ACCEPTANCE_IMAGE=/path/to/source.bin \
node scripts/firmware-nested-lzma-session-firefox-acceptance.mjs
```

Optional browser module/executable/container settings match the existing combined
checker. Reconstruction is bounded to 15 minutes; private intermediate files are
removed on success or failure. Public CI never supplies the firmware.

This establishes the exact-source combined v2 session in Firefox. Synthetic and
React/jsdom coverage remain separate; this is not hardware or recovery acceptance.
At that revision, combined v1 replay, AMITSE retargeting, other sources/codecs and human desktop
file-picker behavior are not established. Root-only output still exceeds the
existing compressed allocation and remains blocked. Growth, capsules, unsupported
compression, P53 dynamic roots and new BIOS cases retain their prior boundaries.

## Complete-SPI byte reports before and after session load

Reproduced on 2026-10-18 (Europe/Madrid) against deployed main
`2526c6af951fae84223e0791870ab83770014d5a` (PR #201), after fresh exact-SHA
[Quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39108176433)
and automatic [Pages build/deployment](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39108176471)
success. Pages returned HTTP 200. Firefox 153.0 / Playwright 1.62.1, headless
Linux, 1600 × 1000 used the documented container/certificate settings and
`index-LM6CCH_b.js`, `index-D4JOsfQ5.css`, `firmware-decompress.wasm`,
`tiano-decompress.wasm`, `ifrextractor.wasm`. The exact accepted source was
recovered by size/SHA-256 from the existing authorized ChatGPT archive; no new
BIOS or semantic corpus inventory was added. No browser API, editor, queue,
codec or writer was mocked, timing-gated or fault-injected.

The extended session checker now applies the original four-selected queue and
downloads a verified baseline before Clear. Clear disables Check/download/details.
Loading the saved metadata-only v2 session restores the same four actions, not
Apply or checked bytes; fresh Apply/Check produces the second download. Both
must retain the known combined hash and be byte-identical to each other.

After each download, a separate local run-based scan of original and actual SPI
bytes computes every contiguous changed interval without importing the production
comparison helper or using rendered values as expectations. Output details must
match the exact totals and every one of its 64 displayed rows: physical
start/exclusive end, full interval length, and the original/rebuilt first
`min(length, 16)` bytes. Omitted ranges and truncated samples are both exercised;
labels must identify the physical image and sampling limit. Raw byte samples are
not printed or committed, including new mismatch diagnostics.

| Independently reproduced field           |  Both outputs/reports |
| ---------------------------------------- | --------------------: |
| Complete SPI bytes                       |             4,194,304 |
| Changed / unchanged bytes                |   850,394 / 3,343,910 |
| Total / displayed changed ranges         |            3,369 / 64 |
| Preserved non-BIOS bytes                 |             1,572,864 |
| Original packed capacity / rebuilt bytes | 1,494,108 / 1,493,440 |
| Remaining bytes in the same allocation   |                   668 |

Both SPI files retain SHA-256
`014af11ec7d614471d873974b83b90c1ae5583adb51beeeda68d3c6940bd64e6`.
Every changed byte is inside outer FFS `[1704008, 3198149)`; every non-BIOS byte
is identical. Report inspection leaves Check/download/details enabled. Removing
an operation still invalidates output/details.

Both actual files are independently reopened after page reloads and analysed
afresh. Each retains 68 Forms, the expected source/destination Ref counts and
moved Ref at `0x2B49B`, empty suppression at `0x2B14F`, System Language flags
`00` and eight visible roots. Neither inherits verified output. Loading the
original session on the final changed image still rejects with the image/context
diagnostic, empty queue and disabled download. No application page errors occur;
the complete checker passed first attempt.

Use the same opt-in command above. The existing 15-minute Check limit, expected
hash/count, allocation, codecs, ownership, checksum and independent writer reread
guards are unchanged. No production code changed. Private source, editor/session
JSON and downloaded firmware remain local; checker intermediates are removed on
exit and CI has no private input. This is exact-source Firefox report acceptance,
not a standalone engine rerun, new synthetic acceptance or hardware validation.

## Combined v1 migration and fresh output

Reproduced on 2026-10-19 (Europe/Madrid) against deployed main
`4651eb8e2b5ed00fda8d7551658527a91d9dd4f2` after successful exact-SHA
[Quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39172224331)
and automatic [Pages build/deployment](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39172224358).
Firefox 153.0 / Playwright 1.62.1 build 1538, headless Linux, 1600 × 1000,
used the documented container/certificate settings and loaded `index-DvYis56o.js`,
`index-D4JOsfQ5.css` and all three WASM readers above. The existing authorized
archive supplied the exact size/hash-bound source. No browser API, queue,
editor, codec, writer or download was mocked, timing-gated or fault-injected.

After the ordinary direct-queue and v2 round trips, the checker constructs the
legacy `hii-menu-actions` v1 representation by changing only the version of the
metadata-only exported session. This is not the older Ref-only kind. Clear
empties the queue; loading v1 restores four selected operations without Apply
or verified output. Re-export must be v2 and deeply identical to the original
session, including every ordered selector and both source identities. Fresh
Apply/Check/download then rebuilds through the unchanged production pipeline.

All three actual complete SPIs are byte-identical and retain the known
`014af11ec7d614471d873974b83b90c1ae5583adb51beeeda68d3c6940bd64e6`
hash. Each independent scan verifies 850,394 changed bytes, 3,343,910 unchanged
bytes, 3,369 ranges, all 64 displayed boundaries/lengths and bounded 16-byte
samples, the same allocation fields and zero changes outside owner/BIOS.
All 1,572,864 non-BIOS bytes remain identical. Removing an operation invalidates
output/details. Three fresh reloads independently reread all four edits and 68
Forms. Both original v2 and v1 sessions reject on the changed image, leaving an
empty queue and disabled download. No application page errors occurred; the
extended checker passed its first complete run.

`npm ci` and `npm run check` passed: formatting, lint, case/release validation,
680 tests in 85 files, enforced coverage and production typecheck/build. The
release inventory still reports its existing missing-source/hardware blockers.
No production code, timeout, coverage, codec, checksum, allocation, ownership or
independent reread guard changed. Firmware, editor/session JSON and outputs stay
private and local; checker intermediates are removed on exit. This closes only
this exact combined-v1 Firefox gate, not other sources, permutations, desktop
file-picker behavior, standalone engine reruns or physical flash/recovery.
Other report sources/families, zero-change output, combined v1 and session races
remain separate. Root-only allocation failure, unsupported formats/growth/capsules,
missing uncompressed AMI/mixed-source gates, new BIOS and P53 dynamic roots retain
their existing limits.

## Clear/Undo/Redo recovery without cached output

Reproduced on 2026-10-19 (Europe/Madrid) against deployed main
`a23321499592d5e8c5d2ec6fdb5720120f31ee5f` after fresh exact-SHA
[Quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39231271707)
and automatic [Pages build/deployment](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39231271633)
success. The public index returned HTTP 200. Firefox 153.0 / Playwright 1.62.1
build 1538, headless Linux, 1600 × 1000 loaded `index-DvYis56o.js`,
`index-D4JOsfQ5.css` and the three WASM readers listed above. The exact authorized
4 MiB source was recovered by size/hash, without adding a BIOS or repeating
the semantic corpus inventory. Container/certificate settings remain explicit;
the configured network proxy was needed for this environment.

After direct, v2 and v1 reconstruction, the checker clears the verified
four-operation queue. Apply, Check, download and details are disabled. One Undo
restores four selected operations and enables Apply, but not Check/output/details.
The exported metadata-only v2 session must deeply equal the original session:
same ordered selectors, enabled flags and image/context identities. One Redo
returns to the empty disabled state; another Undo restores the same exact v2
intent, again without applied or checked output. Fresh Apply/Check/download is
required, and its actual full SPI must equal the baseline byte for byte.

All four downloads (direct, v2, v1 and post-history) passed the known
`014af11ec7d614471d873974b83b90c1ae5583adb51beeeda68d3c6940bd64e6`
hash and 4,194,304-byte size. Independent scans and displayed reports agree on
850,394 changed bytes, 3,343,910 unchanged bytes, 3,369 ranges, every one of the
64 displayed boundaries/lengths and bounded 16-byte samples. Packed capacity,
rebuilt size and remaining bytes remain 1,494,108 / 1,493,440 / 668. Every change
stays inside outer FFS `[1704008, 3198149)` and BIOS; all 1,572,864 non-BIOS bytes
remain identical. Removal still invalidates output/details.

Four separate page reloads independently analyse the actual downloaded SPIs,
confirming 68 Forms, both Ref counts and moved Ref at `0x2B49B`, empty suppression
body at `0x2B14F`, System Language `00` and eight visible roots. Both original
session versions reject on the final changed image with empty queue and no
download. There were no application page errors.

The checker now installs a fail-closed browser network boundary before supplying
private input. It resolves the public index's exact JS/CSS URLs first, permits
only bodyless GETs to that index and its public static assets/readers, and blocks
other methods/URLs and WebSockets; service workers are disabled. The completed
run requested only those static resources. Firmware/editor/session/output bytes
stay local. No editor, queue, codec, writer or download is mocked or timing-gated.
Partial/interrupted runs and an earlier public-index DNS failure are not counted
as acceptance. The completed protected run exited successfully.

Use the opt-in command above. `FIRMWARE_BROWSER_PROXY_SERVER` optionally supplies
an already configured network proxy; never put private firmware in a request.
Public CI still receives no source. No production code, 15-minute build limit,
coverage threshold, ownership, allocation, codec, checksum or independent reread
guard changed. This closes the exact combined Clear/Undo/Redo recovery gate, not
paused/reordered variants, new-edit Redo discard, asynchronous races, other
sources, standalone engine reruns or hardware/recovery. Root-only allocation
failure, unaccepted formats/growth/capsules, missing AMI uncompressed/mixed sources,
new BIOS and P53 dynamic roots retain their existing boundaries.

## Paused v2/v1 selection, atomic rejection and full reselection

Reproduced on 2026-10-19 (Europe/Madrid) against deployed main
`3cd792166a9267ce7d656b784f27922a243d6636`, after fresh exact-SHA
[Quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39264801210)
and automatic [Pages build/deployment](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39264801302)
success. Firefox 153.0 / Playwright 1.62.1 build 1538, headless Linux,
1600 × 1000 used the documented explicit container/certificate/proxy settings,
`index-DvYis56o.js`, `index-D4JOsfQ5.css` and all three WASM readers. The exact
size/hash-bound source was recovered only from the authorized ChatGPT archive.
No new source or semantic corpus inventory was added.

After the existing combined/session/history regressions, the real queue controls
pause Chipset root, System Language and suppression entries while leaving the
CPU Configuration Ref move selected. Each selection mutation invalidates Check,
download and details. Export preserves all four ordered actions with enabled
flags `[false, true, false, false]`, not a reduced one-operation session.
Clear/load independently exercises v2 and strict v1 menu-actions sessions; both
restore the same selection unapplied, with no verified output. Their v2
re-exports must deeply equal the original paused metadata, including every
selector and image/context identity. Each requires fresh Apply/Check/download.

While the v2 move-only output is ready, both session versions are separately
given a missing root index in the paused root action. Each rejects with the
normal missing/ambiguous-root diagnostic, retaining all four entries, exact
paused metadata and ready controls. A subsequent actual cached download still
equals the verified move-only SPI. Paused entries are therefore not trusted or
silently omitted. Successful v1 load then proves recovery from these failures.

Finally, reselecting the three paused actions invalidates output again. The full
v2 metadata must equal the original combined session, and fresh reconstruction
must equal the original combined baseline. No root-only build is attempted.

| Actual output profile | Downloads | Fresh builds / retained downloads | SHA-256                                                            | Changed / unchanged bytes | Total changed ranges | Packed bytes / remaining |
| --------------------- | --------: | --------------------------------: | ------------------------------------------------------------------ | ------------------------: | -------------------: | -----------------------: |
| Combined four edits   |         5 |                             5 / 0 | `014af11ec7d614471d873974b83b90c1ae5583adb51beeeda68d3c6940bd64e6` |       850,394 / 3,343,910 |                3,369 |          1,493,440 / 668 |
| Move only             |         3 |                             2 / 1 | `354ca2cef157221679ce55783ff4370e4a9cdd6968415c6b0abf639c0b4514e0` |       140,925 / 4,053,379 |                  585 |            1,494,099 / 9 |

Every output is a complete 4,194,304-byte SPI with all 1,572,864 non-BIOS bytes
identical and every changed byte inside outer FFS `[1704008, 3198149)` and BIOS.
Capacity remains 1,494,108 bytes. Each report's exact totals, all 64 displayed
physical ranges/lengths and bounded 16-byte samples match a separate local scan
of original and actual output bytes. Expected hashes/counts/allocation values
come from the prior independent engine acceptance, not rendered UI values.

Eight separate page reloads freshly analyse the eight actual downloads. Each
has 68 Forms, the expected Ref counts and moved Ref at `0x2B49B`. The five
combined files reread all four edits. The three move-only files retain Chipset's
original zero, seven other root bytes equal to one, System Language `01`, and
the original nonempty active suppression body measured before its override.
Those paused edits are not applied. Removal invalidation and both original
combined-session versions' rejection on changed bytes still pass. No application
page errors or requests outside the static-GET-only network boundary occurred;
the complete checker exited successfully. Private intermediate files are removed
on exit and no firmware/editor/session/output bytes are uploaded or committed.

Use the same opt-in command above. Only the checker and technical records change;
the existing full check suite remains required. Source identity, metadata keys,
timeouts, coverage, allocation, codecs, checksum, buffer ownership and independent
reread guards are not relaxed. This is exact-source Firefox acceptance, not a
standalone engine rerun, other subsets/orders/session histories or races, broad
compatibility or hardware/recovery validation. Root-only allocation failure,
unsupported formats/growth/capsules, missing uncompressed AMI/mixed sources,
new BIOS and P53 dynamic roots retain their existing limits.

## Session load as one undoable replacement

Reproduced on 2026-10-19 against deployed main
`2d6d93b1a7af0503c30fef3f665fc20576e203a1`, after fresh exact-SHA
[Quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39310961287)
and automatic [Pages](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39310960764)
success and HTTP 200. This run uses Firefox 157.0 / Playwright 1.64.1 build 1555,
headless Linux, 1600 × 1000, the documented explicit container/certificate/proxy
settings, `index-DvYis56o.js`, `index-D4JOsfQ5.css` and all three WASM readers.
The exact size/hash-bound 4 MiB source was freshly recovered only from the
authorized ChatGPT archive. No new BIOS or semantic corpus inventory was added.

After the existing direct/session/history/paused regressions, the combined queue
has ready verified output. Loading the move-only paused session replaces its
four entries as one undoable mutation. For v2 and strict v1 independently:

1. Load restores flags `[false, true, false, false]`, with Apply available but
   Check/download/details disabled. A v2 re-export deeply equals the saved
   paused session, including every selector and both source identities.
2. One Undo restores all four selected actions and the exact original full v2
   export, still unapplied with no verified output. One Redo restores the exact
   paused export, again without Apply state or cached output.
3. Fresh Apply/Check/download produces the known move-only SPI after Redo.
   One Undo from that ready state restores the exact full intent, invalidates
   output again and requires fresh Apply/Check/download of the combined SPI.

Both versions pass through real controls, normal session replay and the unchanged
writer/codecs. The checker now verifies twelve actual downloads: seven combined
and five move-only (eleven fresh builds and one retained cached download from
the existing atomic-rejection regression). Each retains its previously accepted
hash, size, allocation and byte-report totals listed above: 3,369 combined or
585 move-only ranges, all 64 displayed physical boundaries/lengths and bounded
16-byte samples agree with an independent scan. Every output is a complete
4,194,304-byte SPI with zero changes outside the outer FFS/BIOS and all 1,572,864
non-BIOS bytes identical.

Twelve separate reloads freshly analyse the actual downloaded files: seven
confirm all four requested edits and five confirm only the moved Ref, preserving
the paused root/value/suppression states. Each retains 68 Forms, expected Ref
owners/counts and moved offset `0x2B49B`. Removal invalidation and both-version
changed-image/context rejection also pass. No application page errors or requests
outside the static-GET-only boundary occurred; the complete checker exited zero.
No source, decoded modules, editor/session JSON or output firmware is uploaded
or committed. Private checker intermediates are removed on exit.

Use the same opt-in command above. This closes this exact v2/v1 session-load
Undo/Redo gate only. Synthetic/React-jsdom checks remain separate; no standalone
engine rerun, asynchronous race, other history/order/source, desktop file-picker
or hardware/recovery acceptance is claimed. No production code, timeout,
coverage, allocation, ownership, codec, checksum or independent reread guard
changed. Root-only fit, unsupported formats/growth/capsules, missing qualifying
uncompressed AMI/mixed sources, new BIOS and P53 dynamic roots retain their limits.

## New selection discards the previous Redo branch

Reproduced on 2026-10-19 against deployed main
`eb2da65b1a7d668167ca6ece9e6a4cf3798ab717`, after fresh exact-SHA
[Quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39320754738)
and automatic [Pages](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39320754689)
success. Firefox 153.0 / Playwright 1.62.1 build 1538, headless Linux,
1600 × 1000 used the explicit documented container/certificate/proxy settings,
`index-DvYis56o.js`, `index-D4JOsfQ5.css` and all three WASM readers. The exact
4 MiB size/hash-bound source was freshly recovered from the authorized ChatGPT
archive only, without new BIOS acquisition or another semantic corpus inventory.

After the preceding v2/v1 load-history regressions, the full four-selected queue
has freshly verified output and its previous move-only paused session is on
Redo. Saving the full metadata-only session preserves both Redo and the ready
Check/download/details controls. Unchecking only the root action then creates a
new selection `[false, true, true, true]`, immediately disables Redo and
invalidates Check/download/details. An exact v2 export preserves all selectors,
identities and this new selection, and saving cannot restore the old future.

One Undo restores the original full export without Apply or output. Redo returns
the exact new three-selected export, not the old one-selected paused session;
Redo is exhausted there. Another Undo again restores the full export unapplied.
Fresh Apply/Check/download must reproduce the known combined baseline byte for
byte. The three-selected intermediate is planning/history evidence only: the
checker never invokes its writer or claims that combination fits allocation.

The complete checker exited zero with thirteen actual downloads and thirteen
independent reload/analyses: eight combined and five move-only outputs, twelve
fresh builds plus the existing one retained cached download. Every complete
4,194,304-byte SPI retains its known hash, allocation and physical byte totals
listed above. Each report's totals and all 64 physical range boundaries/lengths
and bounded 16-byte samples match a separate scan of the actual output. All
1,572,864 non-BIOS bytes are identical, with zero changes outside outer FFS/BIOS.
Eight rereads confirm all four edits; five confirm the moved Ref and unchanged
paused root/value/suppression states, with 68 Forms and the expected Ref owners,
counts and `0x2B49B` offset. Removal invalidation, both-version changed-image
rejection and the prior atomic paused-root rejection still pass. No application
page errors or requests outside the static-GET-only boundary occurred.

Use the same opt-in command above. Private source, modules, editor/session JSON
and downloaded firmware stay local; checker intermediates are removed on exit.
Only checker code and technical records change. This closes the exact new-edit
Redo-discard gate, not every history, asynchronous race, source, engine rerun or
hardware/recovery gate. Synthetic and React/jsdom checks remain separate.
Production behavior, timeouts, coverage, ownership, allocation, codec, checksum
and independent reread guards are unchanged. Root-only fit, unsupported formats,
growth/capsules, missing qualifying uncompressed AMI/mixed sources, new BIOS and
P53 dynamic roots retain their existing boundaries.

## Held native session text across open-dialog Clear/Undo

Reproduced on 2026-10-20 (Europe/Madrid) against deployed main
`ea36b887eaf4dc2c8512f2f477674f7e1d9af55c`, after fresh exact-SHA
[Quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39329430216)
and automatic [Pages](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39329430307)
success. Firefox 153.0 / Playwright 1.62.1 build 1538, headless Linux,
1600 × 1000 used the documented explicit container/certificate/proxy settings,
`index-DvYis56o.js`, `index-D4JOsfQ5.css` and all three WASM readers. The exact
size/hash-bound 4 MiB SPI was freshly recovered only through authorized ChatGPT
files; no new source or semantic corpus inventory was introduced.

After the existing regressions, the full four-operation queue has ready output.
A wrapper calls the actual native `File.text` for a copy of the valid paused v2
session, then holds delivery of its real result. A separate wrapper counts but
does not delay or replace native `crypto.subtle.digest` calls. The held state
records one read, one native completion, no delivered text and zero hashes.
The normal dialog shows validation in progress.

The source and dialog remain open while real Clear/Undo controls empty and
restore the full selection. Output is invalidated. The old native text is then
delivered without any newer session request masking it. A subsequent browser
task observes one delivery and still zero hashes. AMI identity starts native
digests before its first await, so this proves the cancelled text did not enter
that validation path. The same document and visible dialog retain four selected
entries, available Redo, no stale alert/loaded/busy message and disabled output.

As a positive control, current loading of the same paused metadata executes five
native hashes, restores the exact paused selection unapplied and discards Redo.
Its v2 export deeply equals the original paused session. Current full loading
then restores the exact original full export, again unapplied. The wrappers are
restored before normal Apply/Check/download freshly reproduces the known full
SPI. No editor, session adapter, codec, writer or firmware bytes are replaced.

The complete checker exited zero: fourteen downloads and fourteen independent
reload/analyses, comprising nine combined and five move-only SPIs (thirteen
fresh builds and the prior one retained cached download). Every output retains
its known hash, physical byte totals, allocation and range counts listed above.
Independent scans match all report totals and all 64 displayed physical range
boundaries/lengths and bounded 16-byte samples. Every complete 4,194,304-byte SPI
preserves all 1,572,864 non-BIOS bytes and changes nothing outside outer FFS/BIOS.
Nine rereads confirm four edits, five confirm only the moved Ref and unchanged
paused states; all retain 68 Forms and the expected Ref owners/counts/offset.
Removal invalidation and both-version changed-image/context rejection still
pass. No page errors or non-static requests crossed the fail-closed boundary.

Use the same opt-in command above. This is a controlled native-result-delivery
probe, not ordinary scheduling, a real I/O/hash failure or observation of the
old React handler's complete return. It isolates queue revision cancellation
from closing/unmounting or replacing the source; those remain separate gates.
Synthetic/React-jsdom tests, standalone engine acceptance and hardware/recovery
remain distinct. Private bytes/JSON stay local and intermediates are removed on
exit. Production code, source guards, timeouts, coverage, codecs, checksums,
allocation, buffer ownership and independent reread limits are unchanged.
Unsupported formats/growth/capsules, root-only fit, missing qualifying sources,
new BIOS and P53 dynamic roots retain their existing boundaries.

## Closed-dialog native read cancellation with retained full SPI

Reproduced on 2026-10-20 (Europe/Madrid) against deployed main
`a4bf3d8c20132c7f5fccc38659f84777c2ab615b`, after fresh exact-SHA
[Quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39335956232)
and automatic [Pages](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39335956335)
success. Firefox 153.0 / Playwright 1.62.1 build 1538, headless Linux,
1600 × 1000 used the explicit container/certificate/proxy settings above,
`index-DvYis56o.js`, `index-D4JOsfQ5.css` and the three WASM readers. The exact
size/hash-bound 4 MiB source was freshly recovered only from authorized ChatGPT
files. No new BIOS or semantic corpus inventory was introduced.

After the preceding regressions and a fresh combined full-SPI Check, a new probe
instance calls the actual native `File.text` on the valid paused v2 session and
holds delivery of its completed result. Native digest calls are counted but
neither delayed nor replaced. The visible dialog reports validation in progress;
the probe records one read, one native completion, zero deliveries and zero
hashes. The real Close control then hides the dialog without Clear/Undo, source
replacement, document navigation or a newer session request.

Old native text delivery is released while the dialog remains closed. A later
browser task observes exactly one delivery and zero hashes: the obsolete read
did not enter adapter identity validation, whose digests start before its first
await. Download/details remain enabled. An actual cached SPI download, without
another Apply/Check, is byte-identical to the freshly verified combined output;
its report also matches an independent physical-byte scan.

Reopening retains all four selected entries, no stale loaded/busy message or
alert, and an exact metadata-only full v2 export. Current loading of the paused
session then executes five native hashes, restores its exact flags and v2 export
and invalidates output. Current full loading restores the exact full export,
again unapplied. Original native method descriptors are restored before fresh
Apply/Check/download reproduces the known combined baseline byte for byte.

The complete extended checker exited zero with sixteen actual downloads and
sixteen independent reload/analyses: eleven combined and five move-only SPIs,
fourteen fresh builds and two retained cached downloads. Each complete
4,194,304-byte image retains its known hash, allocation and physical byte totals
listed above. Every report matches an independent scan of the actual output,
including all 64 displayed range boundaries/lengths and bounded 16-byte samples.
All 1,572,864 non-BIOS bytes remain identical, with zero changes outside the
owning outer FFS/BIOS. Eleven rereads confirm all four edits, five confirm only
the moved Ref and unchanged paused states; all retain 68 Forms and the expected
Ref owners/counts/offset. Removal invalidation and both-version changed-image
rejection pass. No application page errors or non-static network requests occur.

An initial attempt failed at browser page creation before source loading; it is
not acceptance evidence. The subsequent complete run above passed. Use the same
opt-in command. Private source, modules, editor/session JSON and outputs remain
local; private checker intermediates are removed on exit. Only the checker and
technical records change, with no production, timeout, coverage, ownership,
allocation, codec, checksum or independent-reread guard changes.

This closes only this exact controlled native-result-delivery close boundary.
Dialog closure and component lifetime cancellation are combined, not isolated.
It is not ordinary scheduling, a real I/O/hash failure, observation of the old
React handler's complete return, source replacement, standalone engine rerun or
hardware/recovery acceptance. Synthetic/React-jsdom checks remain separate.
Other races/sources, root-only fit, unsupported formats/growth/capsules, missing
qualifying sources, new BIOS and P53 dynamic roots retain their existing gates.

## Held session read across same-byte source replacement

Reproduced on 2026-10-20 (Europe/Madrid) against deployed main
`6570a3beba20f61069bf3cf051c3b6d104cb9933`, after fresh exact-SHA
[Quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39343197277)
and automatic [Pages](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39343197272)
success. Firefox 153.0 / Playwright 1.62.1 build 1538, headless Linux,
1600 × 1000 used the explicit container/certificate/proxy settings above,
`index-DvYis56o.js`, `index-D4JOsfQ5.css` and the same three WASM readers.
The exact size/hash-bound 4 MiB source was freshly recovered from authorized
ChatGPT files only. No new BIOS or semantic corpus inventory was introduced.

After the preceding regressions and a fresh combined full-SPI output, a new
probe instance holds delivery of the real native `File.text` result for the
valid paused v2 session. The dialog visibly reports validation; one read and
one native completion have occurred, with no delivery or digest calls. The real
Close and Load another firmware controls return to upload. The identical source
is selected and analysed afresh without navigating/reloading the document.

Exported fresh base data confirms 68 Forms, original Ref counts two under
Advanced and zero under PCI Subsystem Settings, System Language `01`, original
root bytes `[1,1,1,1,0,1,1,1]` and the original active nonempty suppression at
`0x2B15A`. The new queue is empty, with Apply/Undo/Redo, Check/download/details
disabled and no alert, loaded or busy message. `performance.timeOrigin` is
unchanged. No newer session request masks the old read.

Only then is the old native text delivered. A subsequent browser task observes
one delivery and no additional native digest calls relative to the post-analysis
snapshot. Source analysis hashes are accounted for separately rather than being
attributed to old delivery. The empty queue/history and invalidated output remain
unchanged. Because adapter identity starts native hashes before its first await,
this proves the obsolete text did not enter that validation path; it does not
observe the old React handler's entire return.

As a positive control, current paused loading on the reopened source executes
five native hashes, restores exact flags `[false,true,false,false]`, re-exports
deeply identical metadata-only v2 and leaves output invalidated. Current full
loading restores the exact original full export, again unapplied. Original
native method descriptors are restored before fresh Apply/Check/download
reproduces the known combined baseline byte for byte.

The complete extended checker exited zero with seventeen actual downloads,
seventeen exact byte reports and seventeen independent reload/analyses: twelve
combined and five move-only SPIs, fifteen fresh builds plus the two previous
retained cached downloads. Every complete 4,194,304-byte SPI retains its known
hash, packed allocation and physical totals above. Each independent scan matches
all report totals, all 64 displayed physical ranges/lengths and bounded 16-byte
samples. All 1,572,864 non-BIOS bytes and every byte outside outer FFS/BIOS stay
identical. Twelve rereads confirm four edits, five confirm only the moved Ref
and unchanged paused states; all retain 68 Forms and expected Ref ownership and
offset. Removal invalidation and both-version changed-image rejection pass.
No page errors or requests outside the static-GET-only boundary occur.

The first concurrent local check failed with three unchanged 5-second synthetic
UI test timeouts: AMI allocation failure/retry, AMI ready-plan reorder and Phoenix
ready-plan reorder (677 passed, three failed in two files). It is not a green
check. No timeout or coverage guard is changed; publication requires a complete
`npm run check` rerun without concurrent Firefox and successful exact-head CI.
The PR audits those final results separately from real-source browser acceptance.

Use the same opt-in command above. Source, modules, editor/session JSON and
outputs stay private/local; checker intermediates are removed on exit. No
production behavior, source/ownership checks, codec, checksum, allocation,
15-minute build bound or independent reread guard changes. This controlled
native-delivery probe combines dialog closure and source/component lifetimes;
it does not isolate their individual cancellation mechanisms. Different-byte
replacement, late rejection, ordinary scheduling, actual I/O/hash failures,
standalone engine acceptance and hardware/recovery remain separate gates.
Unsupported formats/growth/capsules, root-only fit, missing qualifying sources,
new BIOS and P53 dynamic roots retain their existing limits.

## Held native read across the actual different-byte download

Reproduced on 2026-10-20 (Europe/Madrid) against deployed main
`c623d2abe94a90e54ece16ed2ff4ef1ddde17721`, after fresh exact-SHA
[Quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39356259100)
and automatic [Pages](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39356259135)
success. Firefox 153.0 / Playwright 1.62.1 build 1538, headless Linux,
1600 × 1000 used the explicit container/certificate/proxy settings above,
`index-DvYis56o.js`, `index-D4JOsfQ5.css` and the same three WASM readers.
The exact accepted 4 MiB source was freshly recovered only from authorized
ChatGPT files. No new BIOS or semantic corpus inventory was introduced.

The replacement is the actual combined SPI downloaded earlier in this same run,
not injected byte corruption or an old temporary output. Its known
`014af11ec7d614471d873974b83b90c1ae5583adb51beeeda68d3c6940bd64e6`
hash is asserted and differs from the original
`cd22f87daee0d50bf82520aaa6669a6731bdaaf3692690649533790c8e027f9a`.
With fresh combined output ready on the original, a new probe holds delivery
of the real native `File.text` result for the valid paused v2 session. The
visible dialog shows validation; one native read completed, with zero delivered
results and hashes. Real Close/Load another firmware controls then open the
downloaded different bytes in the same document.

Fresh analysis/export independently confirms all four applied edits: 68 Forms,
Ref counts one under Advanced and one under PCI Subsystem Settings with moved
offset `0x2B49B`, Language `00`, eight root-vector bytes one and empty suppression
body at `0x2B14F` for the scope at `0x2B14B`. The new queue/history are empty;
Apply, Check/download/details and Undo/Redo are disabled, without an old alert
or loaded/busy message. `performance.timeOrigin` remains unchanged.

Old native text is released only after this reset and before any newer session
request. A subsequent browser task observes one delivery and no added native
digest calls relative to the post-analysis snapshot. Queue/history/output remain
empty/disabled. Adapter identity starts native hashes before its first await,
so the obsolete text did not enter that validation path; this does not instrument
the old React handler's complete return.

As a positive control, current loading of the same original paused v2 session
executes exactly three native identity hashes and visibly rejects with the normal
different-image/context diagnostic. It cannot restore entries, history, Apply or
output. No writer is invoked on the different-byte source. Native descriptors
are restored before closing it and reopening the original. Fresh base export
again confirms original Ref counts two/zero, Language `01`, original root vector
and active nonempty suppression. The previous rejection/history/output do not
survive. Current full-v2 loading/re-export equals the original metadata, stays
unapplied and requires fresh Apply/Check/download. Its SPI equals the baseline.

The complete extended checker passed first attempt and exited zero: eighteen
actual downloads/reports, sixteen fresh builds plus two retained cached downloads,
and eighteen final independent actual-file reload/analyses. Thirteen combined
and five move-only files retain their known hash, complete 4,194,304-byte size,
packed allocation and physical byte totals above. Independent scans match all
totals and all 64 displayed physical ranges/lengths and bounded 16-byte samples.
All 1,572,864 non-BIOS bytes are identical; no byte changes outside outer FFS/BIOS.
The final rereads confirm the selected edits or unchanged paused states, 68 Forms
and expected Ref owners/counts/offset. Removal invalidation, both-version
changed-image rejection, zero page errors and the static-GET-only boundary pass.
The different-image analysis during replacement is additional to those final
eighteen download rereads, not an extra output or new accepted writer source.

Use the same opt-in command above. Final local `npm run check` and exact-head CI
are required before publication/merge and audited in the PR. No production code,
timeout, coverage, source/ownership/buffer, codec, checksum, capacity or independent
reread guard changes. Private firmware/modules/JSON and output files stay local;
checker intermediates are removed on exit. This controlled native-delivery probe
combines dialog/source/component lifetimes for this exact byte pair. It does not
establish other sources, late rejection, ordinary scheduling, actual I/O/hash
failure, old-handler full return, standalone engine or hardware/recovery acceptance.
Unsupported formats/growth/capsules, root-only fit, missing qualifying sources,
new BIOS and P53 dynamic roots retain their existing gates.

## Late paused-root rejection across open-dialog Clear/Undo

Reproduced on 2026-10-20 (Europe/Madrid) against deployed main
`f2561166001507328204bca9f16167035c4a3974`, after fresh exact-SHA
[Quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39361266155)
and automatic [Pages](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39361266132)
success. Firefox 153.0 / Playwright 1.62.1 build 1538, headless Linux,
1600 × 1000 used the documented explicit container/certificate/proxy settings,
`index-DvYis56o.js`, `index-D4JOsfQ5.css` and the three existing WASM readers.
The exact size/hash-bound 4 MiB source was freshly recovered only from authorized
ChatGPT files. No new BIOS or semantic corpus inventory was introduced.

After the preceding regressions, the original source has ready combined output.
The checker loads the same invalid paused-v2 metadata already rejected by the
ordinary atomic control: only its root selector targets a missing root. A wrapper
forwards every SHA-256 receiver/argument/result to native Firefox, holding only
delivery of the third completed digest. Its actual bytes must equal the saved
opened-context SHA-256. The probe observes three calls/completions, one held
result and zero deliveries while the dialog visibly reports validation. No
session, firmware, validation decision, codec or writer result is substituted.

With source and dialog kept open, real Clear/Undo restores the full four-selected
queue at a new revision. Apply/output remain invalidated and Redo is available.
No newer session request masks the old one. Releasing the exact native digest
allows identity validation and synchronous root replay to continue. After browser
tasks/two animation frames, three calls/completions and one delivery are observed;
the full selection, Redo and disabled output remain, with no stale alert, loaded
or busy message and no document-time-origin change. This probes the reviewed
late-rejection continuation, not instrumentation of the old React handler's full
return or ordinary browser scheduling.

Current loading of that identical invalid file executes three more native hashes
and visibly rejects with `Queue session targets a missing or ambiguous root.`
The full queue and Redo remain unchanged; there is no partial paused replacement.
After restoring the native descriptor, current valid full-v2 loading clears the
error, discards Redo and re-exports deeply identical metadata, still unapplied.
Fresh Apply/Check/download reproduces the known complete combined SPI byte for
byte. No writer is invoked for the invalid metadata.

The complete extended checker passed its first attempt and exited zero: nineteen
actual downloads/reports, seventeen fresh builds plus two retained cached downloads,
and nineteen final independent actual-file reload/analyses. Fourteen combined and
five move-only SPIs retain their known hashes, complete 4,194,304-byte size,
allocation and physical totals above. Every report matches an independent scan
of all totals, all 64 displayed ranges/lengths and bounded 16-byte samples.
All 1,572,864 non-BIOS bytes and all bytes outside outer FFS/BIOS stay identical.
Final rereads confirm 68 Forms, expected Ref owners/counts/offset and either all
four edits or unchanged paused states. Removal invalidation, both-version changed
image/context rejection, zero page errors and the static-GET-only boundary pass.

Use the same opt-in command above. Private source/modules/JSON/output stay local
and checker intermediates are removed on exit. Final local `npm run check` and
exact-head CI are required before merge and audited in the PR. No production
code, timeouts, coverage, identity/ownership/buffer, codec, checksum, capacity or
independent reread guard changes. This closes only the exact final-identity/paused
root rejection across queue revision; dialog/source replacement during rejection,
other hash boundaries/rejection causes, actual I/O/hash failure, standalone engine
reruns and hardware/recovery remain separate gates. Unsupported formats/growth/
capsules, root-only fit, missing qualifying sources, new BIOS and P53 dynamic roots
retain their existing limits.

## Late paused-root rejection after closing the dialog

Reproduced on 2026-10-20 (Europe/Madrid) against deployed main
`eed1f459b36ef20c26239513bf9d5c59c84bd1ab`, after fresh exact-SHA
[Quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39364086294)
and automatic [Pages](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39364086210)
success. Firefox 153.0 / Playwright 1.62.1 build 1538, headless Linux,
1600 × 1000 used the explicit container/certificate/proxy settings, production
`index-DvYis56o.js`, `index-D4JOsfQ5.css` and the three WASM readers above.
The exact accepted 4 MiB source was freshly recovered through authorized ChatGPT
files and size/hash verified; no new BIOS or semantic corpus inventory was added.

After the preceding regressions and a fresh combined output, the checker loads
the same invalid paused-v2 root metadata. The preceding native digest gate is
reused without changing its behavior: three native calls/completions, one held
third result equal to the original opened-context hash and zero deliveries.
Real Close hides the validating dialog without Clear/Undo, source replacement
or a newer session request. The exact native result is then delivered, allowing
the reviewed identity continuation and synchronous root rejection to run.

After browser tasks/two animation frames the probe records one delivery and no
additional hashes. The dialog remains hidden and Check/download/details remain
enabled. An actual cached download, without another Apply/Check, equals the
fresh pre-close SPI byte for byte; its report matches an independent physical
scan. Reopening visibly retains all four selected entries without stale alert,
loaded or busy message, with unchanged document time origin and still only three
native hashes. No new request masks the obsolete rejection before this observation.

Current loading of the identical invalid file performs three further native
hashes and visibly rejects with the missing/ambiguous-root diagnostic. All four
entries and ready output controls survive atomically. After restoring the native
descriptor, saving the retained full queue exports deeply identical metadata.
Current valid full-v2 loading/re-export remains exact but invalidates output;
fresh Apply/Check/download reproduces the known combined full SPI. No writer
is invoked for the invalid session.

The complete rerun exited zero: twenty-one actual downloads/reports, eighteen
fresh builds plus three retained cached downloads, and twenty-one independent
actual-file reload/analyses. Sixteen combined and five move-only outputs retain
their known complete 4,194,304-byte size, hashes, allocations and physical totals.
Every report matches all totals, all 64 displayed ranges/lengths and bounded
16-byte samples from independent scans. All 1,572,864 non-BIOS bytes and every
byte outside outer FFS/BIOS remain identical. Rereads confirm 68 Forms, expected
Ref owners/counts/offset and either four edits or unchanged paused states.
Removal invalidation, both-version changed-image rejection, zero page errors
and the static-GET-only network boundary pass.

An earlier incomplete execution has no verified completion and is not counted.
The first retained complete attempt reached the new cached download but failed
an immediate checkbox count (zero before the reopened modal was visible).
The checker now waits for the dialog and fourth checkbox to be visible before
the unchanged exact four-checkbox/selection assertions. No existing timeout,
coverage or binary guard is relaxed; the entire flow above reran successfully.

Use the same opt-in command above. Final local `npm run check` and exact-head CI
remain required before merge and are audited in the PR. Private source, decoded
modules, editor/session JSON and firmware outputs stay local; checker intermediates
are removed on exit. This controlled native-result-delivery probe combines dialog
closure/component lifetime, not ordinary scheduling, actual I/O/hash failure or
old React-handler full-return observation. Queue-revision cancellation is the
separate preceding gate. Source replacement during rejection, other boundaries/
causes, standalone engine reruns and hardware/recovery remain unaccepted. No
production code, ownership, allocation, codec, checksum or independent reread guard
changes. Unsupported formats/growth/capsules, root-only fit, missing qualifying
sources, new BIOS and P53 dynamic roots retain their existing limits.

## Late paused-root rejection across same-byte source reopen

Reproduced on 2026-10-20 (Europe/Madrid) against deployed main
`e96a0101073ae7b2ad2bd21e76c810a259e22f5e`, after fresh exact-SHA
[Quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39382570936)
and automatic [Pages](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39382570833)
success. The same opt-in command and Firefox/container/privacy settings above
apply. The exact accepted 4 MiB source was freshly recovered from authorized
ChatGPT files and verified by size/hash; no new BIOS or corpus inventory.

After a fresh combined output, the unchanged native digest probe holds the
third identity result of the same invalid paused-v2 root session. Three native
calls/completions, a matching original context hash and zero deliveries are
asserted. Real Close, Load another firmware and Start HII analysis reopen the
identical original bytes without reloading the document or issuing a new session
request. The ordinary editor JSON export independently confirms 68 Forms,
original Ref owners/counts, System Language access `01`, all eight root values
and the active non-empty suppression at `0x2b15a`.

The visibly reopened dialog has an empty queue/history, disabled Apply/output
and no loaded/busy/error message. Source-analysis hashes are accounted separately
before releasing the old native result. After delivery and two animation frames,
the complete probe state differs only in delivered/held, with zero added hashes;
the same empty reset workspace and document time origin remain unchanged.
This observes the reviewed identity continuation/synchronous root rejection, not
the full return of the captured old React handler.

As a positive current-request control, identical invalid metadata now performs
three new native hashes and visibly rejects the missing/ambiguous root while
preserving the empty queue/history and disabled output. Restoring the native
descriptor and loading valid full-v2 metadata clears the diagnostic, restores
exact four-selected metadata and still requires Apply/Check. An actual new
full-SPI download equals the known combined baseline byte for byte and is
included in the final independent actual-file reload/analysis loop.

This controlled delivery combines dialog/source/component lifetimes; it does
not isolate cancellation mechanisms or establish ordinary scheduling, actual
I/O/hash failure, standalone engine reruns or hardware/recovery. Different-byte
source replacement during rejection and other boundaries/causes remain separate
gates. No production behavior, binary guard, timeout or coverage changes.
Unsupported formats/growth/capsules, root-only fit, missing qualifying sources,
new BIOS and P53 dynamic roots remain blocked. Private bytes and JSON stay local.

The complete run exited zero on its first attempt: twenty-two actual downloads
and exact byte reports, nineteen fresh builds plus three cached downloads,
seventeen combined and five move-only outputs. All twenty-two independently
reopen and reanalyze the actual files with their expected edits or unchanged
paused states. Complete size/hashes, allocations, totals, all 64 displayed
ranges/lengths and bounded 16-byte samples match physical scans. All 1,572,864
non-BIOS bytes and every byte outside the outer FFS/BIOS remain identical.
Removal invalidation, both-version changed-image rejection, zero page errors
and the static-GET-only privacy boundary pass. Final local `npm run check` and
exact-head CI are required separately before merge and audited in the PR.
