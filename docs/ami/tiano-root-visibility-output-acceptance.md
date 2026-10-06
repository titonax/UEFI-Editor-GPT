# Real root visibility through complete Tiano SPI output

## Exact source and mechanism

The source is the same existing 8 MiB Intel SPI image documented in
[Tiano SPI acceptance](tiano-spi-output-acceptance.md):
`BIOS2/asus p8h61-i-lx r2.0-rm-si.BIN` from `BIOS2(1).zip`, SHA-256
`297390ca838c455791a5bf3a3f0001fbf36a8cb31be362ea2123b8df84dfffe8`.
No firmware, decoded bytes, NVRAM identifiers or new catalogue cases are committed.
Root output has separate exact-source acceptance; HII acceptance alone cannot
enable it.

The normal code-corroborated detector finds a seven-byte vector at decoded Setup
offset 92,076, referenced by Setup code at offset 2,340 with page table at
92,588. The proven loop count is seven. Every original root is enabled.

The normal desired-state operation hides `Tool`, root index 5, FormId `0x40A`,
FormSet `1EAB0EDF-8F2E-4D67-B6E1-15A89E2257B5`, by changing its byte at offset
92,081 from `01` to `00`. This byte is outside the HII payload and belongs to
the same retained decoded Setup buffer and owning FFS.

## Reconstruction and independent reread

Before building, the application recreates the source model from the immutable
session artifacts, ignoring imported root analysis. It validates the pending
plan against that fresh vector, expected bytes, decoded-buffer identity and
FormSet identity. At least one root must stay enabled. The generic builder
applies only the bounded fixed-size byte patch, rebuilds enclosing sections,
verifies the Tiano packed round trip and repairs FFS fields/checksums.

The complete output SHA-256 is
`88f522a7878449df6710bb09a8496fa376629f2a93a730bd6ec5e10ae796fe66`.
All 128,320 changed packed-image bytes remain inside the original Setup FFS
`[4612464, 4781106)`. Output retains the complete 8 MiB SPI layout. Every byte
outside that allocation remains identical, including Descriptor and ME.

A separate full-image extraction regenerates IFR with WASI. The entire decoded
Setup buffer differs at exactly one offset: 92,081. HII, AMITSE and SetupData
remain byte-identical. All seven Forms Packages and 70 forms remain present.
The root detector independently reopens with values `1111101`, preserving every
other entry and the Tool FormSet identity. The normal complete-image builder
also verifies both changed and unchanged artifact bytes and the full root vector
before returning the download. Source bytes remain immutable.

## Rejection evidence and scope

The real scenario rejects a stale expected root byte and a plan disabling every
root. Synthetic regressions also reject mismatched offsets, buffer identities,
FormSets, duplicate roots, non-Boolean values, unowned or resizing decoded
patches, overlapping edits and changed unedited companions. The immutable
source stays unchanged when reconstruction fails.

The queued plan is still reversible before export. Complete root output is
limited to this exact source and remains subject to allocation fit and reread.
Extracted-file export rejects root plans. EFI, mixed compressed paths and root
output on other images remain blocked. This proves reconstruction and reread;
this image has not been physically flashed as part of this acceptance.

## Reproduce locally

```bash
FIRMWARE_ACCEPTANCE_IMAGE=/path/to/p8h61.bin \
FIRMWARE_ACCEPTANCE_WASM_DIR=/path/to/wasm-assets \
FIRMWARE_ACCEPTANCE_SCENARIO=rootvisibility \
npm run firmware:acceptance
```

Use `firmware-decompress.wasm`, `tiano-decompress.wasm` and `ifrextractor.wasm`
from the deployed application. The explicit test writes no firmware and prints
metadata only. It checks the exact output hash, single decoded-byte change,
complete root vector, untouched artifacts/regions and the real rejection cases.
Existing `hii`, `setupdata` and `refmove` scenarios remain available.
