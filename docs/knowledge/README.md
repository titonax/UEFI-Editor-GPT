# Firmware knowledge foundation

The knowledge layer versions observations of exact samples separately from
format rules and the current parser's conclusions. It uses metadata already
reviewed in this repository. Firmware bytes remain local.

## Contracts

`src/knowledge/schema.ts` defines independent knowledge and fingerprint schema
versions, currently `1.0.0`:

- `FirmwareCase`: one SHA-256, exact input size, filename aliases, optional
  manufacturer, partial structural observations, generation confidence, source
  research record, related regression tests and explicit limitations.
- `FirmwareFingerprint`: optional image hash and size plus measured structural
  fields. The canonical `structuralKey` is a versioned JSON observation key,
  **not** a cryptographic firmware identity. It is independent of file names,
  brands, offsets and object-property insertion order. Different measurement
  sets produce different keys; this is not a format signature.
- `FirmwareCaseMatchResult`: exact identity, structural investigation leads,
  novelty relative to this catalogue, insufficient evidence or contradiction.
  It has no editing/reconstruction authorization fields.

`fingerprintFirmwareImage` adapts the existing read-only preflight inspector.
It excludes unconfirmed/conflicting family evidence and does not fabricate HII
counts from an outer scan. In particular, no outer Setup GUID does not mean no
Setup inside a compressed volume. Context HII/navigation measurements can be
supplied separately with `createFirmwareFingerprint`; callers must keep their
context ownership coherent.

Unknown fields are omitted. Zero and false retain their measured meanings.
Malformed hashes, negative/fractional structural counts, invalid input sizes
and unsupported fingerprint versions are rejected.

## Matching policy

An exact SHA-256 takes precedence. A single exact identity is `known` even when
structure has not been measured; size or measured-structure contradictions
produce `conflict`. Duplicate exact records also produce `conflict`.

Without an exact identity, structural leads require four matching measured
fields, including at least one field beyond generic family/container/descriptor
evidence, and no contradiction on any jointly measured field. Unmeasured case
fields remain listed as missing evidence. The four-field threshold is a
conservative investigation heuristic, not a calibrated probability or proof of
architecture. Image size is not a structural similarity criterion.

All eligible leads are retained and sorted by matched-field count, missing-field
count and stable case ID. No first-match winner is invented. `novel` means
sufficient measurements found no eligible lead in this catalogue; a new hash
alone produces `insufficient-evidence`. A sparse catalogue record may not have
enough evidence for similarity. The matcher never replaces detection, controls
an edit button or unlocks writing.

## Initial records and migration

The catalogue has 17 unique input hashes:

| Group                        | Records | Source                                                                              |
| ---------------------------- | ------: | ----------------------------------------------------------------------------------- |
| Existing brand observations  |      15 | HP, Supermicro, cross-vendor AMI, Intel NUC, ASUS hubs, AMIBIOS8 and Award records  |
| Nested AMI image2 regression |       1 | `docs/ami/sample-corpus.md`; image3 is an identical alias                           |
| Phoenix Acer Z03             |       1 | `docs/phoenix/setup-menu.md`; reconstruction acceptance in `docs/phoenix/README.md` |

`brandKnowledge.ts` now derives its 15 branded observations from these cases.
Its existing precedence, navigation priors and confirmed-generation counts are
preserved. Migration also repairs the Sabertooth Z97 hash: the old brand table
had a 65-character transcription error; the source research record contains
the valid 64-character SHA-256 now used by both catalogues. Intel's probable Aptio V assessment remains probable. The unnamed
image2 image has no guessed manufacturer. Acer remains identified in its case
label; expanding the supported brand selector is a separate UI change.

Cases link to related behavior tests, not to committed firmware fixtures or a
claim that every historical sample was rerun. Catalogue tests verify unique
IDs/hashes, source hashes and existing regression paths. Historical research
can predate current parser support; limitations must retain that distinction.
The source docs remain the authority for detailed offsets and observations.

## Working procedures and origin

`AGENTS.md` points to the repository's two focused skills for sample intake and
firmware change review. These are project-local procedures committed with the
code, not installed personal ChatGPT skills. Existing architecture and sample
records provide durable project memory; active work stays in PRs.

This organization adapts the separation of concise instructions, focused skills
and durable context described by [affaan-m/ECC](https://github.com/affaan-m/ECC),
formerly Everything Claude Code. The procedures are written for this firmware
project. No ECC runtime, library, hooks, MCP service or agent framework is
imported into the frontend, and no upstream code is copied.

## Integration sequence

1. **Foundation (this change):** repository instructions/skills, typed cases,
   preflight fingerprints, conservative matching and regression tests. The
   brand catalogue consumes the shared metadata immediately.
2. **Corpus integration:** attach measured fingerprints and known/similar/novel
   results to CorpusRunner reports, keep diagnostic blockers separate, version
   report exports and extend the dashboard.
3. **Reviewed case intake:** add the metadata-only Add case flow, `case.json`,
   a local `npm run case:add` command and CI validation before new evidence is
   shipped. No automatic case learning.
4. **Rule registry:** connect explicit format rules to reviewed cases, tests and
   implementations. Keep case resemblance separate from rule preconditions.

Later agent orchestration is outside these four changes. The new matcher is not
yet called by CorpusRunner or shown in the UI; that is the next integration PR.
