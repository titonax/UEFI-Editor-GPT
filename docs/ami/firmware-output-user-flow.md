# AMI complete-image output workflow

The accepted AMI paths now connect editing, queue application, recompression,
complete-image verification, the space report and download. This workflow does
not expand source acceptance: see the exact supported paths in
[full-image reconstruction](full-image-reconstruction.md).

## Using the workflow

1. Open a complete firmware image and analyse its HII. Stage supported edits
   using the menu controls. The change queue retains the original source.
2. Open **Change queue**, review the selected operations and click **Apply
   selected**. A coherent queue is necessary, but does not prove packed-size fit.
3. Click **Check firmware output**. The complete builder validates provenance,
   merges edits in shared ancestors, recompresses, checks allocations and
   checksums, preserves unowned bytes and independently reopens the result.
   Failure shows its diagnostic and keeps download disabled.
4. After success, use **Output details** to inspect the verified packed sizes,
   section capacity, affected source allocations and preserved non-BIOS bytes.
   Capacity belongs to the listed section, not to the firmware as a whole.
5. Click **Modified firmware image** to download the exact verified image and
   `changelog.txt`. This click does not repeat the build. Complete SPI input
   produces complete SPI output; BIOS-only input remains BIOS-only.

Changing the queue or opened source invalidates the previous result. Apply and
check the current selection again. A late completion from an older check cannot
unlock download for the current state.

## Integration evidence

`src/components/Footer/Footer.test.tsx` exercises the real Footer, selectable
queue controller, provenance assessment and report through rendered buttons.
It stages the existing form-wide suppression action, applies it through the
queue dialog and then checks the output. Only the builder and download adapter
are mocked, so these are **synthetic UI integration tests**, not real-firmware
or browser deployment acceptance.

The regressions cover:

- No output check before queue application; no download while checking.
- No automatic download after verification; explicit download contains the
  exact returned image bytes, filename and change log without a second build.
- Allocation failure keeps both download and report disabled, with retry.
- Removing the applied operation invalidates previously verified output.
- Replacing the source during a check prevents its late result from enabling
  download or the report.

Binary acceptance is separate. The existing
[real combined Tiano queue](tiano-combined-queue-acceptance.md) runs the actual
builder and WASI codecs, independently rereads the complete SPI, verifies the
requested edits and source boundaries, and rejects an oversized combination.
Its space-report assertions independently derive packed sizes from rebuilt
section headers. Exact LZMA acceptance remains HII-only. EFI, mixed compressed
ancestors and further source/layout classes remain blocked until their own
acceptance gates pass. Reopening is not a physical flashing test.
