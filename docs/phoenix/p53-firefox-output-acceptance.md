# P53 deployed Firefox output acceptance

## Deployment and scope

Recorded on 2026-10-13 against the deployed application at
<https://titonax.github.io/UEFI-Editor-GPT/>:

- Revision: `e487b7e0b6c283f820b281095ac51e0de1dc7499` (merged PR #149).
- [Pages deployment](https://github.com/titonax/UEFI-Editor-GPT/actions/runs/38380217865)
  and Code quality both completed successfully for that revision.
- Browser: Firefox 153.0, Playwright 1.62.1 Firefox build 1538, headless Linux,
  viewport 1600 by 1000. The container required content sandbox level zero to
  create a page; this is a test-environment setting, not an application change.
- Source: the existing accepted 33,554,432-byte SPI image, SHA-256
  `68eba5b369baf36c879551c0482a6feea31d68082bc4dd0631bf9e4427a88a64`.
- Loaded production bundle: `assets/index-BFP9ozd5.js`. The browser loaded the
  deployed `firmware-decompress.wasm` and `ifrextractor.wasm` assets.

This is actual deployed Firefox interaction with the existing real source,
not jsdom or a locally substituted editor. File selection, destination selector,
queue, codecs, reconstruction, report and browser download were exercised through
the production controls. No application modules, layout APIs or download adapter
were mocked. Firmware and screenshots remained private; this record contains
metadata only.

## Observed flow

1. Select the original image through the complete-image file input. Discovery
   reports 25 HII modules. Start vendor-neutral HII analysis: nine joined modules
   and 187 Forms appear in the editor.
2. Use the tree's **Move Debug Settings** control and the actual destination
   selector to choose **PCI Subsystem Settings**, then **Move menu**. The queue
   contains one operation; Check remains disabled before Apply.
3. Open **Change queue (1)**, choose **Apply selected**, close the dialog and run
   **Check firmware output**. Download is disabled during reconstruction.
4. After verification, open **Output details**. It reports 33,554,432 bytes,
   8,991,518 changed bytes, 24,562,914 unchanged bytes and 35,004 changed ranges.
   The displayed comparison is explicitly limited to 64 ranges and 16-byte
   samples. Both physical Setup copies in buffers 2 and 4 are verified. Both
   LZMA sections rebuild from 4,513,620 to 4,491,300 bytes with 22,320 bytes
   remaining. All 10,485,760 non-BIOS bytes are preserved.
5. Close the report and explicitly click **Modified firmware image**. Firefox
   emits a download with the original basename and `-modified.bin` suffix.
   An independent local byte check verifies complete size, unchanged non-BIOS
   bytes and SHA-256
   `4c52549b9df88a7763eedf4fa0cf842909d800431b10a88c76d73c851792d10b`.
6. Remove the operation through the queue dialog. Both download and output
   details become disabled.
7. Choose **Load another firmware**, select the downloaded image and start HII
   analysis again. Its navigation table places **Debug Settings** (`0x1006`)
   under **PCI Subsystem Settings**, instead of **Intel Advanced Menu**. The
   empty reopened queue requires a new Check; cached acceptance is not restored.

## Limits and reproduction

Repeat the [deployed Firefox checklist](uefi-hii-output-user-flow.md#firefox-verification-after-deployment)
with the exact source identity above and compare the downloaded file locally.
The [engine acceptance](p53-mirrored-lzma-output-acceptance.md) separately
documents independent binary verification of both copies and rejected edits.

This record closes the deployed Firefox gate for this exact static Setup Ref
move on the named revision. It does not establish human-operated desktop
file-picker behavior, other browser versions, queue-session acceptance, runtime
root registration, another P53 source, other compressed drivers or hardware
flashing/recovery. Mixed-source output remains separately blocked on its missing
qualifying source. The full tracked release inventory still has pending gates.
