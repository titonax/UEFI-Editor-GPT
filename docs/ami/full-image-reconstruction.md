# Full-image reconstruction safety model

Full-image analysis and full-image writing are separate capabilities. A parsed
Setup HII tree is not proof that a modified firmware image can be rebuilt
safely. The application therefore keeps full-image writing disabled until every
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

## Required write pipeline

A future builder must work from edited leaves back to the source image:

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

Relocation, volume growth, authenticated capsule resigning and platform-specific
flash-region changes are separate capabilities. They must not be silently
approximated by the fixed-allocation builder.

## Current blockers

Full-image download remains unavailable while any of these are missing:

- deterministic LZMA and EFI/Tiano encoders compatible with the source section;
- bottom-up section replacement and shared-ancestor merging;
- FFS/FV checksum and padding repair;
- full-image re-extraction and byte-boundary verification.

All firmware bytes, decoded buffers and provenance metadata remain in the
browser session. They are not uploaded by the application.
