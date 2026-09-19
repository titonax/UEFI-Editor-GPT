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

## Firmware family classification

Classification is independent of the computer manufacturer and filename. The
preflight records the signature, offset, confidence and any competing evidence.
It distinguishes probable AMI Aptio, legacy AMIBIOS, Phoenix BIOS, Award BIOS,
Insyde UEFI, a standalone Intel Management Engine region and common non-firmware
file formats. Valid UEFI volumes without a reliable vendor signature remain
**UEFI (family unresolved)**. Binaries without enough evidence remain
**unidentified**; a short EC-sized binary, for example, is not automatically
called EC firmware. Phoenix strings in certificate metadata do not identify the
main UEFI implementation.

A bounded, checksummed firmware volume proves the PI container, not the vendor
or generation. The same Intel ME partition header can also be inside a full
SPI dump, so it identifies a standalone ME payload only when it occurs at the
start of an image without a flash descriptor or valid firmware volume. An
uncompressed Insyde vendor string can occur in an AMI-based image; strong
AMI Setup evidence takes precedence and both clues remain visible. Competing
strong provider signatures remain unresolved with a conflict flag.

When coherent AMI Setup HII is extracted, the final family classification
records that observation. Successful HII parsing raises the family confidence;
neither classification nor manufacturer evidence proves the Aptio generation,
the live menu roots or a safe full-image write.

Some older AMI Setup modules yield **Framework IFR** instead of UEFI HII Forms
packages. The image view reports a read-only count of FormSets, forms and
references; the corpus exports the format and those counts even when its UEFI
parser cannot continue. Framework editing remains unavailable until its
different opcode grammar, menu links and binary patch paths can be verified.

PhoenixBIOS 4.0 modular ROMs are reported separately with validated BCP/FFV
module offsets and sizes. The AMI HII preflight still requires a valid UEFI PI
volume, so a read-only Phoenix module inventory does not count as an editable
HII context. UEFI images with Phoenix SecCore debug provenance retain any
competing provider strings and do not claim a verified Setup implementation.

## Compatibility dashboard

The live dashboard and the exported JSON measure **distinct cases**: the first
completed result for each SHA-256 is included, subsequent copies of that hash
are excluded, and files that could not be hashed remain separate cases. It
shows how many of the selected files have completed, so a cancelled run has an
explicit partial denominator. The individual file list and CSV still retain
every completed input; CSV marks subsequent copies with `duplicate_sha256`.

For every layer, the dashboard shows passed, warning, failed, blocked and not
run counts against the cases _eligible_ for that layer. Preflight is eligible
for all cases; extraction requires passed preflight; HII requires passed
extraction; navigation, editability and reconstruction require passed HII.
These later capabilities are measured independently: an image can have proven
navigation without an available edit plan, and an edit plan does not establish
full-image output.

Each distinct case receives one **first recognition blocker**: reading,
preflight, extraction, HII, navigation, or none if navigation was proven. The
failure taxonomy separately groups explicit errors by stage and stable code,
using `NO_CODE` when no code is available. Cases can lack an explicit error
while still having a navigation warning or a blocked edit operation.

Firmware family, IFR format, manufacturer, container and probable Aptio-generation tabs
show the number of cases in each group and the extraction, navigation, HII edit
and full-image counts. Extraction uses cases in the group as its denominator;
the remaining capabilities use extracted cases. Unknown manufacturer and
generation conflict remain visible. Brand evidence is a classification aid,
never proof of an image's architecture. The dashboard describes only the
selected images and is not an estimate of market-wide coverage.

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

JSON reports use schema `0.5.0` and contain:

- filename, size, last-modified timestamp and SHA-256;
- firmware family evidence, confidence and conflicting signatures;
- observed IFR format and read-only Framework inventory when present;
- Phoenix BCP/FFV module inventory or UEFI debug module provenance when present;
- brand evidence with its source, documented sample counts, candidate navigation
  mechanisms and whether the analyzed image matches or extends the observed
  pattern;
- container and FV/FFS evidence;
- context coherence and extraction depth;
- HII package, FormSet, Form, Ref and condition counts;
- navigation mechanisms and their reasons;
- per-page Hide, Show and Move availability with exact blockers;
- provenance completeness and reconstruction blockers;
- stage failures and stable firmware error codes when available;
- a distinct-case dashboard with eligible-layer counts, first recognition
  blockers, failure taxonomy and family/manufacturer/container/generation cohorts.

CSV is a flattened per-image summary intended for sorting and coverage tables.
Neither format contains source firmware, extracted modules, decompressed buffers,
IFR text or HII bytes.
