# Real Tiano SetupData and HII combined output acceptance

The source is the same existing 8 MiB Intel SPI image recorded in
[Tiano SPI acceptance](tiano-spi-output-acceptance.md):
`BIOS2/asus p8h61-i-lx r2.0-rm-si.BIN` from `BIOS2(1).zip`, SHA-256
`297390ca838c455791a5bf3a3f0001fbf36a8cb31be362ea2123b8df84dfffe8`.
Acceptance uses the exact hash and size, independent of its filename. No firmware,
decoded bytes, NVRAM identifiers or catalogue additions are committed.

## Combined edit and independent reread

The normal parser and patch builder disable `SuppressIf` at `0x8B359` and change
SetupData Access Level for `Security`, QuestionId `0x4`, from `01` to `00` at
SetupData offset `0x2F7C`. The normal full-image builder recompresses both owning
sections, verifies their packed round trips and repairs the affected FFS fields.
A separate extraction of the complete output regenerates IFR with WASI.

The reopened HII and SetupData match their entire requested patches. AMITSE is
byte-identical despite sharing the SetupData decoded ancestor. All seven Forms
Packages reopen; the parser retains 70 forms and 636 conditions. The output SHA-256 is
`e735ad0281a9e34fb139b69bbb3a675c1daca93fbb6178e2a2537cf0e55b96f9`.

All 49,958 changed bytes are contained in these original owning FFS allocations:

| Edited artifact | FFS start | End (exclusive) |
| --------------- | --------: | --------------: |
| Setup HII       | 4,612,464 |       4,781,106 |
| SetupData       | 3,239,384 |       3,419,918 |

Every byte outside their union remains identical, including Descriptor and ME.
The complete SPI layout and 8 MiB size remain unchanged, and the original input
remains immutable. This establishes reconstruction and reread, not physical
flash behavior or a code-backed visibility override.

## Rejection evidence and scope

A separate edit from the original parsed data disables the same HII condition
and changes Access Level for QuestionId `0x1` from `01` to `00`. Its recompressed
companion exceeds the original FFS allocation. The normal builder rejects it
with `Compressed section cannot grow beyond its FFS allocation.` and leaves the
source unchanged.

This evidence permits Setup HII and SetupData edits for this exact Tiano source.
Every requested edit still must fit its existing allocation and pass independent
reread. AMITSE edits, other sources, EFI and mixed compressed ancestors remain
blocked. The accepted LZMA source remains HII-only.

## Reproduce locally

```bash
FIRMWARE_ACCEPTANCE_IMAGE=/path/to/p8h61.bin \
FIRMWARE_ACCEPTANCE_WASM_DIR=/path/to/wasm-assets \
FIRMWARE_ACCEPTANCE_SCENARIO=setupdata \
npm run firmware:acceptance
```

The assets and source requirements are the same as the HII-only acceptance.
The explicit test verifies the exact output hash, both edited artifacts,
untouched AMITSE, every outside byte, SPI boundaries, immutable source and the
allocation-growth rejection. It writes no firmware and prints metadata only.
Omit `FIRMWARE_ACCEPTANCE_SCENARIO` to rerun the original HII-only scenario.
