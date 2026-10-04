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
The frontend still blocks compressed export until real-image acceptance. Other
section layouts and EFI/Tiano compression remain unsupported.

The remaining path-specific blockers are:

- an EFI/Tiano encoder, plus validation of LZMA against a real firmware image;
- additional packed-size layouts, including sections without proven terminal
  padding or changes that require relocation;
- real-sample acceptance for every newly enabled encapsulation combination.

All firmware bytes, decoded buffers and provenance metadata remain in the
browser session. They are not uploaded by the application.
