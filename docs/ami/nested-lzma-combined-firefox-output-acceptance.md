# Nested-volume LZMA combined queue in deployed Firefox

## Revision and source

Recorded on 2026-10-14 at <https://titonax.github.io/UEFI-Editor-GPT/>
against main revision `e3fc920333dd8d187ff08ae8853fc34a9bfb619c` (PR #155).
[Pages](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/38463407904)
and [Code quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/38463408081)
completed successfully for that exact revision. The deployed production bundle
was `assets/index-ChSfR2sA.js`.

Firefox 153.0, Playwright 1.62.1, headless Linux and a 1600 by 1000 viewport
exercised the deployed application and its published firmware, Tiano and
IFRExtractor WASM assets. No editor, queue, codec, builder, response or download
adapter was mocked. The runner options needed for the container's sandbox and
HTTPS issuer are explicit and do not change the application or browser defaults.

The private input is the existing accepted 4,194,304-byte complete Intel SPI
with SHA-256
`cd22f87daee0d50bf82520aaa6669a6731bdaaf3692690649533790c8e027f9a`.
It was recovered from an already supplied private archive and checked before
use. Firmware, editor JSON and output stayed local. The BIOS region is
`[0x180000, 0x400000)` and the owning outer FFS is
`[0x1A0048, 0x30CCC5)`.

## Actual four-operation flow

The test starts with a fresh analysis and uses this order because a structural
move removes the root controls from the current projected navigation view:

1. Use the real root control to show Chipset, changing root index 4 from zero to
   one.
2. Use the real move dialog to move the selected CPU Configuration Ref from
   Advanced (`0x403`) to the existing PCI Subsystem Settings form (`0x40A`).
3. Open Main and use the real System Language SetupData control to change its
   access byte at `0x29EC` from `01` to `00`.
4. Export the projected source-bound `data.json`, change only the remapped
   constant-true suppression at `0x2B14B` to inactive, and import it through the
   actual JSON control. This proves the import route for that unassociated
   scope; it is not a direct Show-button claim.

The queue contains four selected semantic operations. Its 681 net logical
fields include offsets remapped by the structural move; they are not 681 user
actions or 681 independent byte patches. Before Apply, output checking is
disabled. After Apply, the download remains disabled until complete rebuilding
and independent reopening succeed.

| Observed field                                | Value                                                              |
| --------------------------------------------- | ------------------------------------------------------------------ |
| Complete input/output                         | 4,194,304 bytes                                                    |
| Output SHA-256                                | `014af11ec7d614471d873974b83b90c1ae5583adb51beeeda68d3c6940bd64e6` |
| Changed complete-SPI bytes                    | 850,394                                                            |
| Original LZMA packed bytes / checked capacity | 1,494,108 / 1,494,108                                              |
| Rebuilt LZMA packed bytes                     | 1,493,440                                                          |
| Verified remaining bytes                      | 668, inside the existing section only                              |
| Bytes changed outside owning FFS / BIOS       | 0 / 0, independently compared                                      |

The hash and byte counts match the existing real-engine four-operation result.
All 1,572,864 bytes before BIOS remain unchanged. No allocation grows or moves.

Removing one operation through the queue disables both the download and output
details. A fresh Firefox reload of the downloaded image opens 68 Forms with an
empty queue and download disabled until a new check. Independent parsing finds:

- one CPU Configuration Ref left under Advanced and one under PCI Subsystem
  Settings, the latter at `0x2B49B`;
- the suppression at `0x2B14B` with an empty body starting and ending at
  `0x2B14F`;
- System Language access `00`;
- all eight freshly detected root-vector bytes equal to one.

## Reproduce

Install Playwright and its Firefox runtime separately, then run:

```bash
FIRMWARE_ACCEPTANCE_IMAGE=/path/to/accepted-source.bin \
node scripts/firmware-nested-lzma-combined-firefox-acceptance.mjs
```

If required, select an external Playwright module and installed Firefox with
`FIRMWARE_BROWSER_PLAYWRIGHT_MODULE` and
`FIRMWARE_BROWSER_FIREFOX_EXECUTABLE`. The container-only sandbox and HTTPS
options are `FIRMWARE_BROWSER_CONTAINER_SANDBOX=1` and
`FIRMWARE_BROWSER_IGNORE_HTTPS_ERRORS=1`; both default off. The checker rejects
another source hash or size, verifies the exact queue/report/download, compares
every complete-image byte, invalidates the result and rereads the actual output.
Private intermediates use a new temporary directory and are removed on success
or failure. This opt-in real-source browser test is not run by public CI.

The separate engine reproduction command remains documented in
[root and structural queue acceptance](nested-lzma-root-queue-output-acceptance.md).

## Limits

This establishes the exact combined browser path and its direct root, move and
SetupData controls. The suppression still uses source-bound JSON. It does not
establish portable queue-session import, desktop file-picker behavior, physical
flashing, recovery, another source or broader AMI/LZMA compatibility. Root-only
output for this source still exceeds its compressed allocation and remains
blocked. Allocation growth, capsules, unsupported codecs, AMITSE editing and
P53 dynamic roots remain unsupported or parked as previously recorded.
