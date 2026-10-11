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
in this exact LenovoSetupMainDxe module. The initial publishing allocation has
six GUIDs, then a zero terminator, then the OEM marker F5261E19, then another
zero. If the guarded callback copies this FormSet into the first zero slot,
the later marker becomes reachable by the previously traced list scan.
This is a conditional consequence of the source layout, not proof that the
notification ran or that a menu appeared.

The initial selection call precedes publication. A callback may alter the list
after that call; the trace does not yet establish subsequent selection re-entry
or a particular notification ordering. The consumer also reaches another
indirect call and clears state near its tail; that interface remains unresolved.

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
corroborated by EDK II HiiUpdateForm. The matched FormSet/Form, label anchors,
complete argument provenance and successful execution remain unresolved.

This creates a concrete lead for runtime-generated navigation: conditional Ref
construction followed by an HII database update. It does not contradict the
original static inventory's zero incoming Refs, and does not turn those static
declarations into proven displayed roots. It is not a binary Show/Hide recipe.

## Reproduction, sources and next gate

Use the existing `hii-registration` opt-in scenario described in the
[prior research record](p53-root-registration-research.md#reproduction-and-limits).
It asserts publication/consumer GUID ownership, callback address, list-copy
landmarks, Ref construction and database update, and retains immutable source
and body hashes. Output remains metadata only; no firmware is supplied to CI.
The scenario adds no frontend controls, parser rule or writer allowance.

Primary layouts used for corroboration:

- [EDK II Boot Services](https://github.com/tianocore/edk2/blob/master/MdePkg/Include/Uefi/UefiSpec.h)
- [EDK II HiiDatabase](https://github.com/tianocore/edk2/blob/master/MdePkg/Include/Protocol/HiiDatabase.h)
- [EDK II IFR Ref structures](https://github.com/tianocore/edk2/blob/master/MdePkg/Include/Uefi/UefiInternalFormRepresentation.h)
- [EDK II HII library](https://github.com/tianocore/edk2/blob/master/MdeModulePkg/Library/UefiHiiLib/HiiLib.c)

Next trace the consumer's additional interface and state, selection re-entry,
and the exact Forms/labels changed by the package replacement helper. Only then
can a controlled scenario explain a navigation outcome. Runtime registration,
runtime visibility and physical flashing remain unproven.
