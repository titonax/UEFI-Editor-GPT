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
| Full-image writing        | Blocked until each enclosing container can be rebuilt and independently verified                    |

PhoenixBIOS legacy FFV, Phoenix SecureCore hybrids and Phoenix UEFI/HII are
tracked separately. A shared vendor string is not evidence that they share a
Setup format or reconstruction path.

## 0. Transactional change queue

Status: complete.

Route every editor action through one vendor-neutral plan before adding more
writers. The source buffers remain immutable until export.

- Represent each semantic operation together with its target, expected source
  bytes, fixed-size replacement spans, dependencies and declared conflicts.
- Let the user select or pause individual operations, remove any operation,
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
application invalidation, dependency, conflict, overlap, stale-state,
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

Build edited PI artefacts from leaves back to the original image.

- Add deterministic EFI/Tiano and LZMA encoders.
- Merge edits that share decoded ancestors.
- Rebuild section, FFS and FV size/checksum fields and preserve erase padding.
- Initially require every rebuilt payload to fit its original allocation.
- Re-extract the completed image and verify requested edits and untouched
  boundaries.

Exit gate: a complete UEFI image can be downloaded, re-opened and shown to
contain exactly the requested HII edit.

## 7. Complete AMI Aptio IV/V output

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

- Reinsert the currently exportable modified HII modules into their owning FFS
  files using the generic UEFI builder.
- Investigate Phoenix/Lenovo registration for FormSet roots without parent Refs.
- Distinguish runtime-visible roots from merely present HII FormSets.
- Feed any discovered runtime navigation callbacks or variables into the
  controlled behavior layer.

Exit gate: the Lenovo P53 sample can produce and re-read a complete image with a
validated menu edit; unresolved root registration remains explicitly blocked.

## 9. Compatibility corpus and the 90% target

Measure separate denominators for recognition, extraction, resolved names,
coherent navigation, module editing and complete-image output. Expand coverage
across AMI Aptio IV/V, Phoenix 4.0/TrustedCore, Phoenix SecureCore, Insyde,
Award, servers and modern laptops. Never report recognition as write support.

Exit gate: the dashboard can state exactly what the 90% target measures and
list the blocker for every unsupported case.

## 10. Product hardening

- Pre-save risk, space, compression and affected-region report.
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
