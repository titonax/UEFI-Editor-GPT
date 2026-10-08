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
   output. **Modified HII modules** is a separate extracted-module export.

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

The current automated frontend evidence is synthetic; the separate real P53
acceptance exercises the actual codecs and full-image engine. This manual Firefox
flow remains a deployment check.
