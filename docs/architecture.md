# Architecture

## Data flow

1. Upload components read a complete BIOS or the four extracted artefacts.
2. Aptio IV extraction locates firmware volumes and recursively decompresses
   encapsulated sections.
3. The binary IFR parser records Forms Packages, opcode spans, nested scopes and
   source ownership without changing the source buffer.
4. The compatibility text parser produces `Data`: FormSets, forms, prompts,
   conditions, VarStores, menu roots, source hashes and offsets.
5. `menuTree.ts` builds the navigable graph without collapsing identical
   FormIds from different FormSets.
6. `visibility.ts` classifies gates and propagates parent visibility.
7. `patcher.ts` validates every target and builds modified byte arrays.
8. Only after a complete patch succeeds are the files offered for download.

## Module boundaries

| Module                | Responsibility                                              |
| --------------------- | ----------------------------------------------------------- |
| `aptioIvImage.ts`     | Cheap, read-only image inspection                           |
| `aptioIvExtractor.ts` | Recursive FV/FFS/section extraction and WASM adapters       |
| `scripts.ts`          | IFR data-model assembly and compatibility exports           |
| `ifrBinary.ts`        | Binary opcode spans, scope matching and HII provenance      |
| `ifrEditing.ts`       | Transactional, fixed-size IFR editing primitives            |
| `ifrConditions.ts`    | Condition scope parsing, source classification and literals |
| `visibility.ts`       | Pure visibility and branch summaries                        |
| `menuTree.ts`         | GUID-aware graph construction and reachability              |
| `hex.ts`              | Validated hexadecimal conversion and bounded replacement    |
| `checksum.ts`         | Source and offset integrity hashes                          |
| `dataValidation.ts`   | Runtime validation of imported `data.json` envelopes        |
| `patcher.ts`          | Pure patch planning plus the download adapter               |
| `errors.ts`           | Stable domain error codes and user-facing messages          |

React components may orchestrate these modules, but domain modules must not
display dialogs, mutate the DOM or reload the page.

## Safety invariants

- A `SuppressIf` patch is rejected unless its expected `End` opcode is present.
- Odd or non-hexadecimal byte strings are rejected.
- A patch outside the source buffer is rejected.
- Imported editor state must match the current source hashes and offset checksum.
- Binary IFR scopes must be balanced before their spans can be used for editing.
- Binary patches must match their expected source bytes and may not overlap.
- Aptio IV binary export is disabled while reinsertion is not proven safe.
- Runtime/HW classification is evidence, not proof of the current machine state.
