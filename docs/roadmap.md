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

## Progress at 2026-10-18

PRs #119–#123, #128–#189 and #195–#201 are integrated. This status distinguishes implemented
support from real-source acceptance and remaining runtime evidence; it is not a global
compatibility percentage.

| Phase                            | Status                          | Completed scope / remaining gate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Transactional queue           | Complete                        | Shared AMI, UEFI HII and Phoenix queue, apply/invalidation and verified download lifecycle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 1. Phoenix module editor         | Complete for verified callbacks | Fixed-size Show patches and source-preserving module export; unsupported callbacks stay disabled                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2. Phoenix LH5 / FFV writer      | Complete for fixed allocations  | Real Z03 full-image rebuild, independent reread and deployed Firefox Show/download/reload passed; directory/allocation growth stays blocked                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 3. Phoenix structural menus      | Pending                         | Reading roots/submenus is available; generic directory editing and the Advanced2 exit gate are not complete                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 4. Controlled callback execution | Partial                         | Bounded static tracing exists; deterministic 8086 execution with scenario inputs is pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 5. Case generalization           | Partial                         | Reviewed knowledge/corpus/intake foundation exists; multi-image semantic callback rules remain pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 6. Generic UEFI reconstruction   | Partial                         | Fixed uncompressed paths and exact accepted LZMA/Tiano sources work; EFI variant and real mixed compressed ancestry acceptance remain pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 7. Complete AMI output           | Partial                         | Exact accepted full-SPI edit combinations work; broader layout/compression acceptance and AMITSE edits remain blocked                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 8. Phoenix UEFI/HII output       | Active                          | P53 mirrored LZMA Setup Ref move passes full-SPI acceptance; deployed Firefox static Ref flow passed; real mixed-source acceptance remains open; dynamic-root semantics are parked                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 9. Broader corpus / 90%          | Deferred                        | Resume new BIOS cases after the current end-to-end editing/output circuit is closed; no new coverage percentage is claimed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 10. Product hardening            | Partial                         | Pre-save allocation/preservation reports exist; bounded queue undo/redo and selected-plan comparison are implemented; Phoenix portable queue sessions and AMI/HII Ref move and supported menu visibility sessions plus mapped AMI values, suppression overrides, proven AMI root sessions and AMITSE menu reassignment are implemented; bounded v1-to-v2 session migration and complete-image byte comparison are implemented; exact Z03 and P53 static Ref v2/v1 session round trips and exact Tiano and nested-LZMA combined v2 session round trips pass deployed Firefox; recovery/release guidance is documented; outstanding acceptance/release gates remain pending |

The immediate priority is the supported editing/output circuit, not exhaustive
reverse engineering of one firmware. The accepted P53 Setup Ref move already
passes mirrored LZMA reconstruction, complete-SPI preservation, independent
re-extraction and the actual React/queue/codec/download flow under jsdom.
The [deployed Firefox acceptance](phoenix/p53-firefox-output-acceptance.md) now
passes the exact static Ref flow on revision `e487b7e`; hardware and other
browser/source scopes remain separate.

The [P53 static research](phoenix/p53-runtime-navigation-research.md) links
browser selection, OEM publication/consumer paths, conditional Ref insertion,
reset return, keyboard gating and media/content-dependent flag writers.
That investigation is now parked as runtime-navigation backlog. Notification
execution/order, indirect selection re-entry, effective flag values and resolved
runtime Ref strings remain unproven. Their absence keeps dynamic-root controls
blocked; it does not invalidate the separately accepted static Ref output path.

## Functional closure and bounded research scope

| Track                              | Evidence / open gate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Priority                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Supported P53 editing/output       | Engine, real-source React/jsdom, deployed Firefox static Ref output and v2/v1 portable-session flows passed                                                                                                                                                                                                                                                                                                                                                                                                                                       | Static circuit accepted               |
| Mixed uncompressed carriers        | Synthetic reconstruction passed; no qualifying carrier in 31 inventoried local inputs; real-source acceptance pending                                                                                                                                                                                                                                                                                                                                                                                                                             | Retain missing-source gate            |
| P53 dynamic roots                  | Substantial static trace; execution, ordering and edit semantics unproven                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Parked research backlog               |
| Broader compression/layout support | EFI variant and compressed mixed ancestry remain unsupported                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Separate bounded acceptance work      |
| Product hardening                  | Queue undo/redo and plan comparison implemented; Phoenix and AMI/HII Ref move and supported menu visibility sessions and mapped AMI values, suppression overrides, proven AMI root sessions and AMITSE menu reassignment implemented; bounded v1-to-v2 migration and complete-image byte comparison implemented; exact Z03 and P53 static Ref v2/v1 session round trips and exact Tiano and nested-LZMA combined v2 session round trips pass deployed Firefox; recovery/release guidance documented; outstanding acceptance/release gates pending | Proceed with validation gates visible |

The next work order is:

