# UEFI Editor GPT

Web editor for analysing AMI Aptio IV/V HII and IFR structures. It builds the
menu hierarchy from `FormSet`, `Form` and `Ref` relationships, explains the
evidence behind visibility decisions, and prepares controlled Aptio V changes.

This repository is the quality-focused working copy of
[`titonax/UEFI-Editor`](https://github.com/titonax/UEFI-Editor). Its code was
copied from `master` at commit `462300f` and then refactored in place; it is not
a parallel demo application.

## Current capabilities

- Accepts a complete AMI UEFI image, reports container and Aptio evidence without
  forcing an IV/V label, and recursively inspects FV/FFS, EFI/Tiano/LZMA
  compression, Setup HII, AMITSE and SetupData locally during the read-only
  preflight.
- Retains the exact source-buffer, encapsulation-section and owning-FFS path for
  each extracted artefact, while keeping full-image writing disabled until every
  reconstruction invariant is available.
- Enumerates repeated Setup/AMITSE/SetupData contexts by decoded buffer and
  firmware volume. Multi-slot images require an explicit local context choice;
  equally plausible modules are never combined by GUID alone.
- Builds a GUID-aware `FormSet → Form → Ref target` graph, including duplicate
  FormIds, detached graphs, cycles and broken references.
- Detects single-FormSet IFR navigation hubs, lists their direct Ref tabs in
  firmware order, and separates them from AMITSE-registered descendants or
  registered-only pages.
- Gives single-FormSet tabs separate **Hide**, **Show** and **Move** actions.
  Hide/Show parks or restores the existing Ref through a proven constant-true
  `SuppressIf` scope without changing the HII size or its remembered tab position.
- Provides a resizable menu-tree pane with remembered width and full labels for
  wide or deeply nested HII hierarchies.
- Records binary IFR opcode offsets, lengths, nested scopes and owning
  Form/FormSet identities as the foundation for structural menu editing.
- Inventories every existing destination Form, including hidden or detached
  entries, and classifies moves as safe, requiring `REF3` conversion or
  unavailable before editing.
- Moves a complete direct IFR `Ref` between existing Forms and proven Forms
  Packages without changing the Setup HII size. Cross-package moves rebalance
  package and Package List lengths transactionally. Each move is replayable,
  precondition-checked and included in Aptio V export.
- Separates `SuppressIf` hiding from `GrayOutIf`/`DisableIf` availability.
- Reports runtime/HW, access-policy and UI-state evidence without presenting an
  inference as a confirmed fact.
- Limits `Force visible` to `SuppressIf`; other conditions remain read-only.
- Shows the original code-corroborated AMITSE root state separately from a
  reversible desired `Visible (01)` / `Hidden (00)` state. Root changes are
  saved as provenance-bound pending plans and reflected in the menu tree.
- Exports validated `data.json` snapshots and controlled Aptio V binary patches.
- Runs a multi-file compatibility corpus entirely in a browser Worker, analyses
  every coherent firmware context sequentially, and exports metadata-only JSON
  and CSV reports with per-layer results and exact edit blockers. The corpus
  also distinguishes Aptio from other UEFI/legacy families and standalone
  firmware components when the bytes provide sufficient evidence.

> Full-image reinsertion/export remains disabled until deterministic
> recompression, bottom-up rebuilding, checksum handling and independent
> re-extraction verification are implemented. Artifact-level Aptio V export is
> separate. Generating a BIOS that merely _looks_ valid is deliberately not.

## Usage

For a complete AMI image, select the firmware regardless of its filename
extension. The browser performs the deep, read-only FV/FFS extraction and
IFRExtractor WebAssembly analysis locally, then explains its evidence and the
captured reconstruction path. Press **Start HII analysis** to open the already
analysed menu tree. Shared Setup, AMITSE, NVAR and FFS structures are not treated
as proof of Aptio IV or V; unresolved images remain clearly marked and
full-image export stays disabled. If several coherent firmware contexts are
present, select the intended slot before starting the HII tree.

The tree uses these states:

| State  | Meaning                                              |
| ------ | ---------------------------------------------------- |
| Green  | No active IFR gate, or desired root state is visible |
| Red    | `SuppressIf` or the AMITSE root vector hides it      |
| Orange | `GrayOutIf` or `DisableIf` can make it unavailable   |
| Gray   | Evidence is insufficient for a stronger conclusion   |
| Pink   | The graph contains a broken reference                |

To move a submenu, use the move button on its tree row and choose the new parent
Form. Direct, non-scoped `Ref` opcodes may cross existing Forms Packages when
the destination is structurally proven; package lengths are then rebalanced
transactionally. Duplicate targets, graph cycles and conditional/nested
references remain blocked with an explanation.

For a detected single-FormSet navigation hub, its direct children are the
current IFR tabs. **Hide** moves a direct Ref into an already proven
constant-true `SuppressIf`; **Show** returns it to the hub; **Move** places it
under another existing Form and keeps it reachable there. The inventory updates
from the pending graph. AMITSE registration is shown as corroborating evidence,
not treated as proof that a page is a top-level tab.

For a detected multi-FormSet root vector, press the desired-state button beside
any root to alternate between `Visible (01)` and `Hidden (00)`. The original BIOS
state remains visible beside it. Pressing the button back to the original value
removes that pending change. These plans are included in `data.json`, but
full-image export remains blocked until reconstruction can apply and verify them.

For compatibility measurement, use **Local firmware corpus runner** on the
landing page and select several complete images. The runner processes one image
at a time in a Web Worker, hashes it locally, analyses every coherent Setup
context and reports extraction, HII, navigation, editability and reconstruction
as separate stages. Percentages therefore keep their denominators visible:
navigation and HII edit rates are measured only among successfully extracted
images. The JSON report preserves the detailed evidence; the CSV contains a
flat per-image summary. Neither export contains firmware bytes.

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
npm run test:coverage
npm run build
npm run check
```

GitHub Pages deployment is intentionally manual. Enable Pages with **GitHub
Actions** as its source in the repository settings, then run the `Build and
deploy static content to Pages` workflow. Pull requests still compile the WASM
toolchain without attempting a deployment.

The automated suite covers hexadecimal bounds, deep JSON validation, SetupData
and AMITSE discovery, text and binary IFR parsing, condition semantics,
GUID-aware tree construction, broken references and binary patch preconditions.
Coverage thresholds are enforced by `npm run check` and pull-request CI.

The application release is `0.5.0`; exported `data.json` files use schema
`0.7.0`. Those versions are independent so application releases do not
unnecessarily invalidate saved editor state.

## Design rules

- Binary parsing and patching do not call UI functions such as `alert()` or
  reload the page. They return data or throw a typed `FirmwareError`.
- Untrusted offsets and hexadecimal strings are validated before mutation.
- Binary changes are built by pure functions before any download is started.
- UI labels distinguish proven structure from inferred runtime behaviour.
- VarStore and Form identities are scoped by FormSet GUID whenever possible.
- New behaviour requires a regression test, especially for malformed input.

See [architecture](docs/architecture.md) and
[AMI comparison corpus](docs/ami/sample-corpus.md) for the evidence model,
[local corpus runner](docs/ami/local-corpus-runner.md) for the report schema and
compatibility denominators,
[mixed firmware intake](docs/ami/mixed-firmware-intake.md) for the measured
results from the three supplied archives,
[manufacturer evidence catalogue](docs/ami/manufacturer-knowledge.md) for
brand-based investigation leads and their limits,
[root visibility analysis](docs/ami/root-visibility-vector.md) for the
multi-FormSet byte-vector invariants,
[single-FormSet IFR navigation](docs/ami/single-formset-ifr-navigation.md) for
the hub/tab/registration invariants,
[full-image reconstruction](docs/ami/full-image-reconstruction.md) for the
read/write safety boundary, and
[contributing](CONTRIBUTING.md) for the module boundaries and review checklist.

## Credits

Based on [BoringBoredom/UEFI-Editor](https://github.com/BoringBoredom/UEFI-Editor)
and its Aptio V workflow. Aptio IV support and HII visibility semantics were
developed in `titonax/UEFI-Editor`.
