# Vendor-neutral HII complete-image output

Load the complete source image, start vendor-neutral HII analysis, stage supported
edits, open **Change queue** and choose **Apply selected**. Then:

1. Choose **Check firmware output**. The image is rebuilt locally and independently
   reopened. No file is downloaded during this step.
2. Open **Output details** after verification succeeds. Review the complete output
   size, unchanged non-BIOS byte count, affected source allocations, verified
   physical HII copies and each compressed section's capacity/remaining bytes.
   Copy FFS offsets refer to decoded buffers; affected ranges refer to the source
   image. Remaining bytes are local to each section.
3. Choose **Modified firmware image** to download the exact checked bytes as
   `<original-name>-modified.bin`. A complete SPI input produces a complete SPI
   output. **Modified HII modules** is a separate extracted-module export for
   independent drivers; it is disabled in mixed workspaces, which require combined
   verified full-image output.

Changing, disabling, removing, clearing or reordering operations requires another
Apply and Check. Loading another image or replacing the workspace also invalidates
the result. Old asynchronous builds cannot enable a newer source/queue's download.
An unsupported compression, uncertain ownership, stale bytes, allocation overflow
or failed re-read leaves full-image download disabled and shows the error.

## Firefox verification after deployment

For the exact accepted P53 source, stage the **Debug Settings** Ref move from
**Intel Advanced Menu** to **PCI Subsystem Settings**, apply and check. Expected:
33,554,432 output bytes; two Setup physical copies; two LZMA sections with 22,320
remaining bytes each; 10,485,760 non-BIOS bytes preserved. Download explicitly and
reload the result for inspection. The initial acceptance is source/Setup specific.
An edit to another compressed driver remains blocked.

Before downloading, also try removing or disabling the operation and confirm that
download/details become unavailable until a new successful check. Verification
does not establish runtime root registration or physical flash behavior.

The routine frontend tests use synthetic results to exercise lifecycle failures.
The opt-in real-source frontend acceptance described below additionally exercises
the actual codecs and full-image engine through rendered React controls. The manual
Firefox flow remains a separate deployment check.

## Opt-in real-source frontend acceptance

Set `FIRMWARE_ACCEPTANCE_IMAGE` to the existing accepted source on the local machine
and `FIRMWARE_ACCEPTANCE_WASM_DIR` to the local directory containing the three
production WASI assets. Then run:

```bash
FIRMWARE_ACCEPTANCE_SCENARIO=uefi-hii-ui npm run firmware:acceptance
```

`firmware-uefi-hii-ui-acceptance.test.mjs` discovers and parses the real source,
renders the actual menu actions and footer in jsdom, selects the existing destination
in the move dialog, stages/applies the queue and checks the full image. It verifies
the physical-copy and allocation report, captures only the explicit download in
memory, checks its complete size/hash and unchanged non-BIOS bytes, independently
reopens both Setup copies and verifies the Ref's new Form owner. Removing the
operation must invalidate download/details. No editor, queue, builder or codec is
mocked; only the download adapter and unavailable DOM layout APIs are substituted.
The selector uses fixed test geometry and width with automatic dropdown placement
disabled, because jsdom provides no browser layout. Its actual options, destination
validation and change handlers remain in use.
Assets are loaded locally and firmware bytes are neither written nor uploaded.

This test is intentionally outside routine CI because the accepted firmware is
private and absent from the repository. jsdom does not establish Firefox layout,
browser file-picker behavior, deployed asset loading or physical flash validation.
