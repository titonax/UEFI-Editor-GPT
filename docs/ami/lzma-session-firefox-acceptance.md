# Exact first-LZMA v2 suppression session in deployed Firefox

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

The optional browser module/executable/container settings match the original
LZMA checker. Reconstruction is bounded to 15 minutes; private intermediate files
are removed on success or failure. Public CI never supplies private firmware.

This establishes exact-source v2 suppression-session acceptance in deployed
Firefox. It does not establish v1 replay, other operations, AMITSE/SetupData
output on this source, desktop file-picker behavior, hardware or recovery.
Synthetic and React/jsdom tests remain separate. Other hashes/codecs, growth,
capsules and unsupported roots remain blocked; P53 dynamic roots and new BIOS
remain parked.
