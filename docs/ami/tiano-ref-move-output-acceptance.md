# Real Ref move through Tiano SPI reconstruction

This exercises the already enabled Setup HII path on the same exact source as
[Tiano SPI acceptance](tiano-spi-output-acceptance.md): the existing
`BIOS2/asus p8h61-i-lx r2.0-rm-si.BIN` member of `BIOS2(1).zip`, 8 MiB, SHA-256
`297390ca838c455791a5bf3a3f0001fbf36a8cb31be362ea2123b8df84dfffe8`.
No firmware, decoded bytes or new catalogue cases are committed. This adds
real movement evidence; it does not expand source or compression acceptance.

## Exact movement

The normal destination analysis classifies the following move as
`safe-same-package`. The normal `moveMenuReference` operation records the edit,
remaps affected IFR offsets and updates incoming references before the normal
patch and complete-image builders run.

| Property                             | Value                                  |
| ------------------------------------ | -------------------------------------- |
| Reference                            | DRAM Timing Control                    |
| Target FormId                        | `0x4A9`                                |
| Source Form                          | Ai Tweaker, `0x405`                    |
| Destination Form                     | CPU Power Management, `0x4CD`          |
| Source and destination FormSet       | `08C0EEFB-0A0B-4D5F-8E52-2970881A7137` |
| Original Ref span                    | `[0x9719A, 0x971A9)`                   |
| Original destination insertion point | `0x98798`                              |
| Reopened Ref offset                  | `0x98789`                              |

The 15-byte Ref moves without growing the HII stream or rewriting its target.
The complete output SHA-256 is
`b1d6224b3ff47692e56ee5c42e7e9055c2154fccfcb3b79ac9fe713df745705f`.
All 12,295 changed bytes are inside the original Setup FFS allocation
`[4612464, 4781106)`. Every outside byte, AMITSE and SetupData remain identical;
Descriptor and ME are untouched. Output remains a complete same-layout 8 MiB SPI,
and the original source remains unchanged.

## Independent verification and rejection evidence

A separate full-image extraction regenerates IFR with WASI. The reopened HII
matches the entire requested patch. Binary IFR analysis finds exactly one copy
of the moved Ref, directly parented by destination Form `0x4CD` in the same
FormSet and still targeting `0x4A9`. All seven Forms Packages remain valid.
The normal text parser independently confirms the Ref is absent from Ai Tweaker
and appears once in CPU Power Management, with all 70 forms retained.

The explicit real test also rejects:

- moving the Ref into its own target Form, which would create a cycle;
- moving this implicit Ref into another FormSet without an explicit FormSetGuid;
- replaying the movement with altered expected source bytes.

Rejected operations preserve the editor state or source image as appropriate.
The test checks the specific rejection reasons, source identity and unchanged
outside bytes. It writes no firmware and emits metadata only.

## Reproduce locally

```bash
FIRMWARE_ACCEPTANCE_IMAGE=/path/to/p8h61.bin \
FIRMWARE_ACCEPTANCE_WASM_DIR=/path/to/wasm-assets \
FIRMWARE_ACCEPTANCE_SCENARIO=refmove \
npm run firmware:acceptance
```

The assets directory requires `firmware-decompress.wasm`,
`tiano-decompress.wasm` and `ifrextractor.wasm`. Existing `hii` and `setupdata`
scenarios remain available. This proves one real same-package move and complete
reconstruction/reread. It does not prove cross-package moves on this image,
code-backed root visibility, EFI acceptance or physical flash behavior.
