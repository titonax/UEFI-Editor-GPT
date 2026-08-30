# Architecture

## Data flow

1. Upload components inspect a complete BIOS or read the four extracted
   artefacts. Complete images are not decompressed until the user starts HII
   analysis explicitly.
2. The shared AMI extractor locates firmware volumes and recursively
   decompresses encapsulated sections. IV/V is an evidence-backed profile, not
   a prerequisite for parsing the common PI/HII structures.
3. The binary IFR parser records Forms Packages, opcode spans, nested scopes and
   source ownership without changing the source buffer.
4. The compatibility text parser produces `Data`: FormSets, forms, prompts,
   conditions, VarStores, menu roots, source hashes and offsets.
5. `menuTree.ts` builds the navigable graph without collapsing identical
   FormIds from different FormSets.
6. `visibility.ts` classifies gates and propagates parent visibility.
7. `menuEditing.ts` inventories compatible destinations, plans fixed-size Ref
   relocation, updates HII container lengths and remaps affected IFR offsets.
8. `patcher.ts` replays structural edits, validates every target and builds
   modified byte arrays.
9. Only after a complete patch succeeds are the files offered for download.

## Module boundaries

| Module                    | Responsibility                                              |
| ------------------------- | ----------------------------------------------------------- |
| `amiFirmwareImage.ts`     | Image inspection, container detection and Aptio evidence    |
| `amiFirmwareExtractor.ts` | Generation-neutral entry point for shared extraction        |
| `aptioIvExtractor.ts`     | Recursive FV/FFS/section extraction and WASM adapters       |
| `binaryReader.ts`         | Bounds-checked little-endian reads, GUIDs and alignment     |
| `scripts.ts`              | Source validation and final IFR data-model assembly         |
| `ifrTextParser.ts`        | Compatibility parsing of verbose IFRExtractor text          |
| `menuDiscovery.ts`        | AMITSE menu matching and ordered source fallback            |
| `setupData.ts`            | SetupData page-table and question metadata discovery        |
| `ifrBinary.ts`            | Binary opcode spans, scope matching and HII provenance      |
| `ifrEditing.ts`           | Transactional, fixed-size IFR editing primitives            |
| `menuEditing.ts`          | Safe Ref moves, graph checks and IFR offset remapping       |
| `ifrConditions.ts`        | Condition scope parsing, source classification and literals |
| `visibility.ts`           | Pure visibility and branch summaries                        |
| `menuTree.ts`             | GUID-aware graph construction and reachability              |
| `hex.ts`                  | Validated hexadecimal conversion and bounded replacement    |
| `checksum.ts`             | Source and offset integrity hashes                          |
| `dataValidation.ts`       | Deep runtime validation of imported `data.json`             |
| `patcher.ts`              | Pure patch planning plus the download adapter               |
| `errors.ts`               | Stable domain error codes and user-facing messages          |

React components may orchestrate these modules, but domain modules must not
display dialogs, mutate the DOM or reload the page.

## Safety invariants

- A `SuppressIf` patch is rejected unless its expected `End` opcode is present.
- Odd or non-hexadecimal byte strings are rejected.
- A patch outside the source buffer is rejected.
- Imported editor state must match the current source hashes and offset checksum.
- Imported binary IFR analysis is discarded and rebuilt from the loaded SCT.
- Binary IFR scopes must be balanced before their spans can be used for editing.
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

## Versioning

The npm/package version describes the application release and is currently
`0.5.0`. `dataSchemaVersion` describes the persisted `data.json` contract and
is `0.5.0`; it changed to represent a generation-unresolved AMI Aptio source.
The two versions are intentionally independent.
