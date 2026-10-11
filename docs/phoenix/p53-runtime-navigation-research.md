# P53 GUID-list publication and conditional navigation

This continues the [browser/handle investigation](p53-root-registration-research.md)
for the exact authorized P53 SPI with SHA-256
`68eba5b369baf36c879551c0482a6feea31d68082bc4dd0631bf9e4427a88a64`.
The same four immutable driver bodies and bounded raw/RVA mappings are used.
The local probe decodes instructions; it never executes firmware or services.
All RVAs below belong to the named driver's own PE image.

## Publication and consumer

The OEM protocol GUID is `F5261E18-F373-40BA-87FD-7F1C300CBBFF`.
Its semantic name is unknown. It occurs in SystemBiosSetupDxe at body offset
14868, with LEA candidates at 4666 and 4924, and in LenovoSetupMainDxe at
body offset 43900, with candidates at 1406 and 2426.

| Driver             | Landmark                                                                       | RVA              |
| ------------------ | ------------------------------------------------------------------------------ | ---------------- |
| SystemBiosSetupDxe | Initial handle-selection call                                                  | 4640             |
| SystemBiosSetupDxe | Publishes address of GUID-list pointer global 17192 through service slot +0x80 | 4652, 4676       |
| SystemBiosSetupDxe | Unpublishes the same interface address through service slot +0x90              | 4906, 4927       |
| LenovoSetupMainDxe | Event callback entry                                                           | 1184             |
| LenovoSetupMainDxe | Locates the OEM protocol into a stack output slot                              | 1195, 1202, 1209 |
| LenovoSetupMainDxe | Dereferences the returned interface to obtain the list pointer                 | 1333, 1359       |
| LenovoSetupMainDxe | Copies one 16-byte FormSet GUID over the zero-GUID slot                        | 1397, 1409, 1415 |
| LenovoSetupMainDxe | Supplies callback 1184 to a candidate CreateEvent call                         | 2181, 2202       |
| LenovoSetupMainDxe | Registers notification for the OEM protocol GUID                               | 2222, 2229       |

The publishing driver's service global is linked to Boot Services by the prior
entry trace. The +0x80/+0x90 calls match InstallProtocolInterface and
UninstallProtocolInterface. The consumer's +0x50/+0xA8 method shapes match
CreateEvent and RegisterProtocolNotify; its full service-global initialization
has not yet been traced. Its backward RIP-relative callback address is checked
using a signed displacement, not by treating it as a positive offset.

The callback is guarded by successful protocol lookups, an indirect call's
status, two bytes returned by that call and a separate global byte. Those
conditions are not named hardware features or visibility flags by this probe.
The GUID loop skips the copy when the target already exists and copies at the
zero-GUID terminator otherwise. The bounded copy helper corroborates source,
destination and count with a memory-copy instruction path.

The copied GUID is `821D8B77-246D-4E96-8E10-3467D56AB1BA`, a FormSet present
in this exact source's SystemSetupAdvancedDxe module. LenovoSetupMainDxe's own
parsed FormSet is `1247C8E8-307C-4C6B-8812-CA054F9963F8`. The GUID copied from
its data section is a target identity, not proof of its own HII ownership.
This corrects the earlier consumer-module attribution. The initial publishing
allocation has
six GUIDs, then a zero terminator, then the OEM marker F5261E19, then another
zero. If the guarded callback copies this target FormSet into the first zero slot,
the later marker becomes reachable by the previously traced list scan.
This is a conditional consequence of the source layout, not proof that the
notification ran or that a menu appeared.

The initial selection call precedes publication. A callback may alter the list
after that call; the trace does not yet establish subsequent selection re-entry
or a particular notification ordering. The consumer also reaches another
indirect call and clears state near its tail; the keyboard trace below identifies
that interface without establishing selection re-entry.

## Conditional package mutation