1. Continue remaining deployed-browser gates using existing accepted sources.
   The [exact first LZMA Firefox flow](ami/lzma-firefox-output-acceptance.md)
   now reproduces source-bound JSON suppression import, Apply/Check/report,
   exact accepted download, removal invalidation and fresh reload on PR #153.
   Its engine acceptance was rerun separately with the deployed WASM assets.
   Its [v2 session gate](ami/lzma-session-firefox-acceptance.md) now passes
   export/clear/import, fresh exact output, invalidation, independent scope reread
   and source/context rejection. Shared product-hardening acceptance remains next.
   The [nested LZMA Firefox HII flow](ami/nested-lzma-firefox-output-acceptance.md)
   passes the exact source-bound suppression path on PR #154. Its
   [combined Firefox flow](ami/nested-lzma-combined-firefox-output-acceptance.md)
   now also passes the exact four-operation move, SetupData, root and
   source-bound suppression queue on deployed PR #155: exact full-SPI download,
   removal invalidation and independent reload. Root, move and SetupData use
   direct controls; the unassociated suppression uses JSON. Uncompressed AMI and
   mixed carriers retain their missing real-source gates.
   The observed editor-JSON optional-field queue noise is now fixed: omitted
   `undefined` fields are not edits; defined values and replay guards stay strict.
   P53 runtime-root research stays parked.
2. Retain the missing qualifying mixed uncompressed source gate from the completed
   31-image inventory. Run bounded real-source acceptance only if an already
   supplied qualifying carrier becomes available; do not repeat that inventory,
   expand the corpus or unlock compression merely to remove the blocker.
3. Report the achieved validation level separately for each supported path, then advance the shared
   product-hardening work. Unsupported codecs/layouts retain their own gates.
   Additional BIOS cases remain deferred under phase 9.

The [existing-source mixed inventory](phoenix/mixed-source-triage.md) has now
checked 31 unique available images: no `mixed-direct-nested` carrier was reported,
22 inputs yielded HII modules, and three reported decode failures. This is not
format-wide absence or mixed output acceptance. Retain the missing qualifying-source
gate; the exact P53 Firefox static flow is now accepted. Proceed with remaining
browser acceptance and shared product hardening without claiming mixed-source
or hardware acceptance. Further corpus acquisition and P53 OEM research remain
deferred.

Resume P53 runtime research only for a concrete defect in the supported circuit
or an explicit decision to implement dynamic-root behavior. The remaining
research questions are not mandatory prerequisites for unrelated supported
editing/output paths. No unsupported root control becomes available merely
because research is parked.

Legacy structural editing and controlled execution remain tracked above; they
are not implicitly completed by progress in UEFI HII. Real Firefox interaction,
independent output rereading and physical flashing are different validation
levels, and only the completed levels are claimed.

PhoenixBIOS legacy FFV, Phoenix SecureCore hybrids and Phoenix UEFI/HII are
tracked separately. A shared vendor string is not evidence that they share a
Setup format or reconstruction path.

