# Nested-volume LZMA SetupData and combined-queue acceptance

This extends the [nested-volume HII acceptance](nested-lzma-spi-output-acceptance.md)
for the exact 4 MiB SPI source with SHA-256
`cd22f87daee0d50bf82520aaa6669a6731bdaaf3692690649533790c8e027f9a`.
No new catalogue case, firmware bytes, decoded modules or identifying NVRAM are
committed.

## Shared ownership and operations

The source BIOS region is `[1572864, 4194304)`. One outer FFS allocation
`[1704008, 3198149)` contains a LZMA-compressed stream with a nested firmware
volume. Setup HII and the coherent AMITSE/SetupData companion have separate inner
FFS allocations but share that outer decoded stream.

SetupData is `[333240, 463124)` inside an uncompressed 463,144-byte stream from the
companion FFS `[2712276, 3175453)` in the decoded volume. The accepted access edit
changes the `System Language` question (`0x1`) at SetupData offset `0x29EC` from
`01` to `00`. Its requested SetupData replacement differs by exactly that byte;
AMITSE and the rest of the companion's decoded stream remain unchanged.

Two real scenarios use the ordinary semantic change queue and normal AMI output
builder:

1. SetupData access edit alone: the Setup HII stays byte-identical.
2. SetupData access edit combined with the existing constant-true `SuppressIf`
   edit at HII offset `0x2B15A`: the suppression scope becomes empty while the
   access edit is retained.

Both queues are checked for applicability without mutating their base state.
A restore-access operation without its preceding access change is rejected as
stale logical state. A stale session hash is rejected before encoding.

## Reconstruction and independent verification

Bottom-up reconstruction replaces each edited child, repairs the corresponding
inner FFS checksum, recompresses the common outer volume once and repairs the
outer FFS checksum. The report contains one compressed section even for the
combined two-artifact queue.

| Scenario        | Output SHA-256                                                     | Packed LZMA bytes | Verified remaining bytes | Changed SPI bytes |
| --------------- | ------------------------------------------------------------------ | ----------------: | -----------------------: | ----------------: |
| SetupData only  | `608b856032c975aac208c5912464ca3f83243a3425308225d796ee85115f2194` |         1,493,534 |                      574 |           850,465 |
| HII + SetupData | `8d1ce0151c08d4937e2c5f4fd0309f95219d98f1190eee94a3e96a293cd71d28` |         1,493,479 |                      629 |           850,450 |

Original packed size and verified capacity are 1,494,108 bytes. The available
remainder is validated terminal padding inside the existing outer FFS; no FFS
allocation grows or moves. Different compressed byte counts do not measure the
size of the logical edit.

Independent complete-image extraction through the Pages WASI readers verifies
exact HII/SetupData replacements, unchanged AMITSE, all bytes in each edited
child stream, and fresh IFR/question interpretation. Both images retain 68
forms and valid balanced IFR packages. Decoded-volume changes stay inside the
edited inner FFS allocations; source-image changes stay inside the single outer
FFS and BIOS region. All 1,572,864 bytes outside BIOS, source/decoded inputs,
region boundaries and total 4,194,304-byte image size remain unchanged. Inner
and outer FFS checksums are independently checked.

## Scope and reproduction

The source-specific gate now admits Setup HII and SetupData, separately or
together, on this exact source hash and size. AMITSE and root-vector edits remain
blocked. The original 16 MiB LZMA acceptance remains HII-only. EFI, mixed
compressed ancestors, unrelated sources, allocation growth and relocation are
not accepted. Re-open evidence does not establish physical flash validation.

Synthetic CI checks the exact source/size and artifact scope. The explicit
local test exercises both real scenarios without writing firmware to disk:

```bash
FIRMWARE_ACCEPTANCE_IMAGE=/path/to/source.bin \
FIRMWARE_ACCEPTANCE_WASM_DIR=/path/to/pages-wasm-assets \
FIRMWARE_ACCEPTANCE_SCENARIO=nested-lzma-setupdata npm run firmware:acceptance
```

The earlier HII-only scenario remains available with
`FIRMWARE_ACCEPTANCE_SCENARIO=nested-lzma`.
