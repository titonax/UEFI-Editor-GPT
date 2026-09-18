# Architecture

## Data flow

1. The upload component inspects a complete BIOS. Images are not decompressed
   until the user starts HII analysis explicitly.
2. The shared AMI extractor locates firmware volumes and recursively
   decompresses encapsulated sections. Repeated Setup GUIDs are kept as separate
   buffer/FV contexts and paired only with unambiguous AMITSE/SetupData evidence.
   IV/V is an evidence-backed profile, not a prerequisite for parsing the common
   PI/HII structures.
3. The binary IFR parser records Forms Packages, opcode spans, nested scopes and
   source ownership without changing the source buffer.
4. The compatibility text parser produces `Data`: FormSets, forms, prompts,
   conditions, VarStores, menu roots, source hashes and offsets.
5. Single-FormSet navigation analysis separates the IFR hub and its direct tabs
   from AMITSE registration evidence. `menuTree.ts` then builds the navigable
   graph without collapsing identical FormIds from different FormSets.
6. `visibility.ts` classifies gates and propagates parent visibility.
7. Root-vector controls keep immutable detected bytes separate from reversible,
   provenance-bound desired-state plans.
8. `menuEditing.ts` inventories compatible destinations, plans fixed-size Ref
   relocation, updates HII container lengths and remaps affected IFR offsets.
9. `patcher.ts` replays structural edits, validates every target and builds
   modified byte arrays.
10. Only after a complete patch succeeds are the files offered for download.
11. The corpus runner performs the same read-only pipeline in a dedicated Web
    Worker. It analyses files and coherent firmware contexts sequentially, then
    returns metadata-only reports to the UI; source firmware bytes never cross a
    network boundary or enter a report.

## Module boundaries

| Module                        | Responsibility                                                |
| ----------------------------- | ------------------------------------------------------------- |
| `amiFirmwareImage.ts`         | Image inspection, container detection and Aptio evidence      |
| `amiFirmwareExtractor.ts`     | Generation-neutral entry point for shared extraction          |
| `aptioIvExtractor.ts`         | Recursive FV/FFS extraction and WASM adapters                 |
| `firmwareSections.ts`         | PI section headers and safe encapsulation dispatch            |
| `binaryReader.ts`             | Bounds-checked little-endian reads, GUIDs and alignment       |
| `scripts.ts`                  | Source validation and final IFR data-model assembly           |
| `ifrTextParser.ts`            | Compatibility parsing of verbose IFRExtractor text            |
| `menuDiscovery.ts`            | AMITSE menu matching and ordered source fallback              |
| `singleFormSetNavigation.ts`  | IFR-hub tab detection and AMITSE role separation              |
| `setupData.ts`                | SetupData page-table and question metadata discovery          |
| `ifrBinary.ts`                | Binary opcode spans, scope matching and HII provenance        |
| `ifrEditing.ts`               | Transactional, fixed-size IFR editing primitives              |
| `menuEditing.ts`              | Safe Ref moves, graph checks and IFR offset remapping         |
| `ifrConditions.ts`            | Condition scope parsing, source classification and literals   |
| `visibility.ts`               | Pure visibility and branch summaries                          |
| `amiRootVisibility.ts`        | Code-corroborated AMI multi-FormSet root byte-vector analysis |
| `amiRootVisibilityEditing.ts` | Provenance-bound desired root-state edit plans                |
| `menuTree.ts`                 | GUID-aware graph construction and reachability                |
| `hex.ts`                      | Validated hexadecimal conversion and bounded replacement      |
| `checksum.ts`                 | Source and offset integrity hashes                            |
| `dataValidation.ts`           | Deep runtime validation of imported `data.json`               |
| `patcher.ts`                  | Pure patch planning plus the download adapter                 |
| `errors.ts`                   | Stable domain error codes and user-facing messages            |
| `corpusAnalysis.ts`           | Layered local extraction, navigation and editing assessment   |
| `corpusTypes.ts`              | Versioned corpus result and Worker message contracts          |
| `corpusReport.ts`             | Coverage denominators plus metadata-only JSON/CSV export      |

React components may orchestrate these modules, but domain modules must not
display dialogs, mutate the DOM or reload the page.

## Safety invariants

- A `SuppressIf` patch is rejected unless its expected `End` opcode is present.
- Odd or non-hexadecimal byte strings are rejected.
- A patch outside the source buffer is rejected.
- Imported editor state must match the current source hashes and offset checksum.
- Imported binary IFR analysis is discarded and rebuilt from the loaded SCT.
- Imported root-vector analysis is discarded and rebuilt from the open firmware
  provenance.
- Imported single-FormSet navigation analysis is discarded and rebuilt from the
  opened IFR graph plus the current source's AMITSE registration evidence.
- Imported root-visibility plans must match the rebuilt vector buffer, byte
  offset, expected value and FormSet identity before they are accepted.
- Binary IFR scopes must be balanced before their spans can be used for editing.
- GUID-defined sections are opened only by a known processor, or when their PI
  attributes explicitly say that processing is not required.
- Repeated Setup, AMITSE or SetupData GUIDs must retain decoded-buffer and FV
  identity. Equally plausible companions are left unattached, and multiple
  usable Setup contexts require an explicit user selection.
- Binary patches must match their expected source bytes and may not overlap.
- Ref moves preserve the complete Setup HII size. A cross-package move must
  prove both Forms Package boundaries and compatible Package List provenance;
  every changed 24-bit/32-bit length is precondition-checked.
- Cross-FormSet moves require an existing explicit `FormSetGuid` (`REF3` or
  `REF4`). Implicit `REF`/`REF2` conversion remains disabled because it would
  grow the opcode. Nested Refs, duplicates and graph cycles are rejected.
- Aptio IV and generation-unresolved binary export remain disabled while their
  write/reinsertion paths are not proven safe.
- Runtime/HW classification is evidence, not proof of the current machine state.
- In a single-FormSet hub layout, direct hub Refs and hub Refs inside proven
  constant-true `SuppressIf` scopes are classified in physical IFR order.
  AMITSE registration alone never creates a navigation root and is not required
  to retain a structurally suppressed hub tab.
- Corpus percentages retain their numerator and denominator. Extraction is
  measured over selected files; navigation and editability are measured over
  successfully extracted files. Full-image readiness is never inferred from a
  complete provenance trace.
- Corpus exports may include filenames, hashes, structural counts and diagnostic
  text, but never source, decoded or extracted firmware bytes.

## Versioning

The npm/package version describes the application release and is currently
`0.5.0`. `dataSchemaVersion` describes the persisted `data.json` contract and
is `0.7.0`; it distinguishes single-FormSet IFR navigation hubs from AMITSE
page registration and stores provenance-bound pending root-visibility changes
without trusting imported binary analysis. The two versions are intentionally
independent.
