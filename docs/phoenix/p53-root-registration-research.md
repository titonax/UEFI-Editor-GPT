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
pointer and count from data and clears R9. The extended window from routine
entry RVA 4516 observes ESI cleared at 4545: FormId is zero and
ScreenDimensions is null at the later stack argument stores.

This is compatible with a LocateProtocol/SendForm path. It is an inference from
instruction and ABI shape. The extended window links the LocateProtocol stack
output to the interface used by the first-slot call; upstream control flow,
lookup success and runtime conditions have not been proven. The array/count
globals are linked to the enumeration routine below; its database-interface output now has
a separate static initialization trace. No root is classified as
registered or runtime-visible by this sequence. The
[publication/consumer follow-up](p53-runtime-navigation-research.md) traces the
list interface and conditional Ref/package update while retaining the runtime
execution and exact mutation-target gates.

The standard interfaces distinguish adding HII packages to the database from
asking the browser to display a selected handle array. Primary definitions used
for landmarks and method layout are:

- [EDK II FormBrowser2](https://github.com/tianocore/edk2/blob/master/MdePkg/Include/Protocol/FormBrowser2.h)
- [EDK II System Table, Boot Services and entry ABI](https://github.com/tianocore/edk2/blob/master/MdePkg/Include/Uefi/UefiSpec.h)
- [EDK II HiiDatabase](https://github.com/tianocore/edk2/blob/master/MdePkg/Include/Protocol/HiiDatabase.h)
- [EDK II HII package types and IFR opcodes](https://github.com/tianocore/edk2/blob/master/MdePkg/Include/Uefi/UefiInternalFormRepresentation.h)
- [EDK II HiiConfigAccess](https://github.com/tianocore/edk2/blob/master/MdePkg/Include/Protocol/HiiConfigAccess.h)

A protocol GUID occurrence alone proves neither publication nor invocation.
Setup and LenovoSetupMainDxe also contain database, browser and config-access
landmarks; their individual occurrences remain separate from registration proof.

## Handle selection and re-enumeration

The local bounded decode now follows the routine at RVA 2844, its enumeration
helper at RVA 976 (`0x3D0`) and its package-inspection helper at RVA 1840
(`0x730`). These are static observations from the exact source above; the probe
never executes firmware or calls a firmware service.

| Landmark                     | Observed use                                                                                     | Evidence RVA           |
| ---------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------- |
| Global 17168 (`0x4310`)      | Handle-array allocation stored by enumeration; loaded into RDX before candidate SendForm         | 1084, 4792             |
| Global 17208 (`0x4338`)      | Returned buffer size shifted right by three and stored; loaded into R8 before candidate SendForm | 1144, 1148, 4781       |
| Global 17248 (`0x4360`)      | Interface used by both enumeration calls at slot +0x18                                           | 1041, 1053, 1118, 1133 |
| Temporary R15 array          | Selected source handles copied into eight-byte entries, with RSI as count                        | 2985, 3166, 3170       |
| Condition bytes 17153, 17154 | Separate GUID-presence accumulators; runtime mutation effects remain unresolved                  | 3573, 3933             |
| Refresh call                 | Clears the published array/count, then calls enumeration again on this branch                    | 4290, 4297, 4304       |

The enumeration helper supplies package type 2 and a null package-GUID filter to
both +0x18 calls, using a size query followed by allocation and a second call.
It compares the first status against `0x8000000000000005` and converts the second
returned byte count to an eight-byte handle count. This matches the EDK II
HiiDatabase `ListPackageLists` method layout and Forms package type. The static initialization chain below corroborates the database-interface
output argument. Successful protocol lookup and enumeration at runtime are
still not proven. The array/count address equality with
the later browser arguments is directly reproduced.

The selection routine walks the source handles, calls the inspection helper,
compares GUID halves against separate lists and conditionally appends handles to
a temporary array. That temporary array is not stored into the published array
global in this trace. One path clears the published globals and re-enumerates
before returning; therefore the temporary subset cannot be reported as the final
SendForm root list.

The inspection helper has two calls at interface slot +0x20, compatible with
`ExportPackageLists`, followed by a Forms package-type comparison, an IFR
FormSet opcode comparison (`0x0E`), a GUID copy beginning at opcode +2 and a Form
opcode comparison (`0x01`). This corroborates inspection of package/FormSet
metadata. It does not identify every declaration in a package as a displayed root.

Conditional code also contains an indirect +0x80 call and calls to routines that
build/update opcode-like data. The follow-up corroborates a Ref builder and an
HiiDatabase package update. Exact mutation targets and runtime effects remain
unresolved; these are mutation leads, not an editing recipe. Another refresh is
inside one such path. The final refresh status is not checked immediately at its
call site, and not every branch reaches that refresh. Static instruction matches
cannot establish successful enumeration, branch execution or runtime visibility.

The [follow-up](p53-runtime-navigation-research.md) traces publication, the
guarded consumer append and a conditional Ref/package-update path. Selection
re-entry and actual selected Ref destinations remain unresolved; the
follow-up now corroborates the target Form 1 and label anchors. Keep original HII
registration and actual on-machine visibility as separate gates.

## Database interface initialization

The PE entry point is RVA 768 (`0x300`). Its entry window preserves RDX while
calling the helper at RVA 796 (`0x31C`). Under the x64 EFI entry ABI, RDX holds
the System Table. The helper loads its BootServices field at +0x60 into R9 and
stores it in global RVA 17224 (`0x4348`). This is a static dataflow observation
corroborated by the EDK II System Table layout, not execution of the entry point.

At RVAs 852–875 the helper reloads that service global, supplies the address of
global 17248 as R8, clears RDX, supplies the actual HiiDatabase GUID at RVA 14768
as RCX, and calls service slot +0x140. This matches `LocateProtocol(Guid, NULL,
&Interface)` and links its output address to the interface used for enumeration
and package export. There is no immediate status branch after this particular
call in the bounded decode. Successful lookup, valid interface contents at
runtime and upstream browser invocation conditions remain open.

## GUID-dependent condition bytes

The two source bytes start at zero in a bounded raw-backed data section. In the
selection routine a 16-byte GUID-list scan reads their current values, compares
both halves of each GUID and conditionally replaces a value with one. A non-match
retains the previous value; this is an accumulation, not a reset at each entry.

| Source byte RVA  | Compared GUID RVA | Exact GUID                           | Write RVA |
| ---------------- | ----------------- | ------------------------------------ | --------- |
| 17153 (`0x4301`) | 14736             | F5261E19-F373-40BA-87FD-7F1C300CBBFF | 3321      |
| 17154 (`0x4302`) | 15728             | F5261E1A-F373-40BA-87FD-7F1C300CBBFF | 3295      |

Neither GUID is among the FormSet GUIDs inventoried in this exact source. Their
OEM semantic names are unknown. These two global branch accumulators cannot be
presented as an editable per-FormSet visibility vector.

The browser setup path copies 0x90 bytes from RVA 15440 and publishes the pointer
in global 17192 before calling the selection routine. Its first six 16-byte
records are followed by a zero-GUID sentinel at RVA 15536:

| Index | GUID                                 |
| ----- | ------------------------------------ |
| 0     | 59BFC760-3A82-4656-B1E1-D90A499AEA84 |
| 1     | 61912FA5-D42A-4F3F-955D-BB07B8DD1F57 |
| 2     | 480B3204-C23C-4AE1-BB16-A73FADDA475F |
| 3     | 2C0EEABD-4107-44A8-A787-2E38FFC52B2B |
| 4     | 348CA223-637B-4430-BAF3-1CE5D322B3FD |
| 5     | A7F26116-CFDC-4296-8224-ED7D140170C7 |

Neither condition GUID is in those six records. A further occurrence of
F5261E19 follows the sentinel in the copied allocation; allocation length is
not list length, and that occurrence is not an additional entry in this scan.
The loop ends after comparing the two zero-GUID halves. If both accumulated
conditions are false, the routine branches to its cleanup/return path before
the conditional mutation work. This explains the gate's static structure,
not whether a later protocol consumer replaces or extends the list.

The [follow-up](p53-runtime-navigation-research.md) identifies the OEM pointer
interface and a guarded consumer that can overwrite the first terminator, making
the later marker reachable. It also traces conditional Ref construction and
package update; the follow-up corroborates Form 1 and labels 1001/1002. Execution,
re-entry and actual resolved Ref destinations remain unresolved. The bounded
field-flow and insertion/remainder path are corroborated in that follow-up.
No Phoenix runtime Show/Hide capability follows from this evidence alone.

## Reproduction and limits

Run the opt-in local scenario with the authorized source and existing WASM assets:

```bash
FIRMWARE_ACCEPTANCE_SCENARIO=hii-registration \
FIRMWARE_ACCEPTANCE_IMAGE='<authorized local SPI>' \
FIRMWARE_ACCEPTANCE_WASM_DIR='<local WASM directory>' \
npm run firmware:acceptance
```

The scenario asserts source identity, four exact FFS identities, bounded PE
ownership, the seven records and selector reads, the candidate call shapes, and the
enumeration-to-browser global links. It also asserts the temporary handle copy,
conditional branch landmarks, package-inspection landmarks, the PE-entry
initialization chain, the two GUID/byte pairs and the initial list sentinel.
The follow-up adds publication/consumer landmarks, the signed backward callback
address, sentinel copy, browser zero arguments and Ref/package-update landmarks.
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
