# Vendor-neutral HII image builder foundation

The internal `buildUefiHiiFirmwareImage` builder reinserts fixed-size HII module
edits into independently discovered FFS owners. It is not connected to the editor
footer yet. The existing module-download action remains the user-facing output.
This is synthetic engine evidence, not Lenovo P53 acceptance or flash validation.

## Boundaries

The initial route accepts direct FFS modules in buffer zero of a raw PI image
with a firmware volume rooted at zero, or a complete descriptor-rooted Intel SPI.
It snapshots the image, workspace bytes and edit state before asynchronous work.
Fresh discovery must match each selected module's identity, FFS GUID, exact body
bytes and workspace span. Overlapping spans, duplicate identities and mirrored
copies are rejected. A separate FFS inventory detects identical copies even when
HII discovery deduplicates copies in the same buffer.

The shared PI builder receives one expected-byte patch per exact owning FFS. Its
optional `sourceFileStart` selector distinguishes multiple HII owners in one
buffer; callers omitting it retain the previous unique-owner requirement. FFS
header and data checksums are repaired. The original allocation and image size
remain fixed, and all bytes outside the affected FFS allocations remain identical.
Complete SPI output preserves every byte outside the BIOS region.

The complete result is decoded again and every discovered HII module is checked
against the exact expected edited or unchanged body. Missing modules, changed
unselected siblings and decode failures reject the result. Outer BIOS/SPI bounds
must remain identical too.

## Validation

`uefiHiiFirmwareRebuilder.test.ts` uses synthetic PI/IFR firmware only. Two tests
edit separate FFS modules in one buffer, independently re-open their complete raw
BIOS/SPI outputs, check both FFS checksums and preserve an unselected third module,
FV header, padding and all other bytes. Negative tests cover stale bytes/GUIDs/IDs,
wrong bounds, duplicate and overlapping spans, same-buffer mirrored FFS copies,
wrapper containers, missing edits, stale End opcodes, incomplete/encapsulated
provenance, decode failures and contradictory full-image re-extraction.
`uefiImageRebuilder.test.ts` covers the selector's ambiguous/missing-owner rejection.

## Remaining gates

Encapsulated modules, including uncompressed ancestors, are deferred: discovery
can currently inventory a Forms package in both an enclosing FFS body and its
nested driver, so these overlapping views need explicit ownership handling first.
LZMA and EFI/Tiano routes require their own generic HII real-image acceptance;
AMI source acceptance never enables this route. Mirrored modules, wrappers,
capsules, allocation growth and runtime root registration remain unsupported.

Before exposing check/report/download in the generic footer, reproduce a bounded
menu edit on the existing Phoenix/Lenovo sample and record its full-image
re-extraction. The roadmap's P53 exit gate remains open. Root FormSet presence
continues to be distinct from runtime registration or visibility.
