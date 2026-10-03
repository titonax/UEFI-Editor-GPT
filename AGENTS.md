# UEFI Editor working instructions

Read `CONTRIBUTING.md` and `docs/architecture.md` before changing the pipeline.
Use `docs/roadmap.md` for supported paths and `docs/knowledge/README.md` for
the knowledge integration phases. Keep changes on a focused branch and open a
reviewable PR after checks. Do not merge or deploy implicitly.

## Repository map

- `src/components/scripts/`: bounded format parsers, editing and reconstruction.
- `src/components/`: React orchestration and local Worker UI.
- `src/knowledge/`: reviewed sample metadata, fingerprints and case matching.
- `docs/ami/`, `docs/aptio-iv/`, `docs/phoenix/`, `docs/award/`: source evidence.

Use repository skills only when the task needs them:

- `.agents/skills/firmware-case-intake/SKILL.md`: add a sample or investigate
  an unfamiliar image/container without inventing unsupported results.
- `.agents/skills/firmware-change-review/SKILL.md`: review a parser, editor,
  codec or full-image reconstruction change.

## Durable evidence

Keep sample identities in `src/knowledge/cases/` and research in the linked
source records. Preserve hashes, aliases, evidence confidence, limitations and
regression links. Case observations and hypotheses are not parser rules.
Never use brand, extension, an earlier conversation or a similar case to
promote firmware family, generation, navigation or write readiness.

Unknown observations stay absent. Zero and false are measured results. Keep
outer-image counts separate from extracted-context HII counts. Keep repeated
Setup contexts separate and choose companions only from coherent provenance.

Commit metadata only: no firmware binaries, decoded modules, identifying NVRAM,
serial numbers, secrets or user-specific local paths. Version decisions in
repository docs and active work in PRs; do not add external memory services,
automatic learning, hooks or agent runtimes to the browser application.

## Binary boundaries

Retain the invariants in `docs/architecture.md`. Never weaken a precondition to
make a sample pass. Preserve graph identity and source ownership; distinguish
explicit hiding from runtime/hardware conditions. Preserve physical menu order.
Move only between existing Forms/FormSets with proven supported opcodes.

For full-image output, require bounded provenance, allocation fit, checksum
repair as required by the format, independent re-extraction and requested-edit
verification. Return a complete SPI image for complete SPI input, preserving
every byte outside its BIOS region (including Descriptor, ME and GbE). Capsule
output remains out of scope. Keep unsupported compression and legacy write
paths explicitly blocked. Re-open validation is not physical flash validation.

## Validation

Use Node >=20 and npm >=10. Install exact dependencies with `npm ci`. Add
meaningful positive and negative regressions for changed binary or matching
behavior, then run `npm run check`; it includes formatting, lint, coverage,
typecheck and production build. Do not lower coverage thresholds or remove
guards to get green checks. State which tests are synthetic and which results
were reproduced on real firmware. Report remaining unsupported paths in the PR.
