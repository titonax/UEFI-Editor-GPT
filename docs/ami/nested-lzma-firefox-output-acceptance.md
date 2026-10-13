# Nested-volume LZMA source in deployed Firefox

## Revision and source

Recorded on 2026-10-13 at <https://titonax.github.io/UEFI-Editor-GPT/> against
main revision `1774af2af511638fd40cd286bd2859dd69bd2c51` (PR #154).
[Pages build and deployment](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/38431798315)
and [Code quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/38431798340)
completed successfully for that exact revision. The production bundle is
`assets/index-ChSfR2sA.js`.

Firefox 153.0, Playwright 1.62.1, headless Linux, viewport 1600 by 1000,
exercised the actual deployed application with its firmware/Tiano/IFRExtractor
WASM assets. No editor, queue, codec, builder, network response or download
adapter was mocked. The container required content sandbox level zero and
ignoring the environment's untrusted HTTPS issuer; these are explicit runner
options, not application changes or default browser settings.

The source is the existing accepted 4,194,304-byte complete Intel SPI image with
SHA-256 `cd22f87daee0d50bf82520aaa6669a6731bdaaf3692690649533790c8e027f9a`.
It was recovered from an already supplied private archive and checked against
[the exact engine acceptance](nested-lzma-spi-output-acceptance.md). Firmware,
exported editor JSON and downloads stayed local and private. Its BIOS region is
`[0x180000, 0x400000)`; all 1,572,864 Descriptor/ME bytes before BIOS must remain
unchanged. The engine acceptance was also reproduced independently with the
current published WASM assets.

## Actual editing and output flow

1. Select the complete SPI and start HII analysis. The editor opens 68 Forms and
   inventories 567 suppressions.
2. Export the current `data.json` and import it unchanged. Wait for the file
   control to reset after asynchronous source validation; the queue remains
   empty.
3. Change only the existing constant-true `SuppressIf` at `0x2B15A` to
   `active: false` in the local exported JSON and import it through the actual
   source-bound control. The queue contains one selected **Show 18 suppressed
   item(s) in Advanced** operation and one net logical field. This establishes
   the JSON import route for the exact suppression scope, not direct question-row
   controls, a portable queue session or the separately accepted SetupData/root
   scopes.
4. Before Apply, **Check firmware output** is disabled. Apply the selected queue
   and check the output; **Modified firmware image** remains disabled until the
   complete reconstruction and independent reopening have succeeded.
5. Review the real output report and explicitly download the verified image.

| Observed field                                | Value                         |
| --------------------------------------------- | ----------------------------- |
| Complete output                               | 4,194,304 bytes               |
| Changed bytes                                 | 140,878                       |
| BIOS interval                                 | `[0x180000, 0x400000)`        |
| Owning FFS interval                           | `[0x1A0048, 0x30CCC5)`        |
| Original LZMA packed bytes / checked capacity | 1,494,108 / 1,494,108         |
| Rebuilt LZMA packed bytes                     | 1,494,085                     |
| Verified remaining bytes                      | 23, in that section only      |
| Bytes changed outside owning FFS / BIOS       | 0 / 0, independently compared |

The downloaded output SHA-256 is
`6920f3fed99e90f52c264c0a8b466293f934f652f1fe13d02485d889072d0c0b`,
identical to the previously accepted engine output. The independent engine rerun
also verifies exact decoded HII bytes, unchanged AMITSE/SetupData, fixed
allocations, both FFS checksum layers and immutable source buffers. The browser
report is not substituted for that independent test.

Remove the operation through the queue dialog: download and output details
become disabled. Reload the application, select the actual downloaded image and
start fresh analysis. The new queue is empty, download remains disabled without
a newly verified result, and all 68 Forms reopen. The condition expression is
unchanged; its freshly parsed body start and closing End both lie at `0x2B15E`,
where the original body was nonempty. The patch empties the suppression body; it
does not persist the editor's `active: false` flag in firmware. A fresh parser
still inventories that now-empty condition as active source evidence.

## Reproduce

Install Playwright and its Firefox runtime separately, then run the opt-in
checker from the repository with the private source:

```bash
FIRMWARE_ACCEPTANCE_IMAGE=/path/to/accepted-source.bin \
node scripts/firmware-nested-lzma-firefox-acceptance.mjs
```

If Playwright is installed outside this repository, set
`FIRMWARE_BROWSER_PLAYWRIGHT_MODULE` to its module path. An already installed
Firefox executable can be selected with `FIRMWARE_BROWSER_FIREFOX_EXECUTABLE`.
Only if required by the container, set `FIRMWARE_BROWSER_CONTAINER_SANDBOX=1`
and/or `FIRMWARE_BROWSER_IGNORE_HTTPS_ERRORS=1`; neither is enabled by default.
The runner rejects another source size/hash, performs the deployed controls,
checks the exact download hash and every byte outside the owning FFS and BIOS,
and rereads the download through Firefox. It keeps private intermediates in a
new local temporary directory and removes them on completion or failure; stdout
contains technical metadata only. It is not part of synthetic CI and never
uploads firmware or JSON to GitHub.

The independent engine rerun uses the reproduction command in
[nested-volume LZMA full-SPI acceptance](nested-lzma-spi-output-acceptance.md),
with the three WASM assets from the same deployed application.

## Limits

Acceptance is limited to this exact source and the documented HII suppression
scope. It does not establish the direct question-row UI, SetupData/root/combined
queue interaction in Firefox, queue-session import, desktop file-picker behavior,
physical flashing or recovery. It does not broaden the separately accepted
engine scopes. Allocation growth, capsules, unsupported codecs and other source
hashes remain blocked. Reopening the modified hash does not promote it to a new
accepted writer source. Other release paths retain their own real-source and
browser gates.