In SystemBiosSetupDxe, the earlier F5261E19-dependent branch reaches a builder
at RVA 13092 (`0x3324`) and then an update helper at 13852 (`0x361C`).
The builder uses opcode `0x0F`, a 0x23-byte temporary layout and an optional
16-byte GUID copy. This matches the shape of EDK II HiiCreateGotoExOpCode and
the variable-length IFR Ref structures. This is a code/ABI inference; no symbol
table identifies the compiled routine by name.

The update helper loads the already traced HiiDatabase interface, exports the
package list at RVAs 13934 and 14008, checks package type 2, calls a Forms
replacement helper at 14195 and reaches interface slot +0x10 at 14325.
That slot is UpdatePackageList. The export/Forms/replacement/update sequence is
corroborated by EDK II HiiUpdateForm. The matched FormSet/Form and label anchors
are corroborated below.
Field flow and insertion behavior are detailed below; selected handles, resolved
strings/device paths and successful execution remain unresolved.

This creates a concrete lead for runtime-generated navigation: conditional Ref
construction followed by an HII database update. It does not contradict the
original static inventory's zero incoming Refs, and does not turn those static
declarations into proven displayed roots. It is not a binary Show/Hide recipe.

## Exact replacement target and labels

The Forms replacement helper at RVA 13312 contains a fixed FormSet comparison
against data GUID `1D81A238-03F1-4F4A-A413-CBBB008E1F0F` at RVA 15584.
It compares both halves at RVAs 13503 and 13516 after recognizing opcode `0x0E`.
It initializes the 16-bit Form selector to `1` at 13353/13358, recognizes Form
`0x01` or FormMap `0x5D`, and compares the following ID at 13565.

The original SystemBiosSetupDxe HII package independently contains that FormSet,
Form 1 and two 21-byte Tiano GUID label opcodes:

| Body offset | Owner Form | Extension | Label number   |
| ----------- | ---------- | --------- | -------------- |
| 15685       | 1          | 0 (label) | 1001 (`0x3E9`) |
| 15706       | 1          | 0 (label) | 1002 (`0x3EA`) |

Their GUID is `0F0B1735-87A0-4193-B266-538C38AF48CE`. The conditional builder
writes these same numbers at 4090 and 4132. The replacement helper compares the
start opcode by length and bytes at 13630, then copies data after the start
anchor at 13682/13699. Its not-found return is `0x800000000000000E` at 13816.
This ties the mutation lead to a concrete source Form and start anchor.
The constructed second label does not prove replacement of the region between
the labels. The extended helper trace below corroborates insertion followed by
preservation of the original remainder. Runtime outcomes remain open.

## Ref source fields and insertion behavior

At RVA 3998 the conditional loop loads a handle from its temporary selected array.
It passes four output addresses to inspection routine 1840: a GUID at caller
`[rbp-1]`, prompt at `[rbp+0x6F]`, Form ID at `[rbp+0x77]`, and a fifth-argument
DevicePath string output at `[rbp+0x67]`. The inspector exports that handle's HII
package list. It copies 16 bytes from FormSet opcode +2, reads its title at +18,
and writes the ID from the first Form opcode reached in a scanned Forms package.
The prompt output can be rewritten by conditional string processing before return.
The DevicePath string's final value and multi-package traversal outcomes are not
resolved by these landmarks.

The caller reloads those outputs into the Ref builder. Its bounded 104-byte
stack adjustment and field stores match the following IFR layout:

| Ref field         | Static source / value                                                                    | Offset in Ref |
| ----------------- | ---------------------------------------------------------------------------------------- | ------------- |
| Prompt            | Inspector prompt output; initially the FormSet title, with conditional string processing | 2             |
| Help              | Builder constant string ID 4                                                             | 4             |
| QuestionId        | Low 16 bits of `0x2000 + selected-handle index`                                          | 6             |
| Question flags    | Zero                                                                                     | 12            |
| Target FormId     | Inspector Form ID output                                                                 | 13            |
| Target QuestionId | Zero                                                                                     | 15            |
| Target FormSetId  | Inspector GUID output, passed as a non-null pointer                                      | 17            |
| DevicePath        | Inspector fifth output, an optional string ID                                            | 33            |

