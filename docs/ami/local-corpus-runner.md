# Local firmware corpus runner

## Purpose

The corpus runner measures compatibility rather than inferring it from a few
successful screenshots. It accepts multiple complete firmware images, executes
the existing read-only AMI analysis locally and records the outcome of every
layer. The input images are never uploaded.

The runner does not turn an unsupported image into a parser exception and does
not collapse all outcomes into one percentage. It keeps these questions
separate:

1. Does the input contain a structurally valid UEFI firmware volume?
2. Can the application recursively extract a usable Setup HII context?
3. Can the HII and IFR graph be parsed?
4. Is the top-level navigation mechanism proven?
5. Is at least one Hide, Show or Move plan structurally available?
6. Can a complete firmware image be reconstructed and independently verified?

## Execution model

- A dedicated Web Worker keeps batch work away from the React UI thread.
- Files are processed sequentially to bound peak memory use.
- Every coherent Setup context is analysed separately. Setup, AMITSE and
  SetupData artifacts from different decoded buffers or firmware slots are not
  mixed.
- The 512 MiB safety limit applies independently to every selected file.
- Cancellation is checked between safe asynchronous stages and firmware
  contexts. A completed partial report remains exportable.
- Duplicate inputs are counted by SHA-256, not by filename.

## Report layers

| Layer          | Passed means                                                       |
| -------------- | ------------------------------------------------------------------ |
| Preflight      | At least one checksummed, bounded UEFI PI firmware volume exists   |
| Extraction     | At least one coherent Setup HII context was recursively extracted  |
| HII            | Extracted IFR produced the internal GUID-aware data model          |
| Navigation     | A root vector or single-FormSet IFR hub was structurally proven    |
| Editability    | At least one existing Hide, Show or fixed-size Move plan is proven |
| Reconstruction | Every edited leaf can be rebuilt to the source and reverified      |

`menu-evidence-only` is deliberately partial. SetupData or AMITSE may identify
plausible roots, but that is not equivalent to proving which runtime selector
made the profile live.

Editability refers to a pending structural HII plan. It does not imply that a
complete BIOS image can already be downloaded. Full-image readiness remains
false until deterministic recompression, bottom-up FFS/FV repair and independent
re-extraction are implemented.

## Denominators

The summary exposes both counts and percentages:

- **Extraction rate:** extracted files / all selected files.
- **Navigation rate:** files whose extracted contexts all have proven
  navigation / extracted files.
- **HII edit rate:** extracted files with at least one proven Hide, Show or Move
  plan / extracted files.
- **Full-image rate:** files with verified complete-image writing / extracted
  files.

These rates describe the selected corpus only. They must not be presented as
market coverage without also publishing the sample count, vendor/platform mix
and failure categories.

## Export privacy

JSON reports use schema `0.2.0` and contain:

- filename, size, last-modified timestamp and SHA-256;
- brand evidence with its source, documented sample counts, candidate navigation
  mechanisms and whether the analyzed image matches or extends the observed
  pattern;
- container and FV/FFS evidence;
- context coherence and extraction depth;
- HII package, FormSet, Form, Ref and condition counts;
- navigation mechanisms and their reasons;
- per-page Hide, Show and Move availability with exact blockers;
- provenance completeness and reconstruction blockers;
- stage failures and stable firmware error codes when available.

CSV is a flattened per-image summary intended for sorting and coverage tables.
Neither format contains source firmware, extracted modules, decompressed buffers,
IFR text or HII bytes.
