# Architecture

## Data flow

1. Upload components read a complete BIOS or the four extracted artefacts.
2. Aptio IV extraction locates firmware volumes and recursively decompresses
   encapsulated sections.
3. The IFR parser produces `Data`: FormSets, forms, prompts, conditions,
   VarStores, menu roots, source hashes and offsets.
4. `menuTree.ts` builds the navigable graph without collapsing identical
   FormIds from different FormSets.
5. `visibility.ts` classifies gates and propagates parent visibility.
6. `patcher.ts` validates every target and builds modified byte arrays.
7. Only after a complete patch succeeds are the files offered for download.

## Module boundaries

| Module                | Responsibility                                              |
| --------------------- | ----------------------------------------------------------- |
| `aptioIvImage.ts`     | Cheap, read-only image inspection                           |
| `aptioIvExtractor.ts` | Recursive FV/FFS/section extraction and WASM adapters       |
| `scripts.ts`          | IFR data-model assembly and compatibility exports           |
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
- Aptio IV binary export is disabled while reinsertion is not proven safe.
- Runtime/HW classification is evidence, not proof of the current machine state.
