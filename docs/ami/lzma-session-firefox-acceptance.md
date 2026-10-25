# Exact first-LZMA v2/v1 suppression sessions in deployed Firefox

Reproduced on 2026-10-14 at <https://titonax.github.io/UEFI-Editor-GPT/> against
`4df510b0c6c9fa3d7157d98e1a53ee192a41e177` (merged PR #161).
[Code quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/38608080323)
and [Pages](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/38608080406)
were successful for that exact SHA before the run.

Firefox 153.0, Playwright 1.62.1 build 1538, headless Linux, viewport 1600 × 1000,
loaded `index-_Q4xhBY9.js`, `index-D4JOsfQ5.css`, `firmware-decompress.wasm`,
`tiano-decompress.wasm` and `ifrextractor.wasm`. Explicit container sandbox and
certificate-error settings did not change the app. No editor, queue, codec,
builder, response or download was mocked.

The existing accepted input is a 16,777,216-byte BIOS image, SHA-256
`fcd0a7d9f42934b92783bc569ad3f48dea8e6b9775d0fafdd7b2dee9af587b03`.
Its BIOS region is the entire input; it is not a descriptor-bearing full SPI
and has zero bytes outside BIOS. See [engine acceptance](compressed-output-acceptance.md)
and [output Firefox acceptance](lzma-firefox-output-acceptance.md). Firmware,
editor JSON, session JSON and output remained private and local.

## Actual session flow

Fresh analysis opened 277 Forms and 3,548 conditions. Exporting/importing the
unchanged source-bound `data.json` left the queue empty. Changing only the
existing `0x5B2D9` SuppressIf active flag to false through that same JSON route
created one selected operation and one net logical field. This remains the
accepted import route for an unassociated scope, not a direct Show-button claim.

Save queue session produced format `uefi-editor-queue-session`, version 2, kind
`hii-menu-actions`. The source contains only full-image SHA-256/size and the
opened-context hash. Its exact enabled operation is `suppressions`, with one
change: condition index 0, active false. The checker asserts the complete schema
and operation. No filename, source bytes, offset, binary patch, label, history
or Apply state is exported.

Clear emptied the queue. Load restored one selected suppression operation,
unapplied, with Check firmware output still disabled. Apply followed by a fresh
Check performed reconstruction before explicit download.

| Reproduced field                 | Value                                                              |
| -------------------------------- | ------------------------------------------------------------------ |
| Complete output                  | 16,777,216 bytes                                                   |
| SHA-256                          | `31973e862e1929f8791508582da5189f28355a2577fcab15f28f90056299d543` |
| Changed bytes                    | 4,987,327                                                          |
| Changes outside owner            | 0                                                                  |
| Owning FFS                       | `[2949240, 7956530)`                                               |
| Original packed bytes / capacity | 5,007,242 / 5,007,242                                              |
| Rebuilt packed bytes / remaining | 4,984,931 / 22,311                                                 |

The report and independent local byte comparison reproduce the accepted output.
Codec, allocation, checksum and independent reconstruction-reader guards remain
unchanged. Removing the operation disabled download and output details.

A fresh reload of the actual downloaded image reopened 277 Forms, an empty queue
and disabled download. Newly exported parser data retained the condition's
expression and confirmed its empty body at `0x5B2F3`, replacing the original
nonempty body. The editor override is not a persisted active flag in firmware;
the parser still inventories the condition as source evidence. Loading the
original session on this changed image rejected with the different-image/context
error and kept the queue empty and download disabled. No page errors occurred.

## Reproduce and limits

With Playwright and real Firefox installed, supply the private accepted source:

```bash
FIRMWARE_ACCEPTANCE_IMAGE=/path/to/source.bin \
node scripts/firmware-lzma-session-firefox-acceptance.mjs
```

`FIRMWARE_ACCEPTANCE_URL` optionally selects the application URL. It defaults to
Pages; a private-policy run can instead serve the production build on loopback,
for example `http://127.0.0.1:4173/UEFI-Editor-GPT/`, without selecting private
firmware into a public origin.

The optional browser module/executable/container settings match the original
LZMA checker. Reconstruction is bounded to 15 minutes; private intermediate files
are removed on success or failure. Public CI never supplies private firmware.

This original run established exact-source v2 suppression-session acceptance in deployed
Firefox. It did not establish v1 replay, other operations, AMITSE/SetupData
output on this source, desktop file-picker behavior, hardware or recovery.
Synthetic and React/jsdom tests remain separate. Other hashes/codecs, growth,
capsules and unsupported roots remain blocked; P53 dynamic roots and new BIOS
remain parked.

## Complete-BIOS byte report against the actual download

Reproduced on 2026-10-18 against deployed main
`65adaa2f9b680ef34352c413dfa15e91b9814b53`.
[Code quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39114927783)
and [Pages](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39115181300)
were successful for that exact SHA before this run. Firefox 153.0 with
Playwright 1.62.1 build 1538 loaded `index-LM6CCH_b.js`, `index-D4JOsfQ5.css`
and the three deployed WASM readers listed above. The same explicit container
and certificate settings were used; no application behavior or response was mocked.

The extended opt-in checker scans the actual v2-restored download independently
of the production comparison helper and rendered data. It checks the exact
complete-image totals and every displayed physical start, exclusive end, length,
original sample and rebuilt sample. Sample bytes stay private, including assertion
diagnostics; only numeric totals are logged.

| Independently measured field       | Result                 |
| ---------------------------------- | ---------------------- |
| Complete image                     | 16,777,216 bytes       |
| Changed / unchanged bytes          | 4,987,327 / 11,789,889 |
| Contiguous changed ranges          | 19,458                 |
| Displayed ranges, all matched      | 64                     |
| Maximum bytes per displayed sample | 16                     |
| Changes outside owning FFS         | 0                      |

The real image exercises both omitted ranges and truncation of long displayed
samples. The dialog states complete physical-image offsets and matches the
BIOS interval `[0x0, 0x1000000)`, zero outside-BIOS bytes and the accepted packed,
rebuilt and remaining sizes. Closing the report retains enabled Check, details
and download controls. The known output hash and owner confinement still pass.
Removing the operation again invalidated output and details. A fresh reload of
the actual download reopened 277 Forms with the empty condition body and unchanged
expression. The original session was rejected on that changed source, with an
empty queue and disabled download. There were no page errors.

This is the complete BIOS-only source, not evidence for Descriptor/ME preservation
on a descriptor-bearing SPI. At that revision, other operations, v1 replay and hardware remained
outside this acceptance. The reproduction command above includes these
independent report assertions.

## Legacy v1 migration with fresh BIOS output

Reproduced on 2026-10-19 (Europe/Madrid) against deployed main
`1b83faef543b8bb3b87380dc4a0583fea3c0b766`, after successful exact-SHA
[Quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39181383640)
and automatic [Pages build/deployment](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39181383787).
Firefox 153.0 / Playwright 1.62.1 build 1538, headless Linux, 1600 × 1000 used
the documented container/certificate settings, `index-DvYis56o.js`,
`index-D4JOsfQ5.css` and all three deployed WASM readers. The exact source was
recovered from the existing authorized ChatGPT archive and checked by size/hash;
no new BIOS or semantic inventory was added. No browser API, editor, queue,
codec, writer, response or download was mocked, timing-gated or fault-injected.

The extended checker first reproduces the source-bound suppression JSON import
and metadata-only v2 export above. It constructs the legacy `hii-menu-actions`
v1 representation by changing only the version, not selectors or identities.
For each version, Clear/load restores one selected action, unapplied, with
Check/download/details disabled. Re-export must be deeply identical to the
original v2 session. Fresh Apply/Check produces an explicit actual download.

Both complete BIOS files are byte-identical and retain the known output hash
`31973e862e1929f8791508582da5189f28355a2577fcab15f28f90056299d543`.
Separate independent scans match each report: 4,987,327 changed and 11,789,889
unchanged bytes, 19,458 ranges and all 64 displayed boundaries/lengths/16-byte
samples, with the unchanged allocation/remaining-capacity assertions. No byte
outside owning FFS `[2949240, 7956530)` changes. Removing the action invalidates
output/details. Each downloaded file is independently analysed after a fresh
reload: 277 Forms, the same expression and empty body at `0x5B2F3`, empty queue
and disabled download. Its corresponding original v2/v1 session rejects on the
changed image/context without populating the queue. No application page errors
occurred; the full extended checker passed its first run.

This closes this exact-source v1 suppression-session gate only. The input is
BIOS-only, so this does not establish Descriptor/ME preservation on a full SPI,
other operations/sources, direct question-row controls, hardware or recovery.
The production pipeline, source/context identities, codecs, checksums,
allocations, 15-minute build limit and independent reread guards are unchanged.
Private firmware/editor/session JSON and downloads remain local; intermediates
are removed on exit. Synthetic and React/jsdom coverage and standalone engine
acceptance remain separate validation levels.

## Single-step session history and fresh output

Reproduced on 2026-10-24 (Europe/Madrid) against deployed main
`155ec1dc85d9ea3723040c6eb594dab0a52a6ccd`, after successful exact-SHA
[Code quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/40005462554)
and automatic [Pages build/deployment](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/40005462447).
Firefox 153.0 / Playwright 1.62.1 build 1538 loaded `index-BGap__g5.js`,
`index-D4JOsfQ5.css` and all three deployed WASM readers. The exact accepted
source was recovered from the authorized existing archive and checked by
size/SHA-256. No new BIOS or semantic inventory was added. No browser API,
editor, queue, codec, writer, response, download or timing was mocked.

After reproducing the v2/v1 flow above, the checker clears the queue and loads
the exact v2 suppression session over the empty state. A fresh Apply/Check and
explicit download produce the known complete-BIOS output. One Undo returns to
the empty queue; one Redo restores the exact selected suppression operation.
Both history directions leave Check, output details and download disabled, so
the verified bytes cannot survive a queue revision. Re-export after Redo is
deeply identical to the original metadata-only v2 session. A second fresh
Apply/Check/download after Redo is byte-identical to the first and to both
v2/v1 baselines.

Four actual complete-BIOS downloads were independently scanned and re-opened:
the v2 and v1 baselines plus the history output before Undo and after Redo. All
have SHA-256
`31973e862e1929f8791508582da5189f28355a2577fcab15f28f90056299d543`,
4,987,327 changed bytes, 11,789,889 unchanged bytes, 19,458 contiguous ranges
and zero changes outside owning FFS `[2949240, 7956530)`. Every report matched
all 64 displayed physical ranges and bounded 16-byte samples. Each independent
reload reopened 277 Forms, the same expression and empty scope body, an empty
queue and disabled output; the original session then rejected on those changed
bytes. No application page errors occurred, and the extended checker passed its
complete flow twice, including the final checked revision.

This closes only the single-operation first-LZMA session-load Undo/Redo gate.
The source remains BIOS-only; descriptor-bearing SPI preservation, other
actions/sources, asynchronous races, physical hardware and recovery remain
separate. Codec, allocation, checksum, ownership, timeout and independent-reader
guards are unchanged. Private source, JSON and downloaded images remained local.

## Three-state longer history in local production Firefox

Reproduced on 2026-10-24 (Europe/Madrid) from main
`d9207198fd32dcc5d3db2241d5c3ae90f835e23a`, whose exact-SHA
[Code quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/40042301562)
and automatic [Pages build/deployment](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/40042301664)
were already successful. The application itself was the production build served
only on `127.0.0.1`; Firefox 153.0 / Playwright 1.62.1 build 1538 loaded
`index-BGap__g5.js`, `index-D4JOsfQ5.css` and locally cached copies of the three
public deployed WASM readers. This was real Firefox, not React/jsdom, but it was
not an interaction with the deployed Pages origin. No application response,
editor, queue, codec, writer, timing, download or browser API was mocked.

Starting from a freshly checked selected suppression, the checker records three
additional queue revisions: pause the only operation, clear the paused queue,
then load the exact v2 session over the empty queue. It traverses all three
revisions backwards and forwards: selected → paused → empty → session-restored,
three Undo operations back to selected, then three Redo operations to the
session-restored state. Every transition leaves Check, output details and
download disabled. The final Redo re-exports a deeply identical metadata-only
v2 session and requires a fresh Apply/Check before download.

Five actual 16,777,216-byte outputs—the v2/v1 controls, before and after the
single-step history, and after the three-step Redo—are byte-identical with
SHA-256 `31973e862e1929f8791508582da5189f28355a2577fcab15f28f90056299d543`.
Each independent scan reports 4,987,327 changed bytes, 11,789,889 unchanged
bytes, 19,458 ranges, all 64 displayed physical ranges with bounded 16-byte
samples, and zero changes outside owning FFS `[2949240, 7956530)`. Five fresh
reopens independently recover 277 Forms, the unchanged expression and empty
scope body, an empty queue and disabled output; each original session rejects
against the changed image/context. No application page errors occurred.

This closes only this exact one-operation three-state queue-history shape.
Other histories, asynchronous races, other actions/sources, descriptor-bearing
SPI preservation, hardware and recovery remain separate. All codec, allocation,
checksum, ownership, 15-minute timeout and independent-reader guards remained
unchanged; private source, sessions and outputs stayed local.

## Controlled late session read across selection Undo

Reproduced on 2026-10-24 (Europe/Madrid) from main
`54b75ba93a7555eb8b63709b0ac3c641e64549ae` with Firefox 153.0 / Playwright
1.62.1 build 1538. The application was the production build served only on
`127.0.0.1`, using locally cached copies of the three public deployed WASM
readers. This was real Firefox, not React/jsdom, but it was not an interaction
with the deployed Pages origin. No editor, queue, codec, writer, digest result,
download or application response was mocked.

With the selected suppression and queue dialog still mounted, the checker
holds delivery of the real native `File.text()` result for the exact valid
paused v2 session. While that read is held it pauses the selected operation,
then uses Undo to return to the selected queue. Both revisions invalidate
Check, output details and download while retaining the available Redo branch.
Releasing the old text completes exactly one native read, but the stale request
performs zero identity hashes and produces no loaded status or alert. The
current selected queue, source, dialog, document and Redo branch remain intact.

Two current-request positive controls then load the same paused metadata and
the selected session normally. The paused load executes the native identity
hashes and selects zero operations; the selected load restores the exact
operation without an alert. A fresh Apply/Check produces a sixth actual
16,777,216-byte output, byte-identical to the five earlier accepted outputs at
SHA-256 `31973e862e1929f8791508582da5189f28355a2577fcab15f28f90056299d543`.
Its independent scan again reports 4,987,327 changed bytes, 11,789,889
unchanged bytes, 19,458 ranges, all 64 displayed physical ranges with bounded
16-byte samples, and zero changes outside owning FFS `[2949240, 7956530)`.
Six fresh reopens recover 277 Forms, the unchanged expression and empty scope
body, an empty queue and disabled output; every original session rejects
against the changed image/context. No application page errors occurred.

This closes only the exact old-read delivery across a selected → paused → Undo
selected queue-revision change. The delivery timing is controlled; ordinary
scheduling, actual I/O or hash failure, the old handler's full return, other
hash boundaries, rejection paths, histories, actions/sources,
descriptor-bearing SPI preservation, hardware and recovery remain separate.
All codec, allocation, checksum, ownership, 15-minute timeout and
independent-reader guards remained unchanged; private source, sessions and
outputs stayed local.

## Controlled final identity digest across selection Undo

Reproduced on 2026-10-24 (Europe/Madrid) from main
`b9412739ba9e49efae329573309000e86c3f5d22` with Firefox 153.0 / Playwright
1.62.1 build 1538. The production build and public deployed WASM readers were
served only on `127.0.0.1`. This was real Firefox, not React/jsdom or a deployed
Pages interaction. `File.text()` and all SHA-256 calculations remained native;
only delivery of the real third identity result was held.

The exact paused v2 session completed its two parallel source/Setup digests and
its final context digest while the selected queue and verified sixth output
remained current. Before delivering that final result, the checker paused the
only operation and used Undo to restore the byte-for-byte equal selected queue.
Both revisions invalidated Check, output details and download while retaining
Redo. Releasing the digest produced no session-loaded status or alert and could
not replace the selected queue, revive output or consume the Redo branch.

Current paused and selected session loads then completed normally. A fresh
Apply/Check produced a seventh actual 16,777,216-byte output, byte-identical to
all six earlier outputs at SHA-256
`31973e862e1929f8791508582da5189f28355a2577fcab15f28f90056299d543`.
Its independent scan again found 4,987,327 changed bytes, 11,789,889 unchanged
bytes, 19,458 ranges, all 64 displayed physical ranges with bounded 16-byte
samples, and zero changes outside owning FFS `[2949240, 7956530)`. Seven fresh
reopens recovered 277 Forms, the unchanged expression and empty scope body, an
empty queue and disabled output; every original session rejected against the
changed image/context. No application page errors occurred.

This closes only the exact final successful identity-digest delivery across a
selected → paused → Undo selected revision change. Timing is controlled; no
digest value or failure was fabricated. Ordinary scheduling, actual I/O/hash
failure, earlier digest boundaries, semantic rejection paths, other histories,
actions/sources, descriptor-bearing SPI, hardware and recovery remain separate.
Codec, allocation, checksum, ownership, 15-minute timeout and independent-reader
guards remained unchanged; private source, sessions and outputs stayed local.

## Controlled first identity digest across selection Undo

Reproduced on 2026-10-25 (Europe/Madrid) from main
`f1bd5235b0dac089199e20b65c943c6c88698f1d` with Firefox 153.0 / Playwright
1.62.1 build 1538. The production build and locally cached public deployed WASM
readers were served only on `127.0.0.1`. This was real Firefox, not React/jsdom
or a deployed Pages interaction. Both parallel SHA-256 calculations remained
native; only delivery of the real first result was held.

The exact paused v2 session started its parallel source and Setup identity
digests. Both native computations completed, while delivery of the first result
was held and the other result was delivered. The checker then paused the only
selected operation and used Undo to restore the byte-for-byte equal selected
queue. Both revisions invalidated Check, output details and download while
retaining Redo. Releasing the first result produced no session-loaded status or
alert, did not start the later context digest, and could not replace the queue,
revive output or consume Redo.

Current paused and selected session loads then completed normally. A fresh
Apply/Check produced an eighth actual 16,777,216-byte output, byte-identical to
all seven earlier outputs at SHA-256
`31973e862e1929f8791508582da5189f28355a2577fcab15f28f90056299d543`.
Its independent scan again found 4,987,327 changed bytes, 11,789,889 unchanged
bytes, 19,458 ranges, all 64 displayed physical ranges with bounded 16-byte
samples, and zero changes outside owning FFS `[2949240, 7956530)`. Eight fresh
reopens recovered 277 Forms, the unchanged expression and empty scope body, an
empty queue and disabled output; every original session rejected against the
changed image/context. No application page errors occurred.

This closes only the first successful identity-result delivery across a
selected → paused → Undo selected revision change. Timing is controlled; no
digest value or failure was fabricated. Ordinary scheduling, actual I/O/hash
failure, the second initial digest delivery, semantic rejection paths, other
histories, actions/sources, descriptor-bearing SPI, hardware and recovery remain
separate. Codec, allocation, checksum, ownership, 15-minute timeout and
independent-reader guards remained unchanged; private source, sessions and
outputs stayed local.
