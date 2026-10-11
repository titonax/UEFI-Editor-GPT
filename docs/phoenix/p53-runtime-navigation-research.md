# P53 GUID-list publication and conditional navigation

This continues the [browser/handle investigation](p53-root-registration-research.md)
for the exact authorized P53 SPI with SHA-256
`68eba5b369baf36c879551c0482a6feea31d68082bc4dd0631bf9e4427a88a64`.
The four previously traced immutable driver bodies and bounded raw/RVA mappings
are retained; the OEM guard investigation adds PriorBootDxe below.
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
CreateEvent and RegisterProtocolNotify; the entry/helper trace below now links
the service global to Boot Services. Its backward RIP-relative callback address
is checked
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

## Entry, browser return and reset request

The bounded EFI entry window tail-jumps at RVA 790 to wrapper 5336. That wrapper
calls browser routine 4516 at 5719. The browser routine calls selector 2844 at
4640, publishes the OEM pointer interface at 4676, and calls SendForm at 4824.
The two complete decoded routines end at 5824 and 4974 respectively.

| Landmark                                                | SystemBiosSetupDxe RVA |
| ------------------------------------------------------- | ---------------------- |
| Entry tail-jump to wrapper                              | 790                    |
| Wrapper initializes reset-output byte to zero           | 5369                   |
| Wrapper passes that byte to browser routine             | 5715, 5719             |
| Browser passes ActionRequest output address to SendForm | 4788, 4802, 4824       |
| Browser compares request with 1 and sets caller byte    | 4826, 4833             |
| Wrapper tests reset-output byte                         | 5744, 5748             |
| Wrapper calls Runtime Services slot +0x68               | 5750, 5768             |

The browser retains its incoming output pointer in RDI. After SendForm, request
value 1 causes a byte store through that pointer. In the FormBrowser2 definition,
1 is EFI_BROWSER_ACTION_REQUEST_RESET. On a successful browser return and a set
byte, the wrapper loads global 17232 and calls slot +0x68 with reset type 1,
status zero, data size zero and a null data pointer.

The entry helper separately reads System Table RuntimeServices at +0x58 into
RAX at 811 and stores it in global 17232 at 838. Its layout and method slot match
ResetSystem. This is static pointer/ABI corroboration; no reset or firmware
service is executed by the probe.

Within these bounded routines, the browser has one direct selector call (4640),
and the wrapper has one direct browser call (5719). The observed return route
handles a reset request; it does not show a second direct selector call after
publication. This is a local control-flow limit, not proof that indirect services,
notifications or external callers cannot re-enter. Linear searches elsewhere in
the image are discovery leads only and cannot prove absence of an invocation.
The PE exception-directory fields do not provide usable function boundaries;
these windows use the observed prologues, section bounds and final returns.

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
of selection re-entry. Keystroke delivery, actual callback delivery/order and
the OEM output-byte semantics remain open.

## Consumer service chain and explicit initial signal

LenovoSetupMainDxe's PE entry RVA is 980. It calls initialization helper 1000
at 984 before main routine 1672 at 989. The helper reads System Table +0x60
into RBX at 1006 and stores it in global 46272 at 1014; it stores the System
Table pointer in global 46264 at 1028. The OEM callback and event-registration
sequence load the same Boot Services global. This closes the previous service
pointer provenance gap without executing its methods.

| Landmark                                                  | LenovoSetupMainDxe RVA |
| --------------------------------------------------------- | ---------------------- |
| Set EBX to 8, then pass it as NotifyTpl in EDX            | 2117, 2195             |
| Pass event output address, null context and callback 1184 | 2168–2181              |
| Create event with type 0x200                              | 2197, 2202             |
| Pass returned event and registration output address       | 2212, 2217             |
| Register OEM protocol notification                        | 2222, 2229             |
| Pass the same event to an explicit SignalEvent call       | 2242, 2247             |

The EDK II constants identify type 0x200 as EVT_NOTIFY_SIGNAL and TPL 8 as
TPL_CALLBACK. Boot Services slot +0x68 is SignalEvent. The decoded sequence
therefore explicitly signals its event after registering protocol notification;
it does not depend solely on a later protocol-install signal. No status branch
intervenes between these three calls in this bounded path. The probe establishes
instruction and argument order, not successful creation/registration, event
scheduling or delivery, driver dispatch order, or callback execution before or
after SystemBiosSetupDxe's selector. Those runtime facts remain unresolved.

## Remaining OEM output guard

