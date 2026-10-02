# eMachines EL1200 R01A2 Award Legacy intake

`R01A2(1).BIN` is a 1,048,576-byte Award Legacy image, not an AMI Aptio or
UEFI image.

| Property        | Observed value                                                     |
| --------------- | ------------------------------------------------------------------ |
| SHA-256         | `d7ec1c70607c9186fbdd9d30e657b32e139fee2cf144c2f59b36fb48bec42c71` |
| Boot block      | `Award BootBlock BIOS v1.0` at `0xFE000`                           |
| Decompressor    | `= Award Decompression Bios =` at `0xEEA50`                        |
| Reset vector    | x86 far jump at `0xFFFF0`                                          |
| Board ID        | `6A61K00C`                                                         |
| Modular payload | 23 checksum-valid level-1 LHA members using `-lh5-`                |
| UEFI/HII/IFR    | no PI firmware volume; 0 HII packages; 0 IFR forms                 |

The bounded module inventory includes `R01A2.BIN`, `awardext.rom`,
`ACPITBL.BIN`, `AwardBmp.bmp`, `awardeyt.rom`, `_EN_CODE.BIN`, `_ITEM.BIN`,
`_DMI.BIN`, `SPIFLASH.BIN`, `NVRAID.ROM`, `NVPXES.NIC`, `M61A1_S.BIN`,
`M61VGA2.ROM`, `BSMICODE.ROM`, `SMI32COD.BIN`, `SMIAPCOD.BIN`,
`AGESACPU.ROM`, `MEMINIT.BIN`, `HT.DLL`, `HT32GATE.BIN`, `eM.BMP`, `eM_S4.BMP`
and `SLP20.bin`.

Recognition requires four independent structures: the final boot-block banner,
the earlier decompression-core banner, a far-jump reset vector targeting the
top segment and at least two size-bounded LHA headers whose header checksum is
valid. A loose vendor string or an unbounded `-lh5-` sequence is insufficient.

The browser may identify the family and inspect module offsets, compressed
sizes and expanded sizes. It must not start the AMI HII path. Module editing
and full-image reconstruction remain blocked until an Award-specific pipeline
proves decompression, replacement, checksums and fixed-size output.
