# Vendor-neutral HII FormSet entry evidence

The workspace retains all first parsed forms in their FormSets in
`formSetRoots`. Its top-level `menu` is a separate graph projection that removes
entries with a resolved incoming static Ref. Previously both fields contained
that projection, losing declarations reached from other FormSets.

The read-only entry table lists the FormSet GUID, Form Id, source module and
current incoming IFR Ref count. `analyzeUefiHiiRoots` derives edges from the
current forms rather than trusting cached `referencedIn` arrays. Explicit
cross-FormSet GUIDs and implicit same-FormSet targets remain distinct; decimal
and hexadecimal Form Ids and GUID casing are normalized. Duplicate target
identities remain ambiguous and missing targets remain missing; neither can be
opened by selecting an arbitrary form. Equivalent declarations are deduplicated.
An explicitly empty declaration inventory remains empty.

Every entry reports runtime registration and visibility as **unproven**. A Ref
inside a suppression is still a static edge; its presence does not prove that
the link executes. The absence of incoming Refs does not prove hiding,
unregistration or runtime reachability. The navigation table labels visibility
as static IFR evidence and the graph tooltip no longer describes a structural
FormSet entry as a registered top-level menu. The report adds no root-edit
controls, parser promotion or reconstruction acceptance. It is derived from the
current data, not persisted as authoritative registration evidence.

## Evidence

Synthetic tests cover retained cross-FormSet declarations, actual incoming edges
despite stale cached parents, implicit versus explicit targets, duplicate and
missing identities, normalized declaration deduplication, absent/empty legacy
declaration fields and the non-UEFI-HII exclusion. Component tests cover the
read-only table, unique-target navigation and top-level editor integration;
existing AMI root controls remain covered independently.

The opt-in P53 React/jsdom acceptance also checks the derived evidence on its
real workspace before the existing queued move and complete-SPI verification.
The exact source is identified by SHA-256
`68eba5b369baf36c879551c0482a6feea31d68082bc4dd0631bf9e4427a88a64`
and size 33,554,432 bytes, as recorded in
[P53 output acceptance](p53-mirrored-lzma-output-acceptance.md).
Its selected nine modules contain 11 parsed FormSet entries and 187 forms;
none of those 11 entry forms has an incoming static Ref. These counts describe
the selected workspace, not every HII driver in the image. They do not prove
the firmware's runtime root registration or on-machine menu visibility.

## Remaining gate

Runtime registration requires coherent code/data evidence for the selected
source, followed by independent verification of any proposed registration
edit. No GUID occurrence, driver name, FormSet title, first-form position or
unlinked graph node grants this capability. Runtime callbacks and variables,
real Firefox flow verification and physical flash validation remain pending.
