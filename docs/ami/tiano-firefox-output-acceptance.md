# Exact Tiano combined queue in deployed Firefox

## Revision and source

Recorded on 2026-10-13 at <https://titonax.github.io/UEFI-Editor-GPT/> against
revision `73351bdbe26c4814c5bcbe57c52f4346d0a30800` (PR #150).
[Pages deployment](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/38410137727)
and Code quality completed successfully for that revision. The production bundle
is `assets/index-BFP9ozd5.js`.

Firefox 153.0, Playwright 1.62.1 build 1538, headless Linux, viewport 1600 by
1000, exercised the real deployed controls and assets. The container required
content sandbox level zero; this was a browser test setting, not an app change.
The browser loaded deployed `tiano-decompress.wasm` and `ifrextractor.wasm`.
No editor, queue, codec, layout API, download adapter or network response was
mocked.

The source is the existing accepted 8,388,608-byte SPI image, SHA-256
`297390ca838c455791a5bf3a3f0001fbf36a8cb31be362ea2123b8df84dfffe8`.
Its identity and original archive member are already documented in
[combined queue engine acceptance](tiano-combined-queue-acceptance.md).
Firmware, exported editor JSON and downloads stayed private and local. Only
metadata is recorded here.

## Actual editing flow

1. Select the complete source and start HII analysis. The editor opens 70 Forms
   and the code-corroborated seven-entry root vector.
2. Use **Move DRAM Timing Control**, the real destination selector and **Move
   menu** to relocate the existing Ref from Ai Tweaker to CPU Power Management.
3. Open Main and change the Security Ref's first SetupData flags field from `01`
   to `00`. This is the field represented as Access Level in the engine record;
   no broader interpretation of its bits is inferred.
4. Export the current `data.json`, change only the existing `0x8B359` suppression's
   `active` value to false locally and import it through the source-bound
   **data.json** control. Its checksum/source validation and fresh binary
   hydration remain in force. The queue adds **Show 1 suppressed item(s)** for
   that exact scope. This suppression has no associated question-row toggle;
   this step establishes the existing JSON import route, not a direct Show
   button for the unassociated scope or a portable session import.
5. Open **Top-level menu** and set Boot's desired root state to hidden. The queue
   has four selected operations: move, flags, suppression and root. This order
   differs from the engine test's order; the downloaded bytes still match its
   exact combined output.
6. Apply the selected queue, close it and check the firmware output. Download is
   disabled during reconstruction. The successful output report shows:

| Observed field              | Value                                             |
| --------------------------- | ------------------------------------------------- |
| Complete output             | 8,388,608 bytes                                   |
| Changed / unchanged bytes   | 140,913 / 8,247,695                               |
| Changed ranges              | 737; first 64 displayed with bounded samples      |
| Preserved outside BIOS      | 1,572,864 bytes                                   |
| Owning FFS allocations      | `[0x316DD8, 0x342F0E)` and `[0x466170, 0x48F432)` |
| SetupData section remaining | 4 bytes, checked terminal padding                 |
| Setup section remaining     | 0 bytes, original payload capacity                |

Close the report and explicitly download **Modified firmware image**. The file
has the original basename and `-modified.bin` suffix. Independent local byte
comparison confirms that every byte outside the two owning FFS allocations is
unchanged. Complete size and SHA-256 match the engine acceptance:
`264f90a0934848916bdc3e123564ce5c67c068faa6c48ee03e756f7c21f3aaae`.

Remove the Boot operation through the queue dialog: download and output details
both become disabled. Reload the application and select the downloaded image
through the complete-image input. Fresh HII analysis opens an empty queue,
detects Boot's hidden root state, reads Security flags `00` and places DRAM Timing
Control under CPU Power Management. Expand the nested tree branch before selecting
that moved menu. The exact output hash also covers the independently verified
suppression and untouched AMITSE documented by the engine test.

## Limits and observed product follow-up

This records the deployed Firefox gate for the exact accepted Tiano combination
using the specified controls, including source-bound editor JSON import. It does
not establish direct UI control for every suppression, human desktop file-picker
behavior, queue sessions, another source, other compression variants, physical
flashing or recovery. The other release scopes retain their own gates.

Importing the exported JSON also exposed a queue comparison defect: JSON omits
optional fields with `undefined` values, and the queue currently treats those
omissions as removals. This run displayed 4,520 logical fields despite the four
requested operations. Reconstruction still produced the exact accepted bytes.
Keep that concrete product-hardening follow-up separate from binary acceptance;
defined values and stale-operation guards must remain meaningful when fixing it.

## Local production-build regression after queue import correction

On 2026-10-13, Firefox 153.0 exercised the corrected production bundle
`assets/index-ChSfR2sA.js` served locally, with the same source and unmodified
deployed Tiano/IFRExtractor assets. This is a local production-build check,
separate from the deployed revision recorded above.

- Exporting and importing the unchanged editor JSON left **Change queue (0)**.
- Importing only the `0x8B359` suppression override produced one operation and
  exactly one net logical field, without optional-property removals.
- The opened source's negative single-FormSet navigation report was restored
  after imported analysis was discarded. It did not become a queued removal.
- Adding the same Ref move, Security flags and Boot toggle produced four selected
  operations. Apply, Check and explicit download again returned the accepted
  8 MiB output hash above; every byte outside the two FFS allocations remained
  identical.

The combined projection still reported 4,339 fields, including the many derived
IFR positions changed by the structural move. The correction removes JSON-only
absence and lost source-analysis noise; it does not turn a structural move into
four scalar patches or discard its ownership/offset metadata. Defined value
changes and exact replay preconditions retain their own regression checks.

## Complete-image byte report against actual downloads

Reproduced on 2026-10-18 (Europe/Madrid) against deployed main
`b65d0889345d95bbe2280f916eb2b92192ff79d0` (PR #199), after fresh exact-SHA
[Quality](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39094106187)
and automatic [Pages build/deployment](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/39094106131)
success. Pages returned HTTP 200. Firefox 153.0 / Playwright 1.62.1, headless Linux,
1600 × 1000 used the documented container/certificate settings and deployed
`index-LM6CCH_b.js`, `index-D4JOsfQ5.css`, `tiano-decompress.wasm` and
`ifrextractor.wasm`. The original authorized SPI was size/SHA-256 checked afresh.
No browser API, queue, codec or writer was mocked, delayed or fault-injected.

The existing opt-in Boot restore checker now opens Output details after each
verified download. A separate local run-based scan of the original and downloaded
physical images computes every contiguous changed interval and exact totals;
it does not import the production comparison helper or trust rendered values.
Every one of the 64 displayed rows must have the exact physical start/exclusive
end, complete interval length and original/rebuilt bytes from that interval's
first `min(length, 16)` positions. Both variants exercise omitted ranges and
truncated samples. Byte samples are neither logged nor committed, even in the
new assertion's failure diagnostics.

| Output variant            | Changed bytes | Unchanged bytes | Total ranges | Displayed ranges |
| ------------------------- | ------------: | --------------: | -----------: | ---------------: |
| Boot hidden               |       140,913 |       8,247,695 |          737 |               64 |
| Boot restored / net-three |        49,938 |       8,338,670 |          252 |               64 |

The report also has to label offsets as complete physical-image positions,
state its 16-byte sampling bound and report 1,572,864 preserved non-BIOS bytes.
Closing it leaves Check, download and details enabled. Existing queue mutations
and history assertions still require output/details invalidation, then fresh
Apply/Check before the next report: a hidden report cannot satisfy the restored
report's exact totals/rows, or vice versa.

All nine reports pass: original four-edit hidden, five-entry restored,
session-restored, paused-Show hidden, post-Undo restored, post-Redo hidden,
reselected-Show restored, valid reordered session restored and root-pair-removed
net-three. Their complete 8,388,608-byte downloads retain the existing known
hashes: three hidden SPIs are
`264f90a0934848916bdc3e123564ce5c67c068faa6c48ee03e756f7c21f3aaae`;
six restored/net-three SPIs are
`d9c22589b68884e973af22f87f718b7fc9fb130bfbdcca3871a55c12d294f3be`.
All changed bytes stay inside original FFS owners `[3239384, 3419918)` and
`[4612464, 4781106)`; every non-BIOS byte is identical.

Eight independent reanalyses reopen the restored, net-three and six session/
history/reselection/reordering outputs. They retain 70 Forms, Security flags
`00`, the unique moved Ref in Form 5 and empty suppression scope; hidden outputs
retain vector `1111011`, restored ones `1111111`. Source replacement resets
output/details. No application page errors occurred. The complete checker passed
on its first attempt; hashes, counts, allocation, codec, checksum, ownership,
independent reconstruction and the 15-minute Check limit remain unchanged.

```bash
FIRMWARE_ACCEPTANCE_IMAGE=/path/to/source.bin \
node scripts/firmware-tiano-boot-restore-firefox-acceptance.mjs
```

Private source, decoded/editor/session JSON and output files remain local and
are removed on exit; CI has no private input. This is real-Firefox exact-source
report acceptance, not a standalone engine rerun, new synthetic acceptance or
hardware validation. It does not accept reports from other sources/families,
zero-change output, further session races or unsupported writer paths. Missing
uncompressed AMI/mixed real-source gates, unsupported compression, growth,
capsules, new BIOS and P53 dynamic roots remain unchanged.
