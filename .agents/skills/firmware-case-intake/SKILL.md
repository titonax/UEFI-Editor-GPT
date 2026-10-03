---
name: firmware-case-intake
description: Investigate unfamiliar firmware and record reviewed metadata-only cases in UEFI Editor. Use for new BIOS samples, unrecognized containers, structural regressions or case-catalogue updates.
---

# Firmware case intake

1. Read `AGENTS.md`, `docs/knowledge/README.md` and the relevant family record.
   Resolve these paths from the repository root. Inspect the actual authorized
   input locally; record its exact SHA-256 and size before extraction.
2. Distinguish outer archives/updaters, capsules, complete Intel SPI images,
   BIOS-only images and extracted module bodies. Record the analyzed input's
   identity, never substitute an archive hash for its firmware payload hash.
3. Run the existing bounded family/container inspector. Keep confirmed,
   probable, conflicting and unresolved evidence separate. Do not infer Aptio
   IV/V from classic GUIDs, FFS3, `$SPF`, file extensions or branding alone.
4. Record outer FV/FFS counts separately from recursively extracted contexts.
   Keep repeated Setup contexts and companion provenance separate. Treat an
   absent outer Setup GUID as unmeasured inner Setup, not proof of absence.
   For legacy Phoenix, AMIBIOS8 and Award, use their own inventories; do not
   call the AMI HII parser on an incompatible format.
5. Compare `src/knowledge/cases/` by exact hash first. Keep byte-identical inputs
   as filename aliases. Use structural matches only as investigation leads;
   report missing measurements, contradictions and multiple candidates.
6. Add or update a `FirmwareCase` only from reviewed evidence. Use a stable
   kebab-case ID, verified hash/size, observed fields, primary source record,
   related existing regression tests and explicit limitations. Leave unknown
   measurements absent, retaining measured zero and false. Keep probable
   generation assessments probable. Do not invent write readiness.
7. Link detailed measurements and acceptance results in the source research
   record. Distinguish external-tool observations, synthetic regressions,
   reproduced browser results and physical flashing. Never commit firmware
   bytes, decoded modules, identifying NVRAM, serials or local user paths.
8. Run the knowledge and affected format tests, then `npm run check` before
   opening a PR. Report evidence added and blockers retained. No automatic
   learning, external memory runtime or new parser rule follows from a case
   resemblance; format changes require independent structural proof.
