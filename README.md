# UEFI Editor GPT

Local browser editor for AMI Aptio IV/V, vendor-neutral UEFI HII and supported
Phoenix legacy firmware. It explains menu and visibility evidence, stages
transactional edits and rebuilds complete images only through supported,
independently verified output paths.

This repository is the quality-focused working copy of
[`titonax/UEFI-Editor`](https://github.com/titonax/UEFI-Editor). Its code was
copied from `master` at commit `462300f` and then refactored in place; it is not
a parallel demo application.

## Project status

The current priority is closing the supported editing/output circuit and shared
product hardening (phase 10), before expanding the BIOS corpus. The
[roadmap](docs/roadmap.md) defines the work order and the
[release evidence inventory](docs/release-evidence.json) records acceptance by
path. Recognition, editable modules, complete-image output, browser acceptance
and hardware validation are separate capabilities.

| Path                                      | Current accepted scope                                                                                                                                                                                            |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phoenix legacy Z03                        | Proven Show callback, fixed-allocation LH5 rebuild, complete-image download and independent reread; Firefox sessions and undo/redo accepted.                                                                      |
| AMI Tiano                                 | Exact accepted SPI source and documented four-operation HII/SetupData/root queue; Firefox output, v2 sessions, history, selection/order and controlled asynchronous probes accepted within their recorded limits. |
| AMI LZMA                                  | Exact first source's HII suppression flow and exact nested source's combined queue; complete-image output and v2 sessions accepted in Firefox.                                                                    |
| P53 UEFI HII                              | Exact static Setup Ref move with mirrored LZMA reconstruction, full-SPI preservation, Firefox sessions and history; dynamic roots remain blocked.                                                                 |
| AMI uncompressed / mixed uncompressed HII | Reconstruction foundation exists; qualifying real-source and browser acceptance remain pending.                                                                                                                   |

These are exact-source, operation-specific acceptances, not family-wide
compatibility guarantees or a claimed 90% coverage rate. Firefox records use
real headless Firefox; they do not establish a human desktop file-picker flow
or physical flashing.

### What remains

- Finish shared lifecycle hardening and remaining browser gates, including stale
  failures and pending build/checksum boundaries. Controlled native-result timing
  probes have explicit limits; some old operations' complete returns were not
  captured. Synthetic React/jsdom tests do not replace real-browser evidence.
- Retain the missing qualifying-source gates for AMI uncompressed and mixed HII.
  The completed existing-source inventory must not be mistaken for acceptance.
- Complete Phoenix structural menu editing/Advanced2, controlled callback
  execution and multi-image semantic generalization.
- Broaden reconstruction only through separate acceptance work: unsupported EFI
  compression variants, mixed compressed ancestry, allocation growth, AMITSE
  retarget output and capsule output remain blocked. Award and AMIBIOS8 legacy
  remain read-only.
- Keep P53 dynamic-root research and new BIOS acquisition parked under the
  current work order. Phase 9 corpus expansion follows closure of the current
  editing/output circuit.
- Obtain separate hardware/recovery acceptance before claiming it. The stable
  release gate remains blocked by pending evidence.

Complete SPI input requires complete SPI output with every byte outside BIOS
preserved, including Descriptor, ME and GbE. A supported output must fit its
allocation, pass required checksums and survive independent re-extraction and
requested-edit verification before download is enabled.

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
- Inventories PhoenixBIOS 4.0 modular ROMs and identifies Phoenix UEFI SecCore
  provenance separately. Verified legacy visibility callbacks can be staged and
  exported as a PBE-compatible `TEMPLAT00.ROM`; unverified Phoenix edits remain
  disabled.

> Full-image export is available only for supported reconstruction paths and
> their documented accepted scopes. Unsupported codecs, layouts, roots and
> growth remain blocked. Artifact-level export alone does not establish
> complete-image or hardware readiness.

## Usage

For a complete AMI image, select the firmware regardless of its filename
extension. The browser performs the deep, read-only FV/FFS extraction and
IFRExtractor WebAssembly analysis locally, then explains its evidence and the
captured reconstruction path. Press **Start HII analysis** to open the already
analysed menu tree. Shared Setup, AMITSE, NVAR and FFS structures are not treated
as proof of Aptio IV or V; unresolved images remain clearly marked and
full-image export remains gated by reconstruction support and verification. If
several coherent firmware contexts are present, select the intended slot before
starting the HII tree.

For PhoenixBIOS 4.0 modular ROMs, the same image selector displays its module
inventory and opens decoded Setup screens when the template and strings modules
validate. A menu item with a structurally verified non-zero visibility callback
can be staged as visible and exported as `TEMPLAT00.ROM` for replacement and
rebuild in Phoenix BIOS Editor. Supported fixed-allocation LH5 paths also offer
verified complete-image rebuilding; the exact Z03 scope is accepted separately.
Structural directory editing and allocation growth remain blocked. Phoenix UEFI
images show SecCore module evidence and, when standard HII packages are found,
use the vendor-neutral HII workspace.

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
removes that pending change. These plans are included in `data.json`; supported
full-image paths apply and independently verify them. A root plan never unlocks
an unsupported writer.

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

GitHub Pages builds and deploys automatically on pushes to `main` through the
`Build and deploy static content to Pages` workflow. Pull requests compile the
WASM toolchain and run build checks without deploying. A manual workflow trigger
also exists; it is not required for the normal merge/deployment flow.

The automated suite covers hexadecimal bounds, deep JSON validation, SetupData
and AMITSE discovery, text and binary IFR parsing, condition semantics,
GUID-aware tree construction, broken references and binary patch preconditions.
Coverage thresholds are enforced by `npm run check` and pull-request CI.

The application release is `0.5.0`; exported `data.json` files use schema
`0.7.0`. Portable queue sessions use a separate version-2 contract with strict
version-1 migration; they are not editor snapshots. Those versions are independent
so application releases do not unnecessarily invalidate saved editor state.

## Design rules

- Binary parsing and patching do not call UI functions such as `alert()` or
  reload the page. They return data or throw a typed `FirmwareError`.
- Untrusted offsets and hexadecimal strings are validated before mutation.
- Binary changes are built by pure functions before any download is started.
- UI labels distinguish proven structure from inferred runtime behaviour.
- VarStore and Form identities are scoped by FormSet GUID whenever possible.
- New behaviour requires a regression test, especially for malformed input.

See the [development roadmap](docs/roadmap.md), [architecture](docs/architecture.md) and
[AMI comparison corpus](docs/ami/sample-corpus.md) for the evidence model,
[local corpus runner](docs/ami/local-corpus-runner.md) for the report schema and
compatibility denominators,
[mixed firmware intake](docs/ami/mixed-firmware-intake.md) for the measured
results from the three supplied archives,
[Phoenix format investigation](docs/phoenix/README.md) for the modular ROM
directory and the mixed-provider UEFI example,
[manufacturer evidence catalogue](docs/ami/manufacturer-knowledge.md) for
brand-based investigation leads and their limits,
[root visibility analysis](docs/ami/root-visibility-vector.md) for the
multi-FormSet byte-vector invariants,
[single-FormSet IFR navigation](docs/ami/single-formset-ifr-navigation.md) for
the hub/tab/registration invariants,
[full-image reconstruction](docs/ami/full-image-reconstruction.md) for the
read/write safety boundary, and
[contributing](CONTRIBUTING.md) for the module boundaries and review checklist.
See [recovery and release readiness](docs/recovery-and-release.md) for original
backup handling, family-specific output boundaries and the evidence required
before advertising a stable write path. `npm run release:report` lists the
reviewed evidence and pending gates; `npm run release:check` fails while the
tracked release evidence is incomplete.

## Credits

Based on [BoringBoredom/UEFI-Editor](https://github.com/BoringBoredom/UEFI-Editor)
and its Aptio V workflow. Aptio IV support and HII visibility semantics were
developed in `titonax/UEFI-Editor`.
