# Phoenix format investigation

PhoenixBIOS 4.0 modular ROMs and Phoenix-derived UEFI firmware require
different parsers. A shared vendor name does not make their Setup formats
interchangeable with AMI Aptio or with each other. Manufacturer branding and
filenames are treated as leads rather than family proof.

## PhoenixBIOS 4.0 Release 6.1: ACER-Z03-20140701.bin

The supplied 1 MiB image contains the PhoenixBIOS 4.0 Release 6.1 banner and
bounded `BCPSYS`, `BCPFFV` and `BCPCMP` records. `BCPSYS` reports build
`DEVEL97G`, date `09/14/07`. `BCPFFV` points to a `volumedir.bin2` module at
`0xC0008`; the directory has 12 entries and its FFV regions contain 34 named
modules. No UEFI PI firmware volume was found.

| Module         | ROM offset | Module bytes | Compressed section bytes | Decoded bytes |
| -------------- | ---------: | -----------: | -----------------------: | ------------: |
| `SETUP0.ROM`   |  `0x6327B` |       16,418 |                   16,382 |        38,792 |
| `TEMPLAT0.ROM` |  `0x6ED0C` |       13,148 |                   13,112 |        32,356 |
| `STRINGS0.ROM` |  `0x72068` |       11,476 |                   11,440 |        25,344 |

The compression algorithm in `BCPCMP` is `3` (LZINT); the three sections
decoded successfully as LH5 with the independent
[coreboot bios_extract Phoenix implementation](https://github.com/coreboot/bios_extract/blob/master/src/phoenix.c).
`SETUP0.ROM` contains 16-bit executable code. `TEMPLAT0.ROM` holds binary
menu structures, and `STRINGS0.ROM` begins with `STRPACK-BIOS`. Its text is
packed again inside the decoded module. These are observed data, not UEFI HII
Forms. The browser now validates the BCP/FFV directory and reports module
offsets, sizes, compression and key module presence without exporting a
modified ROM.

An earlier HP OmniBook/Pavilion PhoenixBIOS 4.0 Release 6.0 sample was
extracted with Phoenix BIOS Editor; its `ROM.SCR` named Setup, template,
strings and BIOS code modules. Its original image is not part of the present
four archives, so this read-only FFV parser is verified against the Acer
image only. Older Phoenix module chains are recognized structurally but
require a second real image before claiming coverage.

## Lenovo Flex 2 UEFI: mixed provider evidence

Three distinct 8 MiB dumps of one Lenovo Flex 2 platform contain bounded
UEFI firmware volumes and eleven PDB debug records under `Phoenix\\...`,
including a `Phoenix\\SecCore\\...\\SecCore.pdb` module. They also contain
`Insyde Software Corp.` in older copyright text. The classifier marks
Phoenix UEFI module provenance as **probable, conflicting** and records the
Insyde string independently. The origin of the Setup pages and an editable
HII context have not been verified. A Phoenix certificate or a Phoenix PDB
path inside an unrelated AMI module does not override independently verified
AMI Setup evidence.

## Next parser boundaries

1. Decode LZINT/LH5 with explicit expansion bounds; independently re-read
   the decoded Setup, template and STRPACK data.
2. Expand the verified menu graph with additional one-item submenu cases and
   callback-backed transitions. Compare each new structure against the original
   Phoenix BIOS Editor view before generalizing it.
3. For Phoenix-derived UEFI, locate HII packages by validated FFS/section
   ownership rather than assuming AMI Setup GUIDs. Prove menu roots and
   variable stores before offering an edit plan.
4. Only enable ROM writing after same-size module replacement, directory and
   checksum repair, and independent full-image re-extraction are verified.

The local corpus exports these observations in JSON schema `0.5.0` and CSV;
neither format contains BIOS or decompressed module bytes.