Shared queue history now retains up to 50 changes per opened source in AMI,
UEFI HII and Phoenix. Staging, selecting, removing, reordering and clearing
operations can be undone/redone. A new edit discards redo; opening/replacing a
source clears both histories, even when its bytes match. No-op controls do not
consume history. Apply and output verification are not restored: every undo/redo
invalidates the applied plan and verified download, including an identical restored
queue and a late asynchronous build. Synthetic React/hook regressions cover
those general guarantees. The [exact Z03 history acceptance](phoenix/z03-history-firefox-acceptance.md)
now separately verifies staging Undo/Redo, Clear/Undo and ready-output Redo/Undo
invalidation, new-mutation Redo discard, a fresh identical rebuild and page-reload
history reset in deployed Firefox. The
[exact Tiano history acceptance](ami/tiano-history-firefox-acceptance.md) now also
passes four-operation AMI Clear/Undo, ready-output Redo/Undo invalidation, fresh
identical full-SPI rebuilding and independent four-edit reread. The
[exact P53 history acceptance](phoenix/p53-history-firefox-acceptance.md) also
passes static Ref staging Undo/Redo, Clear/Undo, ready-output Redo/Undo
invalidation, two fresh identical full-SPI downloads and independent Ref reread.
The [exact Tiano selection/order acceptance](ami/tiano-selection-firefox-acceptance.md)
also passes one/all pause and reselect invalidation, read-only comparison,
independent Boot/suppression reorder with identical output, and blocked paused
or reordered root dependencies. Its separate deployed PR #179 run now verifies
the exact move-only subset with Security/suppression/Boot paused: known full-SPI
hash, untouched paused states, fresh reselected full output identical to baseline
and independent rereads of both variants. A deployed PR #180 run separately
rebuilds the coherent five-entry Hide/Show Boot restore plan and the equivalent
three-entry plan without either root action: both match the independently
reproduced engine hash and reread with all original roots plus the other three
edits intact. A separate deployed PR #181 combined v2 session run now preserves
the exact move-only selection with three paused entries through export/clear/import,
metadata-identical re-export and fresh output; an invalid paused root rejects
atomically while verified output remains intact. Independent rereads and changed-image
rejection pass. The deployed PR #182 extension now also verifies one-step Undo/Redo
of loading that paused session over a ready four-edit queue, invalidation from
both ready variants, fresh known move-only/full outputs and independent rereads.
A controlled native-text probe on deployed PR #183 now also passes late paused-session
read delivery after Clear/Undo and dialog closure, a fresh exact full-SPI Check,
completion of the old validation hashes before any newer session operation,
retention of the four-enabled queue/output and independent reread. This combined
sequence does not isolate revision cancellation from dialog closure.
A separate deployed PR #184 probe now also holds a session read across same-byte
source close/reopen in the same document, proves original base/empty history,
rebuilds the new full queue and retains it after old native text/hash completion.
The retained full SPI independently rereads correctly. Dialog closure and source
unmount/reset both occur; they are not isolated from one another.
A deployed PR #185 probe now also holds the final native digest of a session save
across the same close/reopen sequence. After a fresh full queue/SPI is ready,
old digest delivery creates neither a JSON Blob URL nor a session download;
the current save succeeds and the retained full SPI independently rereads.
This combines dialog/source cancellation, not queue-revision-only cancellation.
A deployed PR #195 save probe now separately keeps dialog/source open across
Clear/Undo and final native digest delivery. The restored full queue retains
invalidated output; no stale JSON Blob URL, download, saved message or alert occurs
before any newer request. Current save then succeeds in that same dialog, followed
by a fresh exact full SPI and independent reread. Individual token internals and
other save hash boundaries/rejections remain separate.
A deployed PR #186 probe holds the final native hash of a paused-session load,
then performs Clear/Undo with the dialog kept open and no source reset or newer
session request. Old digest delivery does not replace the restored full queue;
output stays invalidated until a fresh exact full-SPI Check and independent reread.
This accepts that queue/history context boundary, not individual token internals.
A deployed PR #187 probe also holds the final load hash across same-byte source
close/reopen, verifies original base/empty history, freshly rebuilds the full
queue/SPI and retains both after old delivery before any newer session request.
The cached SPI independently rereads; dialog closure and source reset are combined.
A deployed PR #188 probe separately delays a genuine invalid paused-root rejection
at its final native load hash across open-dialog Clear/Undo. The stale alert is
discarded; the same invalid file rejects visibly when current, retaining checked
output, and valid retry clears that alert. Fresh full-SPI output independently rereads.
A deployed PR #189 extension also delays the same rejection across dialog closure
and same-byte source close/reopen. Original base/empty history reset, a freshly
checked full queue/SPI survives old delivery without a stale alert, and the cached
retained SPI independently rereads. Dialog/source cancellation are combined;
distinct-image replacement and other rejection causes remain separate.
A deployed PR #196 dependency-session probe now passes the five-entry Hide/Show
Boot v2 round trip/re-export, fresh exact restored SPI, valid paused Show with
the preceding Hide enabled, and fresh known hidden/restored outputs after
reselection. Pausing the prerequisite Hide rejects import with Show enabled or
paused, preserving the prior full queue/output; valid retry clears the alert.
Five independent rereads confirm the requested roots and other three edits.
This accepts those exact dependent selections, not arbitrary dependencies.
A deployed PR #197 history extension now passes single-step Undo/Redo of loading
the dependent paused-Show session, exact full/paused metadata re-export and output
invalidation. Undo from ready hidden-Boot output and Redo from ready restored output
both require fresh Apply/Check; the known restored/hidden SPIs independently reread.
This accepts that five-entry history sequence, not all session histories.
A deployed PR #198 order extension now rejects Show-before-Hide session imports
with Show enabled or paused, retaining the exact full queue and ready-output controls.
A valid move/SetupData/Hide/Show/suppression session preserves its exact order on
load/re-export, invalidates output and freshly rebuilds the known restored full SPI;
independent reread confirms all roots and the other three edits. This accepts
that permutation, not arbitrary session reordering.
Other subsets, dependent paused sessions, permutations/sources
and asynchronous races remain separate browser gates. The
[exact Tiano late native-completion probe](ami/tiano-late-firefox-acceptance.md) now
verifies an old real codec continuation after a newer verified output in Firefox
with controlled native WASM Promise timing. This is not uninstrumented scheduling
or hardware acceptance; stale failures, source replacement and other boundaries
remain separate. This does not add a firmware format. History is held in memory;
full-image byte comparison and portable sessions are implemented; recovery and release guidance is now documented; outstanding acceptance gates remain next.

The shared queue dialog now compares the original loaded editor state with the
net selected plan for AMI/UEFI HII, and validated source/replacement patch spans
for Phoenix. Paused changes are excluded; cancelling operations produce no net
rows. Logical inconsistencies or invalid binary patches make the comparison
unavailable rather than displaying a partially replayed result. Structured values
are bounded summaries, at most 100 changed fields/spans are displayed, and
omissions are explicit. This is a read-only plan preview before Apply, not a
byte diff of the rebuilt full SPI or output acceptance. Opening the comparison
preserves a verified output; changing the queue still invalidates it. Synthetic
hook/UI regressions exercise net values, selection, undo, source/conflict errors,
summary limits and read-only inspection. Portable session work can proceed.
The exact P53 deployed Firefox flow is accepted; mixed-source acceptance remains open.
Verified full-image byte comparison is now implemented.

