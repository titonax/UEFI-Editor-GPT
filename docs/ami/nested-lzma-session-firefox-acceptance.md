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
Combined v1 replay, AMITSE retargeting, other sources/codecs and human desktop
file-picker behavior are not established. Root-only output still exceeds the
existing compressed allocation and remains blocked. Growth, capsules, unsupported
compression, P53 dynamic roots and new BIOS cases retain their prior boundaries.