The device-path value determines a 35-byte Ref4 or a 33-byte Ref3 in this caller
path. A GUID found in the consumer's static data does not fix every inserted
Ref destination to Advanced. The GUID and Form outputs belong to the currently
inspected handle. Actual handle membership, final string IDs and executed
navigation require separate runtime evidence.

After matching the start opcode, helper 13312 reads the start buffer's position,
skips its first opcode and copies the rest at 13682/13699. It then advances the
original package offset past that matched opcode and immediately copies the
original remainder at 13743/13760. This corroborates insertion after the start
anchor and retention of subsequent source opcodes, including the second label.
There is no end-anchor search in that matched path. Its shape matches the EDK II
HiiUpdateForm insertion case with a null end buffer; this is an inference from
compiled code, not proof of the original symbolic call arguments. The separately
constructed 1002 buffer does not establish a two-anchor replacement operation.

## Keyboard gate and cleanup

The consumer's previously unresolved interface is corroborated as
SimpleTextInputEx. Its GUID `DD9E7534-7762-4698-8C14-F58517A625AA` is at RVA 35280. The setup routine at 1524 passes that GUID and output global 47872 to a
+0x98 call, compatible with HandleProtocol on the console input handle.
It supplies callback RVA 1472 and notify-handle output global 47880 to interface
slot +0x20 at 1648, matching RegisterKeyNotify.

The key callback sets global byte 47864 to one at 1483; the OEM list callback
checks that same byte at 1320. The key callback and list callback both reach
slot +0x28 using the same interface/notify handle, at 1505 and 1447 respectively.
That slot is UnregisterKeyNotify. The list callback then clears the gate byte
at 1458. Its tail is keyboard notification cleanup, so it supplies no evidence
of selection re-entry. Keystroke delivery, full service-global initialization,
actual callback ordering and the other protocol/output-byte guards remain open.

## Reproduction, sources and next gate

Use the existing `hii-registration` opt-in scenario described in the
[prior research record](p53-root-registration-research.md#reproduction-and-limits).
It asserts publication/consumer GUID ownership, callback address, list-copy
landmarks, Ref construction and field flow, database update, owned labels,
insertion/remainder copies and keyboard gate,
and retains immutable source and body hashes. Output remains metadata only; no firmware is supplied to CI.
The scenario adds no frontend controls, parser rule or writer allowance.

Primary layouts used for corroboration:

- [EDK II Boot Services](https://github.com/tianocore/edk2/blob/master/MdePkg/Include/Uefi/UefiSpec.h)
- [EDK II HiiDatabase](https://github.com/tianocore/edk2/blob/master/MdePkg/Include/Protocol/HiiDatabase.h)
- [EDK II IFR Ref structures](https://github.com/tianocore/edk2/blob/master/MdePkg/Include/Uefi/UefiInternalFormRepresentation.h)
- [EDK II Tiano label layout](https://github.com/tianocore/edk2/blob/master/MdeModulePkg/Include/Guid/MdeModuleHii.h)
- [EDK II SimpleTextInputEx](https://github.com/tianocore/edk2/blob/master/MdePkg/Include/Protocol/SimpleTextInEx.h)
- [EDK II HII library](https://github.com/tianocore/edk2/blob/master/MdeModulePkg/Library/UefiHiiLib/HiiLib.c)

Next trace selection re-entry, actual notification ordering and the remaining
protocol/output-byte guards, plus actual selected handles and resolved Ref
strings/device paths.
Only then
can a controlled scenario explain a navigation outcome. Runtime registration,
runtime visibility and physical flashing remain unproven.
