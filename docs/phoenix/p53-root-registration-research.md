# P53 browser-code research

This read-only investigation narrows the runtime-root gate after the
[structural FormSet inventory](uefi-hii-root-evidence.md). It does not enable
root registration, visibility edits or a new output path.

## Source and scope

The authorized complete SPI source has SHA-256
`68eba5b369baf36c879551c0482a6feea31d68082bc4dd0631bf9e4427a88a64`
and size 33,554,432 bytes. The actual recursive decoder and FFS inventory locate
four drivers in canonical decoded buffer 2. Byte-identical decoded buffers are
not counted again; this is not verification of every physical mirror.

| Driver                        | FFS GUID                             | Decoded FFS start | Immutable body SHA-256                                           |
| ----------------------------- | ------------------------------------ | ----------------: | ---------------------------------------------------------------- |
| Setup                         | E6A7A1CE-5881-4B49-80BE-69C91811685C |           4127440 | ab33e9ec1409969044823332c00fe887bef511d287baef6e2b6d0ad56f336ee5 |
| SystemBiosSetupDxe            | 721C8B66-426C-4E86-8E99-3457C46AB0B9 |          10358144 | 3c557e13c2118156846abaadca7aee3c522f5a707cbf4142dea2aff849ad16ed |
| SystemFormBrowserMetroViewDxe | C7351A96-9215-4026-BCBD-12D6E7DB36E9 |          10955040 | b35c1cfec18d5382ec5700dd86f26d183032b2f5c3acce36b4e50b969c67a510 |
| LenovoSetupMainDxe            | 37AFCF55-2E8C-4722-B950-B48B9165C56B |          12029256 | 8736e06c6d8006e5c7249ba456ece49304139e6749162925ab5e73b59432033b |

All body offsets below are relative to the owning decoded FFS body. RVAs are
PE virtual addresses relative to the image base, not body offsets or outer SPI
addresses. The two coordinate systems must not be interchanged.

## Metro lookup

The Metro driver contains seven contiguous records at body offset 267716,
stride 24. Each begins with a 16-byte GUID followed by four 16-bit fields.

| Index | FormSet GUID                         | Body offset | Fields at +16, +18, +20, +22 |
| ----: | ------------------------------------ | ----------: | ---------------------------- |
|     0 | 1247C8E8-307C-4C6B-8812-CA054F9963F8 |      267716 | 14, 15, 15, 0                |
|     1 | 3E59F6A2-AA28-42F4-BCC0-AEDFE88106AD |      267740 | 16, 17, 17, 0                |
|     2 | 3DC1FE64-37B5-4BF6-9BCF-4F0689299E53 |      267764 | 18, 19, 19, 0                |
|     3 | 7FE80B2D-FEE9-4671-A0F4-F7C7C7D59EF4 |      267788 | 20, 21, 21, 0                |
|     4 | 9C796776-68F7-4A45-A57D-B9E1CE61197E |      267812 | 22, 23, 23, 0                |
|     5 | A7F26116-CFDC-4296-8224-ED7D140170C7 |      267836 | 24, 25, 25, 0                |
|     6 | 821D8B77-246D-4E96-8E10-3467D56AB1BA |      267860 | 16, 17, 17, 0                |

The RIP-relative LEA candidate at body offset 19224 maps to RVA 19076.
Local Capstone decoding corroborates a seven-entry loop, a 24-byte index stride,
comparison of both GUID halves, and selector-dependent 16-bit reads at +16,
+18 and +20. The meanings of those fields and the fourth zero field are still
unresolved. Presentation metadata is a working hypothesis; this is not evidence
of a 0/1 visibility vector or a list of all registered roots. Changing the zero
field as if it were a visibility flag has no justification.

## Browser invocation lead

SystemBiosSetupDxe contains the FormBrowser2 protocol GUID at body offset 14836.
Its RIP-relative LEA candidate is at body offset 4557 (RVA 4553). The bounded
local decode starts there and observes an indirect call at interface offset
0x140, a call to the routine at RVA 2844 (`0xB1C`), and later a first-slot
indirect call at RVA 4824 (`0x12D8`). The latter sequence supplies a handle-array
pointer and count from data, clears R9 and supplies the Form Id from SI; that register's origin is not resolved in this bounded window.

This is compatible with a LocateProtocol/SendForm path. It is an inference from
instruction and ABI shape: the full origin of the interface pointer, complete
handle-list dataflow, upstream control flow and runtime conditions have not
been proven. No root is classified as registered or runtime-visible by this
sequence. The next trace should follow the routine at RVA 2844 and prove where
the array and count used by the candidate SendForm call come from.

The standard interfaces distinguish adding HII packages to the database from
asking the browser to display a selected handle array. Primary definitions used
for landmarks and method layout are:

- [EDK II FormBrowser2](https://github.com/tianocore/edk2/blob/master/MdePkg/Include/Protocol/FormBrowser2.h)
- [EDK II HiiDatabase](https://github.com/tianocore/edk2/blob/master/MdePkg/Include/Protocol/HiiDatabase.h)
- [EDK II HiiConfigAccess](https://github.com/tianocore/edk2/blob/master/MdePkg/Include/Protocol/HiiConfigAccess.h)

A protocol GUID occurrence alone proves neither publication nor invocation.
Setup and LenovoSetupMainDxe also contain database, browser and config-access
landmarks; their individual occurrences remain separate from registration proof.

## Reproduction and limits

Run the opt-in local scenario with the authorized source and existing WASM assets:

```bash
FIRMWARE_ACCEPTANCE_SCENARIO=hii-registration \
FIRMWARE_ACCEPTANCE_IMAGE='<authorized local SPI>' \
FIRMWARE_ACCEPTANCE_WASM_DIR='<local WASM directory>' \
npm run firmware:acceptance
```

The scenario asserts source identity, four exact FFS identities, bounded PE
ownership, the seven records and selector reads, and the candidate call shapes.
It checks immutable body/source hashes before and after analysis and prints
metadata only. It does not save decoded firmware, execute firmware or rebuild
an image. Private source firmware is not supplied to CI.

`peGuidEvidence.ts` is a read-only research utility, not connected to frontend
capability decisions. It accepts bounded x64 PE32+ raw sections, excludes header
bytes and cross-section GUIDs, rejects overlapping raw/RVA mappings, and finds
only exact seven-byte RIP-relative LEA patterns. Such byte patterns do not prove
instruction boundaries or CFG reachability. Local Capstone windows add decode
corroboration but do not turn them into executed paths. TE, IA32, other addressing
modes, relocated absolute references, virtual-only sections and runtime-created
packages are outside this probe; absence of a hit is not absence of registration.

Synthetic CI tests cover endian GUIDs, source immutability, RVA/raw distinction,
signed displacements, enclosing buffers, malformed headers/allocation/overlaps,
invalid external mapping claims, incomplete fields and non-executable/truncated
LEAs. The exact P53 read-only scenario passed locally; it is separate from the
previous complete-SPI editing acceptance. This change alters no editor control,
writer, checksum or reconstruction allowance. Runtime root edits and physical
flash claims remain blocked.