The second protocol lookup in callback 1184 uses GUID
`B68D09CD-E5D8-49B4-AF9F-419F7A3B5B10` at data RVA 35264. Its output interface
is stored at stack +0x50. After rejecting a failed lookup, the callback zeroes a
15-byte local buffer at stack +0x20 through helper 736, whose bounded instruction
path uses REP STOSB. It passes that buffer in RCX to interface slot zero at 1287.
A failed method status exits at 1292; byte offsets 0 and 5 must both be nonzero
at 1298/1309. The keyboard gate at global 47864 must also be set at 1320 before
the GUID-list copy can be reached.

These are precise protocol identity, buffer and control-flow observations.
The provider and first-method output layout are corroborated below; the flag
origins, effective values and their semantic meanings remain unknown. They are not promoted to named hardware capabilities, current
machine state or menu visibility. The static probe does not invoke this OEM
interface or synthesize a successful response.

## OEM guard provider and output construction

The local GUID search is a discovery lead only. Instruction and data ownership
now corroborate a publisher in **PriorBootDxe**, FFS GUID
`57F48613-300A-4101-A76D-4F73C533B5B8`, in decoded buffer 2 at FFS start 15945744. Its immutable body SHA-256 is
`3f496da8f1e7651acb35eb628347a5bca2f9487fafc1ec6ffcff6964fb0b1034`.
All RVAs in this section belong to that driver's own PE image.

The PE entry 736 reads System Table BootServices +0x60 at 740 and stores it
in global 5656 at 744. It supplies callback 1208 to Boot Services slot +0x170
at 813/869, matching CreateEventEx. Inside that callback's bounded window,
the call at 1792 loads the same Boot Services global and supplies:

| Argument | Landmark RVA | Value / target RVA            |
| -------- | ------------ | ----------------------------- |
| RCX      | 1785         | Address of handle global 5768 |
| RDX      | 1778         | OEM guard GUID at 5296        |
| R8       | 1768         | Interface table at 5456       |
| R9       | 1775         | Zero terminator               |

Slot +0x148 matches InstallMultipleProtocolInterfaces. The interface table's
first 64-bit entry is 1116, an executable RVA whose complete 91-byte method
ends at 1206. This links the same GUID used by LenovoSetupMainDxe's second
lookup to a concrete publishing path and first method. Publication is
conditional; the probe does not establish that this event callback ran, that
installation succeeded or that no other publisher exists.

Method 1116 preserves its caller's buffer pointer in RBX and clears 15 bytes
through helper 704 at 1130. That helper uses zeroed RAX and REP STOSQ/STOSB.
The method then copies individual global bytes into the output:

| Output byte | Source global RVA | Store RVA |
| ----------- | ----------------- | --------- |
| 1           | 5587              | 1169      |
| 2           | 5586              | 1172      |
| 3           | 5584              | 1176      |
| 4           | 5585              | 1160      |
| 5           | 5588              | 1179      |

Byte 0 stays zero unless at least one of globals 5587, 5586 or 5584 equals
**exactly 1**; the compare/branch path at 1182–1197 then sets byte 0 to one.
The method returns status zero at 1199. Consequently the consumer's byte-0
guard tests that aggregate result, while its byte-5 guard tests the copied
value of global 5588 for nonzero. The byte-5 condition does not require exactly

1. These facts describe output construction and the consumer's tests; they do
   not assign hardware, authentication or visibility meanings to the flags.
   Concrete flag writers are corroborated below. Their complete initialization/write
   inventory, effective runtime values and semantic names remain open.

The search also found GUID references in LenovoVariableDxe. Its examined paths
use LocateProtocol and a notification helper, so those references alone do not
make it a provider. The discovery scan is not a whole-image absence proof or
a complete inventory of protocol consumers.

## Flag writers and media-dependent conditions

PriorBootDxe's interface table at 5456 has method 2272 at +8 and method 4180
at +16. These supply concrete writers for the previously opaque output flags.
The read-only probe still decodes instructions only; it performs no block reads,
protocol calls or device I/O.

Method 2272 enumerates handles through Boot Services +0x138 with search type 2
and Block I/O GUID `964E5B21-6459-11D2-8E39-00A0C969723B` at data RVA 5376.
For each candidate it obtains that interface via HandleProtocol at 2382. Helper
4916 separately obtains DevicePath GUID `09576E91-6D3F-11D2-8E39-00A0C969723B`
at RVA 5248. A local path classifier at 2048 must return code 0x305 before the
media path proceeds (2410–2420). The numeric result is not assigned a generic
hardware or visibility meaning.

The caller also inspects private offsets +0x9A and +0xA8 beyond the public
Block I/O layout. A nonzero +0x9A byte reaches the comparison with 5; value 5
skips that candidate. When +0x9A is zero, byte +6 of the pointed-to structure
at +0xA8 must equal 4 to reach helper 1840. These private offsets are
exact-source observations, not portable Block I/O fields.

