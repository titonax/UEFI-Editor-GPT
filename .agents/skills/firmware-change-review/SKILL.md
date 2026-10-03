---
name: firmware-change-review
description: Review UEFI Editor parser, visibility, move, compression and reconstruction changes against structural evidence. Use before a firmware behavior PR or when investigating an unsafe or unsupported write path.
---

# Firmware change review

1. Read `AGENTS.md`, `CONTRIBUTING.md`, `docs/architecture.md` and the changed
   family's research record from the repository root. Inspect the actual diff
   and its related case/test links; do not accept a prior summary as proof.
2. Identify the exact input/decoded context, ownership, offsets, allocation and
   expected original bytes affected. Require bounds checks and coherent
   provenance; keep repeated module GUIDs separate. Ensure malformed or stale
   evidence rejects the operation without partially mutating the source.
3. Check family and generation confidence. Ensure case/brand similarity cannot
   promote a detector result, enable an editor action or unlock reconstruction.
   Keep explicit hiding separate from runtime/HW conditions and menu order
   stable. Require unique existing targets and supported Ref opcodes for moves.
4. For writing, verify every enclosing format boundary, compression processor,
   size constraint and checksum requirement. Require deterministic codec round
   trips, independent full-image re-extraction and requested-edit verification.
   Keep unsupported compression, allocation growth and capsule output blocked.
   For a complete SPI input, require complete SPI output and byte-identical
   preservation of Descriptor, ME, GbE and every non-BIOS region.
5. Inspect positive and negative regressions for the changed behavior. Test
   malformed bounds, contradictory identities, ambiguous ownership and stale
   byte preconditions where relevant. Identify which tests are synthetic and
   which exact real inputs were rerun. Do not equate re-open success with a
   physical flash test or claim broad compatibility from one sample.
6. Run `npm run check` after the final changes. Do not lower coverage thresholds,
   remove guards or silently skip failures. Review metadata-only exports for
   accidental source/decoded firmware bytes or identifying user data.
7. State concrete findings, changed behavior, validation and remaining blockers
   in the PR. Record governed decisions in repository docs and work state in
   the PR. Keep the PR reviewable; merge/deploy only within explicit scope.
