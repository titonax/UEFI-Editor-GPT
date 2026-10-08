# Nested-volume LZMA root and structural queue acceptance

This extends the existing [HII](nested-lzma-spi-output-acceptance.md) and
[SetupData](nested-lzma-setupdata-output-acceptance.md) reconstruction evidence for
the exact 4 MiB SPI source with SHA-256
`cd22f87daee0d50bf82520aaa6669a6731bdaaf3692690649533790c8e027f9a`.
No catalogue case, source firmware, decoded modules or identifying NVRAM are
committed.

## Structural move and root evidence

A fixed-size 15-byte `Ref` to CPU Configuration (FormId `0x413`) moves from
Advanced (`0x403`) to the existing PCI Subsystem Settings form (`0x40A`) within
FormSet `E14F04FA-8706-4353-92F2-9C2424746F9F`. Its original interval is
`[0x2B0BD, 0x2B0CC)` and the destination insertion boundary is `0x2B4AA`.
Independent binary/text reread places the selected unchanged reference at
`0x2B49B` in its new owner. Other references to the same destination remain
separate: fresh source/destination counts must respectively decrease/increase
by one, and the selected opcode must have exactly one proven binary owner. The Forms Package and overall HII
lengths remain fixed. The move shifts the subsequent suppression at `0x2B15A`
back by 15 bytes; its requested scope edit is verified at the remapped location.

The source's AMI root report identifies a unique code-corroborated eight-entry
vector starting at decoded Setup buffer offset 44,132. Chipset is root index 4,
FormId `0x405`, FormSet `ADFE34C8-9AE1-4F8F-BE13-CF96A2CB2C5B`. Its byte at
44,136 is initially zero. The accepted root operation changes that byte to one.
It lies outside the HII artifact payload but inside its owned decoded Setup
stream; the builder freshly derives the vector from the opened source before
planning the patch. Root evidence is separate from HII artifact acceptance.

## Complete real queue

The normal semantic queue and AMI full-image builder are exercised with:

1. The Ref move alone.
2. A four-operation queue: Ref move, empty the proven constant-true suppression
   scope at its remapped offset, change the System Language SetupData access
   byte at `0x29EC` from `01` to `00`, and show the Chipset root.

All four operations preserve the immutable queue base. HII, the root byte and
SetupData are rebuilt through their exact provenance paths. Inner FFS checksums
are repaired before one common outer-volume LZMA recompression. The root byte
and HII replacement do not overlap.

| Scenario        | Output SHA-256                                                     | Packed LZMA bytes | Verified remaining bytes | Changed SPI bytes |
| --------------- | ------------------------------------------------------------------ | ----------------: | -----------------------: | ----------------: |
| Ref move        | `354ca2cef157221679ce55783ff4370e4a9cdd6968415c6b0abf639c0b4514e0` |         1,494,099 |                        9 |           140,925 |
| Four operations | `014af11ec7d614471d873974b83b90c1ae5583adb51beeeda68d3c6940bd64e6` |         1,493,440 |                      668 |           850,394 |

The original packed size and capacity are 1,494,108 bytes. Both complete outputs
remain 4,194,304-byte Intel SPI images. All 1,572,864 bytes outside BIOS remain
unchanged. Source changes stay within outer FFS `[1704008, 3198149)` and decoded
volume changes stay within the edited inner FFS allocations. Independent Pages
WASI extraction verifies exact requested child streams, unchanged AMITSE, valid
inner/outer FFS checksums, eight valid Forms Packages, 68 forms, the Ref's new
binary/text owner and the desired eight-entry root vector.

## Negative gates and limitations

The real test rejects a move creating a navigation cycle, an implicit Ref
crossing FormSets, corrupted expected move bytes, a stale root expected value,
disabling every root and an access restoration without its prior queue change.
It deliberately corrupts cached vector metadata before the successful build;
fresh source evidence is required and the correct result still reopens.

**Showing Chipset alone does not fit this source's compressed allocation.** The
normal builder rejects it with `Compressed section cannot grow beyond its FFS
allocation.` The combined queue fits because compression depends on the full
edited decoded stream. Acceptance never promises that every coherent edit
combination fits, changes allocations, or treats one successful combination's
margin as reusable free space.

Root output is admitted only for this exact source hash and size, subject to
fresh code evidence, expected bytes, fit and re-open checks. AMITSE editing,
other source hashes, EFI/mixed compression, allocation relocation/growth and
capsule output remain unsupported. This is binary reconstruction evidence, not
physical flash validation.

## Reproduction

Run the explicit local acceptance with the same Pages WASI assets:

```bash
FIRMWARE_ACCEPTANCE_IMAGE=/path/to/source.bin \
FIRMWARE_ACCEPTANCE_WASM_DIR=/path/to/pages-wasm-assets \
FIRMWARE_ACCEPTANCE_SCENARIO=nested-lzma-queue npm run firmware:acceptance
```

The previous HII and HII/SetupData scenarios remain available as `nested-lzma`
and `nested-lzma-setupdata`. Synthetic CI checks exact root source/size gating
and continued rejection of AMITSE edits and the earlier unaccepted LZMA source.
