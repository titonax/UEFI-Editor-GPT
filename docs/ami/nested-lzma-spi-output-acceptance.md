# Nested-volume LZMA full-SPI acceptance

This is reconstruction evidence for one previously analysed 4 MiB input, identified
only by SHA-256 `cd22f87daee0d50bf82520aaa6669a6731bdaaf3692690649533790c8e027f9a`.
No source firmware, decoded modules or identifying NVRAM are committed. This
extends output acceptance; it does not add a catalogue case or generalize a rule
from a board name.

## Proven path and edit

The complete Intel SPI has a BIOS region `[1572864, 4194304)`. The descriptor and
ME occupy the 1,572,864 bytes before that region and remain byte-identical.
The outer FFS allocation is `[1704008, 3198149)`. Its LZMA section starts at
1,704,032 and decodes a 5,238,824-byte stream containing a nested firmware volume.
Within that decoded stream, Setup owns FFS `[4769876, 5054465)` and its uncompressed
encapsulation produces a 284,532-byte stream. Setup HII occupies
`[51992, 284515)` in the latter stream. Companion AMITSE and SetupData remain
bound to the same coherent decoded-volume context.

The ordinary AMI patch builder disables the proven constant-true `SuppressIf`
at HII offset `0x2B15A`. Bottom-up reconstruction replaces HII, repairs the inner
Setup FFS checksum, encodes the enclosing LZMA stream and repairs the outer FFS
checksum. The source buffers and both FFS allocations remain fixed in size.

The original LZMA payload is 1,494,108 bytes; the rebuilt payload is 1,494,085
bytes. The 23-byte remainder is terminal padding validated against the enclosing
FFS and firmware-volume erase polarity. It is not free space in other files or
permission to grow an allocation.

## Independent full-image verification

The normal `buildAmiFirmwareImage` path succeeds. A second extraction through the
Pages WASI readers regenerates IFR text and verifies:

- Complete 4,194,304-byte Intel SPI output with unchanged region boundaries.
- Exact requested HII bytes and unchanged AMITSE and SetupData.
- 68 forms retained, balanced IFR packages and the patched suppression reduced
  to an empty scope on fresh binary IFR analysis.
- Changes in the decoded outer stream limited to the inner Setup FFS.
- Correct inner and outer FFS header/data checksums.
- 140,878 changed source-image bytes, all inside the outer owned FFS and BIOS.
- Immutable original source and decoded buffers; stale source-hash rejection.

The output SHA-256 is
`6920f3fed99e90f52c264c0a8b466293f934f652f1fe13d02485d889072d0c0b`.

## Scope and reproduction

Only compressed Setup HII output is enabled for this exact source hash and size.
SetupData, AMITSE and root-vector edits remain unaccepted. EFI/Tiano ancestors,
mixed compressed chains, other source hashes, FFS relocation and allocation
growth remain blocked. This is binary reconstruction and independent re-open
acceptance, not a physical flash test.

Synthetic CI verifies exact source/size gating, HII-only artifact scope, root
rejection, and blocked standard or incomplete ancestors. The real firmware test
is an explicit local opt-in and commits no firmware bytes:

```bash
FIRMWARE_ACCEPTANCE_IMAGE=/path/to/source.bin \
FIRMWARE_ACCEPTANCE_WASM_DIR=/path/to/pages-wasm-assets \
FIRMWARE_ACCEPTANCE_SCENARIO=nested-lzma npm run firmware:acceptance
```

The asset directory must contain the same `firmware-decompress.wasm`,
`tiano-decompress.wasm` and `ifrextractor.wasm` readers used by Pages.
