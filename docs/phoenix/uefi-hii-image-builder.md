# Vendor-neutral HII image builder foundation

The `buildUefiHiiFirmwareImage` builder reinserts fixed-size HII module
edits into independently discovered FFS owners. The editor footer now exposes
Apply → Check firmware output → Output details → explicit complete-image download.
The verified bytes are cached for the current source, workspace and applied queue;
any change invalidates that result, including pending asynchronous completion.
The existing module-download action remains available separately.
See the [user flow and Firefox checks](uefi-hii-output-user-flow.md).
The uncompressed routes have synthetic engine evidence. A separate
[P53 mirrored LZMA acceptance record](p53-mirrored-lzma-output-acceptance.md) covers
the exact real source and Setup module; neither establishes physical flash validation.

## Boundaries

The internal route accepts direct FFS modules and modules reached through
uncompressed identity encapsulation in a raw PI image with a firmware volume
rooted at zero, or a complete descriptor-rooted Intel SPI.
It snapshots the image, workspace bytes and edit state before asynchronous work.
Fresh discovery must match each selected module's identity, FFS GUID, exact body
bytes and workspace span. Overlapping spans, duplicate identities and mirrored
copies are rejected unless complete physical copy ownership belongs to the exact
accepted mirrored source. A separate FFS inventory detects identical copies even when
HII discovery deduplicates copies in the same buffer.

Discovery excludes an enclosing carrier only after matching its actual PI section,
FFS owner, payload bounds and byte-identical decoded child. Valid Forms packages
within the child's independently inventoried FFS bodies belong to those inner
drivers. Identity sections containing direct HII without a nested FFS owner keep
their existing ownership. Mixed direct/nested packages or packages crossing a
nested FFS boundary produce an explicit ownership diagnostic and block the build.
Contradictory child provenance cannot silently remove an outer HII owner.

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

`uefiHiiFirmwareRebuilder.test.ts` uses synthetic PI/IFR firmware only. Five tests
edit separate FFS modules in one buffer, independently re-open their complete raw
BIOS/SPI outputs, check inner and enclosing FFS checksums and preserve an unselected
third module, FV headers, padding and all other bytes. They cover direct modules,
one identity ancestor in raw BIOS/SPI, and two identity ancestors in complete SPI.

Negative tests cover stale bytes/GUIDs/IDs,
wrong bounds, duplicate and overlapping spans, same-buffer mirrored FFS copies,
wrapper containers, missing edits, stale End opcodes, incomplete/compressed
provenance, mixed/crossing HII ownership, contradictory child metadata, decode
failures and contradictory full-image re-extraction.
`uefiImageRebuilder.test.ts` covers the selector's ambiguous/missing-owner rejection.

## Remaining gates

Mixed direct/nested HII ownership remains deferred. Generic LZMA output has exact
real-source acceptance only for the P53 Setup FFS and its two physical copies.
Other LZMA sources/drivers, EFI/Tiano, unknown mirrored modules, wrappers, capsules,
allocation growth and runtime root registration remain unsupported. AMI acceptance
never enables the generic route, and generic acceptance never enables AMI output.

The exact P53 source now reproduces one queued Ref move through complete-image
reconstruction and independent re-extraction. The generic footer retains the full
source image, reports each modified module's independently verified physical
FFS copies (offsets are relative to their decoded buffers), and shows the existing
compression capacity and preserved non-BIOS bytes. Downloads use the checked bytes
without rebuilding and always return a complete `.bin` for a complete SPI input.
Synthetic frontend tests cover Apply, explicit download, failure/retry, exact cached
bytes, report contents, queue mutations, source/workspace replacement and stale
asynchronous completion. This is separate from the real source engine acceptance;
Firefox/hardware behavior is not established by the synthetic UI tests.
Root FormSet presence continues to be distinct
from runtime registration or visibility.