Helper 1840 reads the interface's Media pointer at +8, tests MediaPresent at
Media +5, allocates Media.BlockSize bytes from +0xC, and passes MediaId,
LBA zero, that block size and the allocated buffer to interface +0x18 at 1918.
The GUID, public structure fields and argument layout match ReadBlocks in EDK II.
A failed read exits without a classification result. Successful paths require
the word 0xAA55 at buffer +0x1FE and byte 0x29 at +0x26 or +0x42.
A private container signature check at interface -0x48 then separates branches:
with value 0x4D627355, buffer byte +0xA of 0x79 yields 0xFE and 0x7A yields
0xFC. The other signature branch can yield 0xFD. The probe records comparisons,
not an actual storage block or current media state.

The return code selects a fall-through sequence of flag stores:

| Helper result | Branch target RVA | Globals set to 1 |
| ------------- | ----------------- | ---------------- |
| 0xFC          | 2487              | 5588, 5587, 5585 |
| 0xFE          | 2494              | 5587, 5585       |
| 0xFD          | 2501              | 5585             |

Thus a reached 0xFC store path establishes both the copied byte-5 flag (5588)
and one flag contributing to aggregate byte 0 (5587). The 0xFE path establishes
that aggregate contributor but does not write 5588; the 0xFD path writes only
the flag copied to byte 4. These local paths do not clear earlier state and do
not establish the final runtime output or ordering relative to Setup's callback.
After scanning, method 2272 calls helper 884, which packages the flags for
another interface; that notification/update result is not yet resolved.

Method 4180 supplies a different byte-0 contributor. After protocol lookups and
indirect data retrieval, it requires at least 16 bytes at 4405/4410 and compares
a 16-byte prefix with a locally constructed constant at 4435–4448. A complete
match sets global 5584 to one at 4452, then tail-jumps to helper 884. Its input
provider and meaning remain unresolved. The publisher callback also has stores
to 5586 at 1677 and 5587 at 1685. These are corroborated write landmarks,
not a claim that the linear discovery scan found every possible writer.

The OEM gate therefore includes media/content-dependent results as well as the
separate keyboard flag. It cannot be treated as a fixed hidden-menu bit from
this evidence. No branch is patched and no unsupported runtime edit is enabled.

## Reproduction, sources and next gate

Use the existing `hii-registration` opt-in scenario described in the
[prior research record](p53-root-registration-research.md#reproduction-and-limits).
It asserts publication/consumer GUID ownership, callback address, list-copy
landmarks, Ref construction and field flow, database update, owned labels,
insertion/remainder copies, keyboard gate and bounded invocation/reset flow,
consumer Boot Services provenance, explicit signal order, OEM output guards,
PriorBootDxe publication/first-method field flow, and bounded media/content flag writers,
and retains immutable source and body hashes. Output remains metadata only; no firmware is supplied to CI.
The scenario adds no frontend controls, parser rule or writer allowance.

Primary layouts used for corroboration:

- [EDK II FormBrowser2](https://github.com/tianocore/edk2/blob/master/MdePkg/Include/Protocol/FormBrowser2.h)
- [EDK II Boot Services](https://github.com/tianocore/edk2/blob/master/MdePkg/Include/Uefi/UefiSpec.h)
- [EDK II HiiDatabase](https://github.com/tianocore/edk2/blob/master/MdePkg/Include/Protocol/HiiDatabase.h)
- [EDK II IFR Ref structures](https://github.com/tianocore/edk2/blob/master/MdePkg/Include/Uefi/UefiInternalFormRepresentation.h)
- [EDK II Tiano label layout](https://github.com/tianocore/edk2/blob/master/MdeModulePkg/Include/Guid/MdeModuleHii.h)
- [EDK II SimpleTextInputEx](https://github.com/tianocore/edk2/blob/master/MdePkg/Include/Protocol/SimpleTextInEx.h)
- [EDK II Block I/O](https://github.com/tianocore/edk2/blob/master/MdePkg/Include/Protocol/BlockIo.h)
- [EDK II DevicePath](https://github.com/tianocore/edk2/blob/master/MdePkg/Include/Protocol/DevicePath.h)
- [EDK II HII library](https://github.com/tianocore/edk2/blob/master/MdeModulePkg/Library/UefiHiiLib/HiiLib.c)

Next trace indirect selection re-entry, actual notification delivery/order and the
remaining OEM flag initialization/effective values and semantics, plus actual selected handles and resolved Ref
strings/device paths.
Only then
can a controlled scenario explain a navigation outcome. Runtime registration,
runtime visibility and physical flashing remain unproven.