Phoenix now supports [portable queue sessions](queue-sessions.md) for its proven
Show callback operations. Version 2 stores only full-image/template hashes, image
size and ordered action/item selectors with enabled flags. Loading requires exact source
identity, uniquely regenerates every patch from the open inventory and validates
paused operations as well. Import replaces the queue as one undoable mutation;
Apply, verified bytes and exported undo/redo history are not restored. Pending
save/load completions are discarded if their queue/source context changes.
Synthetic tests cover schema limits, mismatched source/template identities,
missing/ambiguous/uneditable items, stale/bounded patch preconditions and verified
output invalidation. AMI/HII now support individual Ref moves and supported menu Hide/Show sessions with exact
full-image/opened-context identities and ordered semantic selectors. Each action
is regenerated by the existing editor against its selected prefix, including
paused operations. Export compares the whole entry with a regenerated action;
stale dependencies, compound edits and unsupported types reject explicitly.
Synthetic tests cover AMI/HII round trips, ordered dependent moves, source/context
mismatch, malformed selectors, atomic rejection, Undo and verified-output
invalidation. Visibility replay retains existing AMI hub-tab and HII ownership/scope guards;
HII restore anchors are regenerated locally. Ref-only files remain compatible.
Synthetic checks include Hide/Show order, mixed moves, paused dependencies,
malformed actions and rejected capability promotion. Mapped AMI flags/failsafe/
optimal value batches now use the same source-bound session and selected-prefix
replay. SetupData hashing, original-byte ownership, bounds, complete field and
family checks run for paused batches too. Existing Ref-only/menu files remain
compatible. Synthetic tests verify batches, moved references, atomic rejection
and exact requested SetupData bytes through the existing patch builder.
AMI/HII suppression batches now restore only proven unique SuppressIf scopes;
closing End/body/ownership and structural validation also run for paused restore
actions. Runtime/HW classification is retained as an override, never promoted
into reachability evidence. Synthetic tests cover batches, Ref-remapped mappings,
source scope failures and atomic rejection. AMI root sessions now regenerate
root desired states from fresh inspection of the opened Setup PE/provenance,
matching original FormSet order and source bytes. The last-enabled-root guard
also applies to paused imports. Synthetic PE-loop tests cover provenance/code
mismatches, immutable evidence, batches and restore; accepted-source/full-image
write gates remain unchanged. AMITSE menu-retargeting sessions now use existing menu/Form selectors, opened
companion hash, original FormId/GUID bytes and unique same-FormSet destinations.
Synthetic tests cover exact patches and atomic rejection; writer acceptance is
unchanged. Complete-image byte comparison is now implemented for verified AMI, HII and
Phoenix outputs. Exact changed/unchanged byte totals and contiguous ranges scan
the entire physical image; the UI limits samples to 64 ranges and 16 byte pairs
per range. Unequal sizes fail preflight and queue/source revisions invalidate
comparison and download together. Synthetic tests verify bounds, sparse/dense
masks, exact samples, source snapshotting and all three family reports. This
alone adds no real-source/browser/flash acceptance claim. A separate deployed
PR #199 Tiano run now compares all rendered byte-report totals and the first
64 physical ranges/16-byte samples against independent scans of nine actual
downloads, including dependent session/history variants. Hidden/restored reports
have 737/252 ranges; eight output rereads pass. Other sources and hardware remain
separate. See [the report acceptance](ami/tiano-firefox-output-acceptance.md#complete-image-byte-report-against-actual-downloads).
A separate deployed PR #200 Z03 run also matches both original/post-Clear-Undo
Phoenix byte reports against independent complete-ROM scans: all 64 displayed
ranges/samples, 70 total ranges and LH5 allocation/preservation fields. Both
downloads independently reopen with Cache Ram's proven callback visible.
See [the Z03 report acceptance](phoenix/z03-firefox-output-acceptance.md#complete-rom-byte-report-against-actual-downloads).
A separate deployed PR #201 nested-LZMA run also matches both direct-queue and
v2-restored byte reports against complete-SPI download scans: exact totals,
3,369 ranges and all 64 displayed ranges/16-byte samples. Both known outputs
independently reread all four edits with non-BIOS preservation intact.
See [the nested report acceptance](ami/nested-lzma-session-firefox-acceptance.md#complete-spi-byte-reports-before-and-after-session-load).
A separate deployed PR #202 P53 static Ref run now matches both pre/post-history
byte reports to complete 32 MiB SPI scans: exact totals, 35,004 ranges, all 64
displayed boundaries/16-byte samples, two physical copies and both LZMA allocation
rows. Both actual downloads independently reopen with the requested Ref parent.
See [the P53 report acceptance](phoenix/p53-history-firefox-acceptance.md#complete-spi-byte-reports-before-and-after-history-invalidation).
A deployed-main `65adaa2` first-LZMA v2-session run also matches its complete-BIOS
report to the actual download: 19,458 ranges, exact totals and all 64 displayed
ranges/16-byte samples. This BIOS-only image has zero bytes outside BIOS.
See [the first-LZMA report acceptance](ami/lzma-session-firefox-acceptance.md#complete-bios-byte-report-against-the-actual-download).
Other report scopes and hardware remain separate.
New queue exports now use
version 2 with explicit action discriminators; strict version-1 Phoenix and
AMI/HII files migrate in memory before unchanged identity and replay checks.
Unknown future versions remain blocked. Recovery and release guidance is now documented in
[Recovery and release readiness](recovery-and-release.md); it retains separate
engine, real-source, browser and physical-flash evidence levels. Existing AMI
`data.json` is unchanged. This work advances phase 10 without extending P53
runtime-root research. The exact P53 static Ref, Tiano and nested-LZMA combined session records below establish
separate bounded AMI/HII Firefox/real-source session acceptance scopes.

The phase-10 release criteria now have an executable reviewed evidence inventory.
`release:report` lists seven tracked writer scopes and eight exclusions;
`release:check` remains blocked while required records are pending. Structural
validation and regression tests run in normal checks/CI without treating pending
evidence as invalid metadata. The inventory cannot enable a writer and does not
rerun real firmware, establish current-commit acceptance or replace manual
Firefox/hardware results. The exact P53 static Ref browser scope now links its
deployed Firefox record; the exact Tiano combined queue now also has a
[deployed Firefox record](ami/tiano-firefox-output-acceptance.md). The exact Z03
LH5 Show path also has a [deployed Firefox record](phoenix/z03-firefox-output-acceptance.md).
The two remaining deployed-browser scopes are uncompressed AMI and mixed
uncompressed HII; both also retain missing real-source records. No new source
intake, physical flashing or P53 dynamic-root work is
claimed. See [the executable inventory](recovery-and-release.md#executable-evidence-inventory).

The Tiano browser run exercised move, SetupData flags, source-bound `data.json`
suppression import and a proven Boot root toggle. Its complete download matched
the accepted hash and re-opened correctly. Import also revealed 4,520 logical
comparison fields caused in part by omitted optional `undefined` properties.
Logical diff generation now ignores that JSON-only absence while retaining
defined additions/removals and strict replay property/value checks. Source-bound
import also restores the opened source's negative single-FormSet navigation
report. Firefox on a local production build verified zero entries for unchanged
JSON, exactly one field for the suppression-only override and the same accepted
combined output hash. Derived IFR offsets from a structural move remain tracked;
this is not a claim that every combined plan has four scalar patches. Direct control of an unassociated
suppression scope and portable session acceptance are not claimed by this record.

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

Deployed Firefox on revision `2073432d` now passes the same exact Show operation,
Apply/Check, allocation/comparison review and explicit download. Navigation alone
preserves the checked output; removing the operation invalidates it. The downloaded
1 MiB image preserves every byte outside the existing allocation and reopens with
34 modules, 24 screens and an ungated Cache Ram item callback. This does not
register the unlinked screen as a root or complete phase-3 structural editing.

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
compressed allocation and is rejected; AMITSE editing remains blocked. Its
[deployed Firefox HII record](ami/nested-lzma-firefox-output-acceptance.md)
verifies source-bound suppression import, complete SPI download with all bytes
outside BIOS intact, invalidation and fresh reread. Its separate
[combined deployed Firefox record](ami/nested-lzma-combined-firefox-output-acceptance.md)
verifies the four-operation move, SetupData, root and source-bound suppression
queue, exact accepted output and independent reread. Its separate
[combined v2 session record](ami/nested-lzma-session-firefox-acceptance.md)
now passes metadata-only export/import and fresh output with identity rejection.
Hardware, combined v1 and broader source compatibility remain unestablished.

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
- [P53 browser-code research](phoenix/p53-root-registration-research.md) now
  reproduces a seven-entry Metro GUID lookup with three 16-bit selectors and a
  candidate FormBrowser2/SendForm path in SystemBiosSetupDxe. Neither establishes
  a visibility vector. The handle-selection trace now links the browser array/count
  globals to Forms-package enumeration and observes temporary filtering plus
  conditional mutation/re-enumeration paths. The database LocateProtocol output
  now has a PE-entry initialization trace, and the two branch bytes accumulate
  presence of two OEM GUIDs; neither is a per-root visibility flag.
  [Publication/consumer research](phoenix/p53-runtime-navigation-research.md)
  links the OEM pointer interface to a guarded LenovoSetupMainDxe append of the
  SystemSetupAdvancedDxe FormSet (separate from the consumer's own FormSet)
  and corroborates conditional Ref construction followed by HII package update.
  The replacement helper matches SystemBiosSetupDxe Form 1 and its label anchors
  1001/1002. A keyboard callback sets the append gate, and the tail unregisters
  that notification. Ref field flow now links to the inspected handle, with
  insertion after the start
  anchor and preservation of the original remainder. Actual selected handles,
  resolved strings/device paths, selection re-entry, remaining OEM flag initialization/effective values and semantics and
  runtime ordering remain open before promoting runtime root registration or
  edits. The entry tail-jump and wrapper/browser call chain now link the initial
  selection-before-publication sequence to SendForm and its reset-request return
  route. These wrappers contain no second direct selector call; indirect re-entry
  remains unproven.
- Prove runtime-visible roots separately from merely present HII FormSets.
- Feed any discovered runtime navigation callbacks or variables into the
  controlled behavior layer.

Exit gate: the exact Lenovo P53 sample now produces and re-reads a complete image
with one validated Ref move. The editor download lifecycle is integrated and covered
by synthetic frontend tests plus opt-in real-source React/jsdom acceptance using
the actual editor, queue, codecs, builder and captured download. The deployed
Firefox static Ref flow also passes explicit download, invalidation and reload
with the exact accepted output hash. Dynamic root registration/editing is a
separate parked extension with its own evidence gate; it is not required to
accept the already supported static Ref move and remains explicitly blocked.

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

- [AMI same-page source replacement](ami/source-replacement.md) is implemented:
  pending AMI JSON imports now also invalidate on queue revision changes, so
  late reads/checksums/errors cannot act on an obsolete same-source projection.
  Synthetic React/jsdom regressions cover success/rejection and Undo returning
  to identical entries. A separate controlled native-checksum delivery probe on
  deployed PR #171 now passes exact Tiano Clear/Undo to identical entries,
  fresh complete-SPI rebuild, stale delivery retention and independent four-edit
  reread. No source replacement or newer import supersedes that old checksum;
  this isolates queue-revision invalidation. It is not ordinary scheduling,
  checksum-failure acceptance or observation of the old import's full return.
  Source replacement provides explicit return to upload, source/base/selection/error reset, queue/history/Apply
  reset and output unmount. AMI JSON import discards stale file-read/checksum
  successes and failures. Synthetic App/real-footer/queue tests also complete or
  reject an old build after verifying a reopened source. This is implementation
  plus React/jsdom validation. The exact Tiano ready-output replacement gate
  now separately passes deployed Firefox on PR #168: no document navigation,
  fresh original base/empty history, new identical complete-SPI output and
  independent four-edit reread. A separate controlled native JSON-read delivery
  probe on deployed PR #169 now retains a newer verified output after source
  replacement and old real-text delivery, with a current-import positive control
  and independent four-edit reread. This is not ordinary browser scheduling or
  observation of the old import's full return. A separate controlled native-WASM
  delivery probe on deployed PR #172 now passes closing a source with an old
  Check outstanding, reopening identical bytes in the same document with fresh
  base/empty history/no cached output, a fresh complete-SPI Check, retention after
  old instance delivery and independent four-edit reread. This is not observation
  of the old build's full return, ordinary scheduling or stale-build failure acceptance.
  A separately scoped fault-injected native WASM rejection probe against deployed
  PR #174 now also passes source replacement while an old failure is held,
  delivery after a newer exact full-SPI output, a current-failure positive
  control with download blocked, successful retry and independent four-edit
  reread. The native module is unchanged but its imports are deliberately omitted
  only at the injected boundary; this is not spontaneous failure or observation
  of the old hook's full return. See the same lifecycle record and opt-in checker.
  Current AMI import errors are now displayed in the active editor; the upload-only
  alert previously hid a native checksum rejection from the user. A synthetic
  App/real-queue regression verifies the alert, retained applied queue and
  clearing after success. The separate local-production Firefox native checksum
  rejection probe passes stale rejection after Clear/Undo, visible current failure,
  retry/invalidation and independent exact-SPI reread. The same scenario now also
  passes deployed PR #176 in Firefox: stale rejection retention, visible current
  failure, retry/invalidation, three identical complete SPIs with no non-BIOS
  changes and independent four-edit reread. This is controlled native fault
  injection, not spontaneous failure. A separate deployed PR #177 probe now also
  passes source close/reopen while that native checksum rejection is held:
  fresh original base/empty history, newer verified SPI retained after old
  rejection delivery, visible current failure, retry/invalidation and independent
  four-edit reread. All three SPIs match with no changes outside original owners
  or BIOS. A separate deployed PR #178 probe also passes a held native File.text
  TypeError across same-source close/reopen, fresh original base/empty history,
  newer SPI retention, visible current API failure, normal retry and independent
  four-edit reread. It deliberately invokes the native text method with an invalid
  receiver: this is API fault injection, not an actual unreadable-file/I/O failure.
  Neither probe observes the old import's full return. Actual read failures and
  other boundaries remain open. See the lifecycle record and opt-in checkers.
  Other pending-build boundaries, checksum races, read
  failures and other asynchronous interleavings remain separate gates. Existing
  codecs, reconstruction/ownership checks and full-SPI requirements are unchanged.

- Pre-save risk, space, compression and affected-region report: the AMI footer
  checks the complete applied queue before download and reports verified packed
  sizes, section capacity, source allocation bounds and preserved non-BIOS bytes.
  Results are invalidated when the applied state or source changes.
- Original/selected-plan comparison and bounded queue undo/redo are implemented
  above the transactional queue. Full rebuilt-image byte comparison is implemented for verified AMI/HII/Phoenix
  outputs with exact complete-image totals and bounded physical byte samples.
  The deployed PR #199 Tiano report acceptance separately matches every displayed
  boundary, length and original/rebuilt sample against an independent scan of
  nine known full SPIs, including fresh results after session load, Undo/Redo,
  reselection, valid reordering and root-pair removal. All 64 displayed ranges
  and the 16-byte sample bound pass; eight independent semantic rereads pass.
  This accepts those exact reports, not other sources or physical flashing.
  A separate deployed PR #200 Z03 run verifies the Phoenix report before and
  after Clear/Undo: exact totals, all 64 displayed ranges/samples, LH5 capacity
  and unchanged outer allocation bytes match both actual ROM downloads. Both
  independently reopen correctly; other source/family reports remain separate.
  A deployed PR #201 nested-LZMA run also matches direct-queue and v2-restored
  report totals, physical ranges and bounded samples to two actual known SPIs;
  both independently reread all four edits. Clear/load/removal invalidation and
  changed-source session rejection still pass. A deployed PR #202 P53 static Ref
  run also matches both reports before/after history invalidation to actual complete
  SPIs: totals, all 64 displayed ranges/samples, two physical copies and LZMA
  allocation fields; both independent Ref rereads pass. A deployed-main `65adaa2`
  first-LZMA v2-session run also matches its complete-BIOS report to the actual
  download: 19,458 ranges and every displayed boundary/sample, with exact totals
  and zero changes outside the owner. Other report scopes and hardware remain separate.
- Portable Phoenix and individual AMI/HII Ref move and supported menu visibility sessions plus mapped AMI values, suppression overrides and proven AMI roots are
  implemented. AMITSE menu reassignment is also implemented. Version-2 exports
  use explicit actions, while strict version-1 files migrate in memory before
  normal validation and replay; unknown future versions remain rejected. The
  [exact Z03 session acceptance](phoenix/z03-session-firefox-acceptance.md)
  reproduces v2 export/import and v1 migration in deployed Firefox, with fresh
  complete-image checks and source-identity rejection.
  The [exact P53 static Ref session acceptance](phoenix/p53-session-firefox-acceptance.md)
  separately reproduces the AMI/HII v2 export/import and strict Ref-only v1
  migration, byte-identical complete-SPI outputs and identity rejection. It does
  not extend the accepted operation or dynamic-root scope.
  The [exact Tiano combined session acceptance](ami/tiano-session-firefox-acceptance.md)
  reproduces metadata-only v2 export/import for move, mapped SetupData flags,
  suppression and root actions, fresh exact complete-SPI output and identity
  rejection in deployed Firefox. A separate deployed PR #181 run also passes the
  exact one-enabled/three-paused v2 round trip, metadata-identical re-export,
  fresh move-only output and full reselection, invalid paused-root atomic rejection
  retaining verified output, independent rereads and changed-image rejection.
  A deployed PR #182 extension verifies session load as one undoable replacement:
  single Undo/Redo restores the full/paused selections without cached output;
  fresh post-Redo move-only and post-Undo full outputs match known hashes and
  independently reread correctly.
  A deployed PR #183 controlled native-text extension also retains the newer full
  queue/output after Clear/Undo, dialog closure and old session read/hash delivery,
  with fresh known SPI output and independent reread. It combines revision/dialog
  cancellation; neither mechanism is isolated. The deployed PR #184 probe also
  passes held session text across same-byte source close/reopen, original-base/
  empty-history reset, fresh full rebuilding, old validation-hash completion and
  retained new queue/SPI with independent reread. Dialog closure plus source
  unmount/reset are combined. The deployed PR #185 save probe holds the last
  native digest across the same close/reopen boundary: no stale JSON Blob URL
  or session download, successful current save and retained exact full SPI with
  independent reread. A separate deployed PR #195 save probe keeps dialog/source
  open across Clear/Undo: final native digest delivery creates no stale JSON URL
  or download and leaves output invalidated; current save in the same dialog
  succeeds, followed by fresh exact full SPI and independent reread. No newer
  request masks old delivery. Other save boundaries/rejections remain separate.
  The deployed PR #186 load-hash probe separately keeps the
  dialog/source open across Clear/Undo and final native hash delivery, retains
  the full queue without stale loaded/error state, and requires a fresh exact
  full-SPI Check plus independent reread. No newer session request masks it.
  The deployed PR #187 extension separately retains a freshly checked full queue/SPI
  after final old load-hash delivery across same-byte close/reopen, with original
  base/history reset and independent retained-output reread. Dialog/source
  cancellation are combined; distinct-image replacement is not established.
  The deployed PR #188 semantic-rejection probe keeps dialog/source open across
  Clear/Undo and final hash delivery for an invalid paused root: no stale alert,
  visible current rejection with output retained, valid retry clears the alert,
  and fresh exact full-SPI output independently rereads. The deployed PR #189
  extension also passes this rejection across same-byte source close/reopen:
  original base/history reset, freshly checked full queue/SPI retained without
  a stale alert, current rejection/retry and independent retained-output reread.
  Dialog closure and source reset are combined. Other rejection causes and
  distinct-image replacement remain separate.
  A deployed PR #196 dependency-session probe also passes the five-entry Boot
  Hide/Show v2 round trip and exact re-export, valid paused Show with Hide selected,
  fresh known hidden/restored full SPIs, atomic rejection without the selected
  prerequisite Hide even when Show is paused, valid retry and independent rereads.
  The deployed PR #197 history extension separately verifies single-step load
  Undo/Redo, exact full/paused exports, invalidation from both ready-output variants
  and fresh known restored/hidden full SPIs with independent rereads.
  A deployed PR #198 order extension also rejects Show-before-Hide imports with
  Show enabled or paused without replacing the full queue or ready-output controls.
  The valid move/SetupData/Hide/Show/suppression order loads/re-exports exactly,
  invalidates output and freshly reproduces the known restored SPI with independent
  reread. Other permutations remain separate.
  Other selections/dependencies,
  history sequences, remaining save/load races and combined v1 stay separate.
  The [exact nested-LZMA combined session acceptance](ami/nested-lzma-session-firefox-acceptance.md)
  separately passes root/move/SetupData/suppression v2 export/import, fresh exact
  full-SPI output, removal invalidation, independent four-edit reread and changed
  image/context rejection. Combined v1 and hardware remain unclaimed.
  The [exact first-LZMA session acceptance](ami/lzma-session-firefox-acceptance.md)
  passes metadata-only v2 suppression export/import, exact complete-BIOS output,
  removal invalidation, empty-scope reread and changed-image rejection. This
  BIOS-only source does not establish descriptor-bearing SPI or v1 acceptance.
- The [exact Z03 history acceptance](phoenix/z03-history-firefox-acceptance.md)
  verifies real Firefox undo/redo invalidation and fresh identical output. AMI/HII
  history, multi-operation variants and asynchronous races remain separate gates.
  The [exact Tiano history acceptance](ami/tiano-history-firefox-acceptance.md)
  separately verifies the supported four-operation AMI queue and fresh identical
  full-SPI rebuilding after history invalidation. The
  [exact P53 history acceptance](phoenix/p53-history-firefox-acceptance.md)
  separately verifies the supported static Ref queue, fresh identical full-SPI
  rebuilding, reload history reset and independent Ref reread. Other sources,
  paused/reordered variants and asynchronous races remain separate gates.
  The [exact Tiano selection/order acceptance](ami/tiano-selection-firefox-acceptance.md)
  separately verifies selection invalidation, independent reorder with identical
  full-SPI output and dependency rejection in real Firefox. A separate deployed
  PR #179 run now also rebuilds the exact move-only paused subset and fresh full
  reselection, with the existing engine hashes, no non-BIOS changes and independent
  rereads confirming selected edits and unchanged paused states. Deployed PR #180
  separately passes five-entry Hide/Show Boot cancellation and fresh equivalent
  three-entry output, with the engine hash, full-SPI preservation and independent
  rereads confirming all original roots and the three requested edits. Other subsets,
  variants and asynchronous races remain separate gates.
  The [exact Tiano late native-completion probe](ami/tiano-late-firefox-acceptance.md)
  separately verifies the newer output survives the old codec continuation using real
  Firefox/engine/codecs with a native instantiation timing gate. Uninstrumented
  scheduling, stale failures, source replacement and other boundaries stay separate.
- [Recovery and release readiness](recovery-and-release.md) documents original
  backup handling, verified-output review, supported-family boundaries and
  device-specific recovery preparation. It supplies no universal flash command
  and does not establish physical hardware acceptance.
- The reviewed release evidence inventory is checked in CI; `release:check`
  remains blocked on pending evidence and cannot hide a path by omission.
- Stable release only when each write path has an independent reconstruction
  test and a real-sample acceptance record.

## Execution order

The numbered phases describe dependencies, not a claim that all earlier exit
gates have passed. The current priority is to finish the phase-8 UEFI HII
editing/output circuit before adding more BIOS cases in phase 9. Follow the
functional-closure order above; P53 runtime research must not become an unbounded
serial prerequisite for the rest of the product. Unfinished
legacy extensions remain explicit backlog. Cross-cutting refactors are accepted
only when required by the active work and must retain the parser/editor/UI
module boundaries documented in [architecture.md](architecture.md).
