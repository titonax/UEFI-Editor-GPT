# Exact first LZMA source in deployed Firefox

## Revision and source

Recorded on 2026-10-13 at <https://titonax.github.io/UEFI-Editor-GPT/> against
main revision `9d92927e8361e59e066e741a97ac9a6fac3e345b` (PR #153).
[Pages build and deployment](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/38422906583)
and [Code quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/38422906683)
completed successfully for that exact revision. The production bundle is
`assets/index-ChSfR2sA.js`.

Firefox 153.0, Playwright 1.62.1, headless Linux, viewport 1600 by 1000,
exercised the actual deployed application with its firmware/Tiano/IFRExtractor
WASM assets. No editor, queue, codec, builder, network response or download
adapter was mocked. The container required content sandbox level zero and
ignoring the environment's untrusted HTTPS issuer; these are explicit runner
options, not application changes or default browser settings.

The source is the existing accepted 16,777,216-byte BIOS image with SHA-256
`fcd0a7d9f42934b92783bc569ad3f48dea8e6b9775d0fafdd7b2dee9af587b03`.
It was recovered from the already supplied archive and checked against
[the exact engine acceptance](compressed-output-acceptance.md). Firmware,
exported editor JSON and downloads stayed local and private. This layout is a
BIOS image, not an Intel descriptor-bearing complete SPI image; its BIOS region
is the whole input and it has zero bytes outside BIOS. The independent engine
acceptance was also reproduced with the current published WASM assets.

## Actual editing and output flow

1. Select the complete image and start HII analysis. The editor opens 277 Forms
   and 3,548 conditions.
2. Export the current `data.json` and import it unchanged. Wait for the file
   control to reset after the asynchronous source validation; the queue remains
   empty.
3. Change only the existing `SuppressIf` at `0x5B2D9` to `active: false` in the
   local exported JSON and import it through the actual source-bound control.
   The queue contains one selected **Show 1 suppressed item(s)** operation and
   one net logical field. This establishes the JSON import route for the exact
   unassociated scope, not a direct Show button for a question row or a portable
   queue session. Source checks and fresh binary hydration remain in force.
4. Before Apply, **Check firmware output** is disabled. Apply the selected queue
   and check the output; **Modified firmware image** remains disabled until the
   complete reconstruction and independent reopening have succeeded.
5. Review the real output report and explicitly download the verified image.

| Observed field                                | Value                             |
| --------------------------------------------- | --------------------------------- |
| Complete output                               | 16,777,216 bytes                  |
| Changed bytes                                 | 4,987,327                         |
| Owning FFS interval                           | `[0x2D0078, 0x796832)`            |
| Original LZMA packed bytes / checked capacity | 5,007,242 / 5,007,242             |
| Rebuilt LZMA packed bytes                     | 4,984,931                         |
| Verified remaining bytes                      | 22,311, in that section only      |
| Bytes changed outside the owning FFS          | 0, independently compared locally |

The downloaded output SHA-256 is
`31973e862e1929f8791508582da5189f28355a2577fcab15f28f90056299d543`,
identical to the previously accepted engine output. The current engine rerun
also verifies exact HII bytes, unchanged AMITSE/SetupData and allocation/checksum
boundaries. The browser report is not substituted for that independent test.

Remove the operation through the queue dialog: download and output details
become disabled. Reload the application, select the actual downloaded image
and start fresh analysis. The new queue is empty, download remains disabled without a newly verified
result, and all 277 Forms reopen. The condition's expression is unchanged;
its newly read body start and closing End both lie at `0x5B2F3`, instead of the
original nonempty interval `[0x5B2F3, 0x5B30B)`. The patch empties the suppression
body; it does not persist the editor's `active: false` flag in firmware. A fresh
parser still inventories that now-empty condition as active source evidence.

## Reproduce

Install Playwright and its Firefox runtime separately, then run the opt-in
checker from the repository with the private source:

```bash
FIRMWARE_ACCEPTANCE_IMAGE=/path/to/accepted-source.bin \
node scripts/firmware-lzma-firefox-acceptance.mjs
```

If Playwright is installed outside this repository, set
`FIRMWARE_BROWSER_PLAYWRIGHT_MODULE` to its module path. An already installed
Firefox executable can be selected with `FIRMWARE_BROWSER_FIREFOX_EXECUTABLE`.
Only if required by the container, set `FIRMWARE_BROWSER_CONTAINER_SANDBOX=1`
and/or `FIRMWARE_BROWSER_IGNORE_HTTPS_ERRORS=1`; neither is enabled by default.
The runner rejects another source size/hash, performs the real deployed controls,
checks the exact download hash and every byte outside the FFS, and rereads the
download through Firefox. It stores private intermediate files in a new local
temporary directory and removes it on completion or failure; stdout contains
technical metadata only. It is not part of synthetic CI and never uploads
firmware or JSON to GitHub.

The independent engine rerun uses the reproduction command in
[compressed output acceptance](compressed-output-acceptance.md), with the
three WASM assets from the same deployed application.

## Limits

Acceptance is limited to this exact source and the documented Setup HII scope
override. It does not establish other LZMA sources, AMITSE/SetupData editing on
this source, a direct question-row toggle, queue-session import, desktop file
picker behavior, physical flashing or recovery. Allocation growth, capsules,
unsupported codecs and other source scopes remain blocked. Reopening the modified hash does not
promote it to a new accepted writer source. Other release paths
retain their own real-source and browser gates.
