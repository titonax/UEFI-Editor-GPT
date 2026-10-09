# UEFI Editor development roadmap

This roadmap is ordered by technical dependency, not by firmware brand. A phase
is complete only when its exit gate passes against a real sample and an
independent re-read. Recognizing a format, editing an extracted module and
producing a flashable image are separate capabilities.

## Current baseline

| Capability                | Current state                                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------------------- |
| AMI Aptio IV/V analysis   | HII/IFR extraction, visibility classification and menu graph available                              |
| AMI module editing        | Validated Hide, Show and Ref moves available for supported layouts                                  |
| Vendor-neutral UEFI HII   | Multi-module tree plus validated Hide, Show and same-module moves available                         |
| Phoenix legacy reading    | FFV inventory, bounded LH5 decoding, strings, root screens, submenus and unlinked screens available |
| Phoenix behavior analysis | Bounded static x86-16 callback tracing available                                                    |
| Transactional editing     | Shared selectable queue gates AMI, UEFI HII and Phoenix exports                                     |
| Full-image writing        | Phoenix legacy, fixed-size uncompressed UEFI paths and exact accepted LZMA/Tiano sources            |

PhoenixBIOS legacy FFV, Phoenix SecureCore hybrids and Phoenix UEFI/HII are
tracked separately. A shared vendor string is not evidence that they share a
Setup format or reconstruction path.

## 0. Transactional change queue

Status: complete.

Route every editor action through one vendor-neutral plan before adding more
writers. The source buffers remain immutable until export.

- Represent each semantic operation together with its target, expected source
  bytes, fixed-size replacement spans, dependencies and declared conflicts.
- Let the user select or pause individual operations, reorder or remove any operation,
  clear the queue and explicitly apply the selected plan.
- Analyze the complete selection for stale source bytes, missing dependencies,
  conflicts and overlapping patches before it can be applied.
- Deduplicate identical physical patches and report the resulting byte, span
  and buffer count.
- Invalidate an applied plan after any queue mutation; export only the exact
  fingerprint that passed analysis.
- Use the common planner and queue dialog for Phoenix, AMI Aptio and
  vendor-neutral UEFI HII actions before extending any write path.

Exit gate: Phoenix, AMI Aptio and vendor-neutral UEFI HII edits use the shared
queue end to end. Automated coverage includes selection, removal, clearing,
application invalidation, reordering, dependency, conflict, overlap, stale-state,
deduplication and cancellation behavior.

## 1. Phoenix legacy module editor

Expose the already verified visibility-callback patch in the Phoenix workspace.

- Stage Show operations only for callbacks whose prologue and hide return have
  both been structurally verified.
- Restore the original hide value by removing the staged edit.
- Keep items with no verified callback, or no proven hidden value, disabled with
  an explanation.
- Add change count, reset and `TEMPLAT00.ROM` plus changelog download.
- Keep source bytes immutable and apply all patches transactionally at export.

Exit gate: the Acer Z03 can produce a PBE-compatible `TEMPLAT00.ROM` whose
changes match the previously hardware-verified callback patch.

## 2. LH5 encoder and Phoenix FFV reconstruction

Status: complete for fixed-allocation Phoenix FFV TEMPLAT edits. The optimized
LZSS/Huffman encoder, FFV writer and frontend full-image download are covered by
independent-reader round trips. The real modified Z03 template compresses to
13,074 bytes inside its 13,112-byte allocation.

Complete the write half of the existing bounded LH5 reader and remove the PBE
dependency.

- Implement a deterministic raw `-lh5-` encoder behind a small codec interface.
- Require `decompress(compress(modified))` to reproduce the modified module
  exactly.
- Rebuild the Phoenix compressed section and FFV module without touching
  unrelated allocations.
- Initially reject output that exceeds the original packed allocation.
- Preserve alignment and padding and repair only proven size/check fields.
- Re-read the complete result with the independent Phoenix inventory and Setup
  parser.

Exit gate: a complete rebuilt Z03 image re-extracts successfully, contains the
requested logical change and preserves every byte outside the proven module
path.

Verified: the 1 MiB Z03 result re-opened with 34 modules, no inventory warnings,
24 Setup screens and the requested `Cache Ram` visibility immediate set to zero;
all bytes outside the 13,112-byte compressed allocation remained identical.

## 3. Phoenix structural menu editing

Edit verified pointer directories rather than model-specific offsets.

- Register or unregister screens in an existing root or submenu directory.
- Move a screen only between proven existing parents.
- Preserve original order for reversible Hide/Show operations.
- Keep registered roots, linked submenus, unlinked screens and inferred groups
  as distinct states.
- Permit only fixed-size edits or growth into explicitly proven free space.

