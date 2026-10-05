# First real Tiano-compressed SPI output acceptance

## Source identity and bounded route

The input is the existing user-supplied `BIOS2/asus p8h61-i-lx r2.0-rm-si.BIN`
member of `BIOS2(1).zip`. Its supplied name is a label, not a detector rule.
The 8 MiB source SHA-256 is
`297390ca838c455791a5bf3a3f0001fbf36a8cb31be362ea2123b8df84dfffe8`.
No firmware or decoded bytes, NVRAM identifiers or new catalogue cases are committed.

The actual Intel descriptor declares these ranges:

| Region     |     Start | End (exclusive) |
| ---------- | --------: | --------------: |
| Descriptor |         0 |           4,096 |
| ME         |     4,096 |       1,572,864 |
| BIOS       | 1,572,864 |       8,388,608 |

The AMI extractor selects one coherent Setup context with seven Forms Packages,
70 forms and 636 conditions. Setup HII is in a standard-compressed section owned
by the Setup FFS at `[4612464, 4781106)`. Its decoded buffer is 808,196 bytes.
The original packed stream independently decodes with the Tiano variant to the
exact retained decoded buffer. AMITSE and SetupData have a separate owning FFS.

## Reproduced result

The normal parser and patch builder disable the constant-true `SuppressIf` at
`0x8B359`. The normal complete-image builder then selects the source compression
variant, recompresses, verifies the packed round trip, repairs the section/FFS
fields and independently re-extracts the requested edit.

The output remains a complete 8 MiB SPI image. The output SHA-256 is
`cdc7a005905574a826460342389e53216e6c50979816271e2a0d0e2de1b6ae40`.
The 19,100 changed bytes all lie inside the original Setup FFS; Descriptor, ME,
AMITSE, SetupData and every byte outside that FFS are unchanged. The seven HII
Forms Packages reopen and the extracted HII matches the complete requested patch.
The source is unchanged. This is reconstruction/re-open evidence, not a physical
flash test.

Acceptance enables Setup HII edits only for the exact source hash and size.
Other standard-compressed images, mixed LZMA/Tiano ancestors, AMITSE/SetupData
edits and growth outside the proven FFS allocation remain blocked. The EFI
compression variant is still awaiting its own real-image acceptance.

## Reproduce locally

Use the same Pages WASI assets as the deployed application:

```bash
FIRMWARE_ACCEPTANCE_IMAGE=/path/to/p8h61.bin \
FIRMWARE_ACCEPTANCE_WASM_DIR=/path/to/wasm-assets \
npm run firmware:acceptance
```

The image can have any local filename; the exact hash and size are required.
The assets directory must contain `firmware-decompress.wasm`,
`tiano-decompress.wasm` and `ifrextractor.wasm`. The explicit acceptance test is
separate from synthetic CI because the firmware is not committed. It regenerates
IFR using WASI, checks the Tiano source variant, complete SPI boundaries, untouched
companion artifacts and source, exact output hash and every outside byte. It writes
no firmware and prints metadata only.
