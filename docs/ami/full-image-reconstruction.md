# Full-image reconstruction safety model

Full-image analysis and full-image writing are separate capabilities. A parsed
Setup HII tree is not proof that a modified firmware image can be rebuilt
safely. The application therefore enables full-image writing only when every
layer between an edited artefact and the original image can be reconstructed and
verified.

## Phase 1: immutable provenance

The extractor retains a local graph with these invariants:

- Buffer `0` is the untouched source image and its exact size is recorded.
- Each decoded buffer has one parent encapsulation edge.
- An edge records the parent buffer, section bounds and header size, payload
  bounds, section type, compression algorithm and GUID-defined metadata when
  present.
- When a section belongs to an FFS file, the edge also records the owning FV and
  FFS bounds. Embedded uncompressed volumes are reached through this edge rather
  than misclassified as peer volumes.
- Setup HII, AMITSE and SetupData record their exact payload bounds and source
  FFS identity.
- Only the source image and branches required by retained artefacts survive the
  scan. Shared ancestor buffers are stored once.

The preflight validates every artefact path back to buffer `0`. This is a
read-only statement: **trace captured** does not mean **write ready**.

## Write pipeline

The builder works from edited leaves back to the source image:

1. Apply all edits that share a decoded buffer before rebuilding its parent.
2. Recreate each PI section with its original metadata and deterministic
   compression parameters.
3. Initially require the rebuilt payload to fit in the existing allocation;
   preserve the detected erase/padding convention for unused bytes.
4. Repair every affected section, FFS and FV length/checksum field according to
   its format and attributes.
5. Preserve every byte outside the proven reconstruction paths.
6. Re-run the independent extractor on the completed image and require all
   requested logical edits, structure checks and size constraints to match.

Relocation and volume growth are outside the fixed-allocation builder. Capsule
output is deliberately out of scope. A complete Intel SPI input produces a
complete same-size SPI output, but only bytes inside the descriptor-declared
BIOS region may change; Descriptor, ME, GbE, EC and all other regions remain
bit-for-bit identical.

## Checking output before download

Applying a change queue checks its logical preconditions, not its packed size.
The footer now offers **Check firmware output** to run the complete builder,
including recompression, allocation checks, checksum repair and independent
re-extraction. Failure leaves the firmware download disabled and shows the
builder diagnostic. Success reports the verified image size and changed-byte
count without downloading anything.

**Modified firmware image** downloads those exact verified bytes and their
change log without rebuilding. The result stays only in browser memory and is
bound to the applied data and opened files. Changing either, or invalidating
the applied queue, requires a new check; a late completion from an earlier
check cannot enable download for the new state. Source acceptance and all
builder restrictions remain in force. This does not establish physical flash
validation.

## Current support and blockers

Fixed-size uncompressed section paths are rebuilt bottom-up today. The builder
repairs affected FFS header/data checksums, rejects changes outside owned FFS
paths or the BIOS region, and independently re-extracts the requested AMI
artefacts before download.

The builder also has a codec boundary for compressed sections. It checks the
original section header and decoded provenance, independently decodes the
replacement, and then repairs the owning FFS. An encoded body may change size
only when its section is terminal in a declared FFS allocation with untouched,
uniform erase padding. The builder updates the section size field, preserves the
FFS size and fills unused bytes with the original erase byte. It rejects growth
beyond that allocation, occupied tails and stale FFS bounds.
An LZMA1-alone encoder is now connected to the AMI builder. It accepts only a
known decoded length (at most 64 MiB), the usual 0x5D LZMA properties byte and
one of its supported dictionary sizes. A fixture encoded independently with
Python/liblzma confirms decoding, and the new encoder's output is deterministic.
The EFI/Tiano codec uses the upstream EDK II encoders (pinned at
`999fd0f12a27709eee04b93e46bd867e6b0163a5`) in a browser WASI process.
It selects EFI or Tiano by matching the original decoded bytes, preserves the
source decoded length, and checks each rebuilt stream with its selected decoder.
The frontend allows only explicitly accepted compressed paths. Other section
layouts remain unsupported.

One exact LZMA source now has [real-image acceptance](compressed-output-acceptance.md)
for Setup HII edits. Its terminal compressed section had no pre-existing tail;
shrinking it keeps the FFS allocation unchanged and fills the newly released
bytes using the enclosing FV's verified erase polarity. Other compressed
images and other artifact edits remain blocked.

One exact [Tiano source](tiano-spi-output-acceptance.md) also has acceptance for
Setup HII edits and [combined SetupData edits](tiano-setupdata-output-acceptance.md).
Its complete 8 MiB Intel SPI output reopens with the requested patches while
Descriptor, ME and every byte outside the edited FFS allocations remain identical.
That Tiano source also supports [code-verified root-vector edits](tiano-root-visibility-output-acceptance.md)
outside the HII payload, through bounded patches in the same retained Setup
buffer. Root changes use separate source acceptance and require fresh source
analysis plus independent complete-vector reread. The EFI compression variant
and mixed compressed ancestors remain unaccepted. The
[combined queue acceptance](tiano-combined-queue-acceptance.md) verifies merged
HII/root edits in one decoded ancestor alongside a SetupData branch, including
a real oversized combination that is rejected.

The remaining path-specific blockers are:

- validation of further LZMA/Tiano layouts and EFI against complete real images;
- additional packed-size layouts, including sections without proven terminal
  padding or changes that require relocation;
- real-sample acceptance for every newly enabled encapsulation combination.

All firmware bytes, decoded buffers and provenance metadata remain in the
browser session. They are not uploaded by the application.