Exit gate: reproduce the Acer 5735 `Advanced2` workflow without hard-coded Acer
offsets and rebuild it through the phase-2 writer.

## 4. Controlled Phoenix callback execution

Extend static tracing with a bounded, deterministic 8086 execution state.

- Model registers, flags, segments, stack and private memory.
- Stop visibly on unsupported instructions, indirect transfers, interrupts or
  undeclared I/O.
- Represent known Phoenix helper calls as explicit, testable adapters.
- Supply hardware, Setup and runtime reads through named scenario inputs.
- Compare multiple scenarios and explain which input changes visibility.

Exit gate: a verified callback produces the expected visible and hidden outcome
under two controlled scenarios without executing firmware against host state.

## 5. Case-driven generalization

- Record semantic callback patterns rather than absolute offsets.
- Classify variable, hardware, access, helper-call and unresolved dependencies.
- Mark every rule as specification-backed, multi-sample, vendor-specific or
  sample-specific.
- Feed new cases through the local corpus before promoting a heuristic.

Exit gate: at least two independent images exercise each generalized Phoenix
rule, or the UI labels the rule as sample-specific.

## 6. Generic UEFI reconstruction engine

Status: in progress. Fixed-size uncompressed PI paths now rebuild bottom-up,
repair affected FFS checksums, preserve all unowned bytes and re-open AMI
artefacts before download. Intel SPI inputs retain Descriptor, ME, GbE and every
non-BIOS byte exactly; BIOS-only inputs remain BIOS-only. Output is always
`.bin`, never a rebuilt capsule.

The compressed-section codec boundary has synthetic round-trip, provenance,
growth, shrink and rejection tests. A terminal section can change packed size
within its declared FFS when the remaining space is proven untouched, uniform
erase padding. A section that ends at its FFS boundary may also shrink when
the FV header and alignment bytes prove the erase polarity. FFS allocation and
overall image size stay fixed. Exact LZMA and Tiano sources have real-sample
acceptance; the Tiano acceptance verifies complete SPI output with untouched
Descriptor/ME bytes.

LZMA1-alone and EFI/Tiano encoders are connected behind that boundary. EFI and
Tiano selection is verified against the original decoded stream; synthetic
round trips cover both EDK II compression variants. The UI still blocks
compressed paths except the exact sources and artifact scopes recorded in
[`compressed-output-acceptance.md`](ami/compressed-output-acceptance.md) and
[`tiano-spi-output-acceptance.md`](ami/tiano-spi-output-acceptance.md). The latter
also has [combined SetupData acceptance](ami/tiano-setupdata-output-acceptance.md),
including preservation of AMITSE in their shared decoded ancestor. A real
[same-package Ref move](ami/tiano-ref-move-output-acceptance.md) also passes the
normal editor, full SPI rebuild and independent binary/text reread. The EFI
variant and mixed compressed ancestors are still awaiting acceptance. An exact
[nested-volume LZMA SPI source](ami/nested-lzma-spi-output-acceptance.md) now also
passes Setup HII output through an outer compressed FV and inner uncompressed
encapsulation, including inner/outer FFS checksums and untouched Descriptor/ME.
Its separate [SetupData and combined-queue acceptance](ami/nested-lzma-setupdata-output-acceptance.md)
now verifies both inner FFS repairs before one shared LZMA recompression. Its [root and structural queue acceptance](ami/nested-lzma-root-queue-output-acceptance.md)
also verifies a same-package Ref move and a fitting four-operation queue with a
freshly derived eight-entry root vector. Root-only output can still exceed its
compressed allocation and is rejected; AMITSE editing remains blocked.

The Pages build also checks [nested browser codec integration](ami/mixed-browser-codec-integration.md)
with actual WASI assets for LZMA/EFI and LZMA/Tiano in both nesting directions.
These four synthetic full-SPI tests verify fresh decoding, both checksum layers,
untouched regions and allocation-overflow rejection. They do not grant EFI or
mixed-chain real-source acceptance.

Build edited PI artefacts from leaves back to the original image.

- Validate deterministic EFI/Tiano and LZMA output against real images.
- Merge edits that share decoded ancestors.
- Rebuild section, FFS and FV size/checksum fields and preserve erase padding.
- Initially require every rebuilt payload to fit its original allocation.
- Re-extract the completed image and verify requested edits and untouched
  boundaries.
- For a complete SPI input, rebuild only inside the descriptor-declared BIOS
  region and return the complete same-size SPI image.
- Do not generate capsules or modify Descriptor, ME, GbE, EC or other flash
  regions.

Exit gate: a complete UEFI image can be downloaded, re-opened and shown to
contain exactly the requested HII edit.

## 7. Complete AMI Aptio IV/V output

