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
Other report sources/families, zero-change output, combined v1 and session races
remain separate. Root-only allocation failure, unsupported formats/growth/capsules,
missing uncompressed AMI/mixed-source gates, new BIOS and P53 dynamic roots retain
their existing limits.
