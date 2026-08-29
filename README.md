# UEFI Editor GPT

Web editor for analysing AMI Aptio IV/V HII and IFR structures. It builds the
menu hierarchy from `FormSet`, `Form` and `Ref` relationships, explains the
evidence behind visibility decisions, and prepares controlled Aptio V changes.

This repository is the quality-focused working copy of
[`titonax/UEFI-Editor`](https://github.com/titonax/UEFI-Editor). Its code was
copied from `master` at commit `462300f` and then refactored in place; it is not
a parallel demo application.

## Current capabilities

- Accepts a complete Aptio IV image and recursively inspects FV/FFS,
  EFI/Tiano/LZMA compression, Setup HII, AMITSE and SetupData.
- Accepts the four extracted Aptio V artefacts used by the original editor.
- Builds a GUID-aware `FormSet → Form → Ref target` graph, including duplicate
  FormIds, detached graphs, cycles and broken references.
- Separates `SuppressIf` hiding from `GrayOutIf`/`DisableIf` availability.
- Reports runtime/HW, access-policy and UI-state evidence without presenting an
  inference as a confirmed fact.
- Limits `Force visible` to `SuppressIf`; other conditions remain read-only.
- Exports validated `data.json` snapshots and controlled Aptio V binary patches.

> Aptio IV reinsertion/export remains disabled until safe volume rebuilding and
> checksum handling are implemented. Analysis is available; generating a BIOS
> that merely _looks_ valid is deliberately not.

## Usage

For Aptio IV, select a complete `.bin`, `.rom` or `.u1l` image. The browser will
inspect it, decompress nested firmware volumes and run IFRExtractor WebAssembly.

For the extracted-file workflow, provide:

1. Setup HII/SCT.
2. Verbose IFRExtractor-RS 1.6.1 output.
3. AMITSE PE32/SCT.
4. SetupData BIN.

The tree uses these states:

| State  | Meaning                                            |
| ------ | -------------------------------------------------- |
| Green  | No active IFR visibility gate was found            |
| Red    | `SuppressIf` can hide the item                     |
| Orange | `GrayOutIf` or `DisableIf` can make it unavailable |
| Gray   | Evidence is insufficient for a stronger conclusion |
| Pink   | The graph contains a broken reference              |

## Development

Requires Node.js 20 or newer.

```bash
npm ci
npm run dev
```

Quality commands:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run check
```

GitHub Pages deployment is intentionally manual. Enable Pages with **GitHub
Actions** as its source in the repository settings, then run the `Build and
deploy static content to Pages` workflow. Pull requests still compile the WASM
toolchain without attempting a deployment.

The automated suite covers hexadecimal bounds, JSON envelopes, condition
semantics, GUID-aware tree construction, broken references, IFR condition
parsing and binary patch preconditions.

## Design rules

- Binary parsing and patching do not call UI functions such as `alert()` or
  reload the page. They return data or throw a typed `FirmwareError`.
- Untrusted offsets and hexadecimal strings are validated before mutation.
- Binary changes are built by pure functions before any download is started.
- UI labels distinguish proven structure from inferred runtime behaviour.
- VarStore and Form identities are scoped by FormSet GUID whenever possible.
- New behaviour requires a regression test, especially for malformed input.

See [architecture](docs/architecture.md) and
[contributing](CONTRIBUTING.md) for the module boundaries and review checklist.

## Credits

Based on [BoringBoredom/UEFI-Editor](https://github.com/BoringBoredom/UEFI-Editor)
and its Aptio V workflow. Aptio IV support and HII visibility semantics were
developed in `titonax/UEFI-Editor`.