One exact Tiano SPI source also has [root-vector output acceptance](ami/tiano-root-visibility-output-acceptance.md).
The normal queue and complete-image builder can export a code-corroborated root
visibility edit, with fresh source evidence and full-vector verification after
reopening. A [real four-operation queue](ami/tiano-combined-queue-acceptance.md)
also verifies movement, HII, SetupData and root changes in one SPI output, plus
a coherent combination rejected for compressed allocation growth. Extracted-file export and root output for other sources remain blocked.

- Apply SuppressIf edits, Ref moves and proven root-visibility vectors through
  the generic UEFI builder.
- Support nested volumes and multiple coherent Setup contexts without silently
  choosing one.
- Complete Aptio V first, then the more varied Aptio IV reconstruction paths.
- Treat authenticated capsule resigning and flash-region changes as separate
  capabilities.

Exit gate: corpus-backed complete images pass full re-extraction and binary
boundary verification for each supported compression/layout class.

## 8. Complete Phoenix UEFI/HII output

- Internal reconstruction now reinserts several modified HII modules through
  direct FFS ownership or proven uncompressed encapsulation into a raw PI image
  or complete Intel SPI, with fresh ownership, inner/enclosing checksum repair
  and independent full-image HII comparison.
  [Builder and frontend lifecycle evidence](phoenix/uefi-hii-image-builder.md)
  covers explicit check, allocation/copy report and cached full-image download.
- [P53 real-source acceptance](phoenix/p53-mirrored-lzma-output-acceptance.md)
  now verifies one queued Setup Ref move in both physical LZMA copies of the
  complete SPI, with 22,320 packed bytes remaining in each original allocation
  and byte-identical non-BIOS regions. Acceptance is hash/size/Setup-FFS specific;
  other Lenovo drivers and generic compressed sources remain blocked.
- Mixed direct/nested carriers now use isolated views throughout editor planning
  and replay, with owned-package changes overlaid onto their immutable original
  bodies. Combined parent/child reconstruction has synthetic raw/SPI evidence for
  complete identity-only paths, including queued Ref move + Show, enclosing
  checksums, nested headers/padding and independent all-buffer verification.
  Only verified full-image download is offered for mixed workspaces. Real mixed
  source acceptance, compressed mixed paths and mixed package rebalancing remain
  pending. Packages crossing FFS boundaries or lying in nested FV free space
  cannot be reassigned to the outer carrier.
- FormSet entry evidence now retains every parsed declaration separately from
  graph roots, including entries reached by cross-FormSet Refs. The read-only
  table reports current static incoming edges, missing/ambiguous identities and
  unproven runtime registration/visibility. The exact P53 source contains 11
  parsed FormSet entries, none with an incoming static Ref; this does not prove
  which firmware menus appear. See [root evidence](phoenix/uefi-hii-root-evidence.md).
- Investigate Phoenix/Lenovo registration for FormSet roots without parent Refs.
- Prove runtime-visible roots separately from merely present HII FormSets.
- Feed any discovered runtime navigation callbacks or variables into the
  controlled behavior layer.

Exit gate: the exact Lenovo P53 sample now produces and re-reads a complete image
with one validated Ref move. The editor download lifecycle is integrated and covered
by synthetic frontend tests plus opt-in real-source React/jsdom acceptance using
the actual editor, queue, codecs, builder and captured download. Real Firefox
user-flow verification remains pending;
unresolved runtime root registration remains explicitly blocked.

## 9. Compatibility corpus and the 90% target

Measure separate denominators for recognition, extraction, resolved names,
coherent navigation, module editing and complete-image output. Expand coverage
across AMI Aptio IV/V, Phoenix 4.0/TrustedCore, Phoenix SecureCore, Insyde,
Award, AMIBIOS8 legacy, servers and modern laptops. Never report recognition as
write support. AMIBIOS8 and Award Legacy recognition are now structurally
confirmed; their module/Setup editing remain separate future parser paths. The
eMachines EL1200 case additionally inventories 23 bounded LHA members.

Exit gate: the dashboard can state exactly what the 90% target measures and
list the blocker for every unsupported case.

## 10. Product hardening

- Pre-save risk, space, compression and affected-region report: the AMI footer
  checks the complete applied queue before download and reports verified packed
  sizes, section capacity, source allocation bounds and preserved non-BIOS bytes.
  Results are invalidated when the applied state or source changes.
- Original/modified comparison and history-based undo/redo above the
  transactional queue.
- Portable project/session export with schema migration.
- Recovery and flashing documentation per supported family.
- Stable release only when each write path has an independent reconstruction
  test and a real-sample acceptance record.

## Execution order

Work proceeds in the numbered order above. Cross-cutting refactors are accepted
only when required by the active phase and must retain the parser/editor/UI
module boundaries documented in [architecture.md](architecture.md).
