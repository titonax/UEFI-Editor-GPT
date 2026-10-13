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
