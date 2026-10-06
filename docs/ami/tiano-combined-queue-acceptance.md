# Real combined change queue through complete Tiano SPI output

This uses the same exact source as [Tiano SPI acceptance](tiano-spi-output-acceptance.md):
`BIOS2/asus p8h61-i-lx r2.0-rm-si.BIN` from `BIOS2(1).zip`, 8 MiB, SHA-256
`297390ca838c455791a5bf3a3f0001fbf36a8cb31be362ea2123b8df84dfffe8`.
The test adds evidence for the existing queue and reconstruction path, without
expanding accepted sources, compression classes or catalogue cases. No firmware,
decoded bytes or identifying NVRAM are committed.

## One applied queue, four edits

The real test creates each operation with the same `createDataChangeEntry`
function as the normal editor. It projects the four entries from the original
base with `projectDataChangeQueue`, verifies that the result is coherent and
passes that projected state to the normal complete-image builder.

| Order | Requested edit                                                                                                 |
| ----: | -------------------------------------------------------------------------------------------------------------- |
|     1 | Move DRAM Timing Control from Ai Tweaker (`0x405`) to CPU Power Management (`0x4CD`), retaining target `0x4A9` |
|     2 | Disable the constant-true HII `SuppressIf` at `0x8B359`                                                        |
|     3 | Change Security, QuestionId `0x4`, SetupData Access Level `01` → `00` at `0x2F7C`                              |
|     4 | Hide Boot, root index 4, by changing decoded Setup offset 92,080 from `01` → `00`                              |

Movement and suppression share the HII payload; the root-vector edit shares its
decoded Setup ancestor outside that payload. SetupData is in another compressed
FFS and shares its decoded ancestor with untouched AMITSE. The builder must
retain all four requested edits while rebuilding both branches.

## Reproduced output

The exact output SHA-256 is
`264f90a0934848916bdc3e123564ce5c67c068faa6c48ee03e756f7c21f3aaae`.
All 140,913 changed bytes remain within these original FFS allocations:

| Owning branch             |     Start | End (exclusive) |
| ------------------------- | --------: | --------------: |
| Setup HII and root vector | 4,612,464 |       4,781,106 |
| SetupData                 | 3,239,384 |       3,419,918 |

Independent full-image extraction regenerates IFR with WASI. Both complete
reopened decoded buffers match their expected merged patches. The extracted HII
and SetupData match the complete requested artifacts; AMITSE is byte-identical.
All seven Forms Packages remain valid and all 70 forms remain present. The normal
parser confirms the Ref moved out of Ai Tweaker and appears exactly once in CPU
Power Management. Root detection reopens with vector `1111011`.

The output remains a complete same-layout 8 MiB SPI. Every byte outside the two
FFS allocations is identical, including Descriptor and ME. The original firmware
and original editor base remain unchanged throughout projection, successful
reconstruction and rejection.

## Real rejection evidence

Replacing only the final Boot operation with hiding Tool (root index 5) produces
a coherent logical queue but recompression exceeds the existing FFS allocation.
The normal builder rejects it with
`Compressed section cannot grow beyond its FFS allocation.` This combination
cannot be inferred to fit merely because each operation has passed separately.
Logical queue coherence and compressed allocation fit are separate checks.

A restore-Boot operation recorded after hiding Boot also becomes incoherent when
its required earlier hide operation is removed. The real projection rejects
that selection with `stale-logical-state` before reconstruction.

These are bounded reconstruction/reopen results, not physical flash validation.
Other images, EFI and mixed compressed paths remain subject to their existing
acceptance gates.

## Reproduce locally

```bash
FIRMWARE_ACCEPTANCE_IMAGE=/path/to/p8h61.bin \
FIRMWARE_ACCEPTANCE_WASM_DIR=/path/to/wasm-assets \
FIRMWARE_ACCEPTANCE_SCENARIO=queue \
npm run firmware:acceptance
```

Use the deployed `firmware-decompress.wasm`, `tiano-decompress.wasm` and
`ifrextractor.wasm`. The explicit scenario writes no firmware and prints
metadata and queue titles only. The existing `hii`, `setupdata`, `refmove` and
`rootvisibility` scenarios remain available through the same command.
