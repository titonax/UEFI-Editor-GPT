# Portable queue sessions

Phoenix Setup and full-image AMI/vendor-neutral HII editors can save/load
`firmware-session.json` from the Change queue dialog. AMI/HII currently support
queues of individual Ref moves and supported menu Hide/Show actions, suppression overrides, mapped AMI values, proven AMI roots and AMITSE menu reassignment; other
operations reject export explicitly.
The user first opens and analyses the original firmware normally, then loads the
session. Renaming the original file is fine; changing any image byte, image size
or opened editing context rejects the session. All hashing and JSON processing are
local. The session does not include firmware bytes or upload anything.

The current format is `uefi-editor-queue-session`, version `2`, kind
`phoenix-visibility`. Version 2 gives every operation an explicit `action`;
Phoenix currently accepts only `show`. It records only:

- SHA-256 and byte size of the complete input image;
- SHA-256 of its opened decoded TEMPLAT body;
- ordered `itemOffset`/`enabled` selectors for existing proven Show callbacks.

A load replaces the current queue as one undoable change. Existing local Undo
can recover that prior queue; saved undo/redo history is not part of the file.
All restored operations remain unapplied and require Apply, then Check firmware
output again. A restored selection never revives cached downloads or allocation
reports. Saving or rejecting a session does not alter the current queue or its
verified result. Queue/source changes and closing the dialog cancel delayed
save/load completions.

After a delayed session file read, the shared controls recheck the request before
calling the source-bound adapter. Closing the dialog, changing the queue/source
context or unmounting therefore skips obsolete hashing and semantic replay rather
than merely discarding their final commit. Validation already in flight still
uses the final request guard. The 1 MiB file limit and all adapter identity,
selector, ownership and output checks are unchanged.

On 2026-10-18, React/jsdom regressions in
`src/components/ChangeQueue/QueueSessionControls.test.tsx` reproduced three
obsolete-read validation calls before the fix (context replacement, dialog close
and unmount), then passed with the early guard. A newer successful load is retained
after old text delivery, and an already-started validation cannot commit after
context replacement. These use controlled promises and synthetic session text;
they do not establish real Firefox, real-source reconstruction or hardware
acceptance for this boundary. Existing real-source records below remain separate.

On 2026-10-20, a further React/jsdom regression reproduced stale file-picker
cleanup: after context replacement and a newer pending load, the old read's
`finally` still cleared the shared native input. Cleanup now resets a cancelled
picker immediately on context/active lifetime change; only the current request
may reset it on completion. Controlled old read, validation and save success/error
deliveries leave the newer load busy and its input untouched, with no old commit,
download or alert. The current load then commits once and resets its own picker.
Another regression verifies cancellation resets immediately and old delivery
does not reset again. The initial read regression failed before the fix; all
15 shared-control cases pass afterward. This is synthetic React/jsdom evidence
only, with no new firmware, real-engine, Firefox or hardware acceptance. The
nested-LZMA distinct-byte rejection browser gate remains pending: authorized
private-source recovery was blocked by HTTP 403 during this validation.

The import treats JSON as untrusted. It rejects unknown fields/formats/versions,
malformed SHA-256 identities, unsafe/negative offsets, non-boolean selections,
duplicate selectors, text/files above 1 MiB and more than 1000 operations. Every
selector must identify exactly one current item with a proven non-zero visibility
callback. The importer derives the expected bytes and replacement from that
inventory; no imported patches or labels are accepted. Normal source/bounds/
overlap checks run with every operation enabled, including paused ones, before
any queue replacement. Source and decoded bytes remain untouched.

SHA-256 binds a plan to its original bytes; it is not a signature identifying who
created the JSON. A matching session can only select supported operations that
the open editor already exposes. Loading it grants no new editing or output
capability. Empty sessions are valid and clear the queue; malformed imports leave
all existing state untouched.

## AMI/HII menu sessions

Legacy version 1 kind `hii-ref-moves` stores full-image SHA-256/size, an opened-context
SHA-256 and ordered `sourceFormIndex`, `referenceChildIndex`,
`destinationFormIndex`, `enabled` selectors. These indices refer to the selected
prefix at that step, not to global FormIds. The context digest binds the original
editing stream, complete logical base/evidence, family and current trusted module
locations/ownership. Repeated AMI contexts and joined/isolated HII workspaces must
match exactly. Reopening with a different parser/model may conservatively reject
a session; migration does not change or bypass that identity.

Existing Ref-only `hii-ref-moves` files remain readable unchanged. New exports,
including pure Ref queues, use version 2 kind `hii-menu-actions`. Each operation
has an `action`: `move-ref` includes the three
move indices; `visibility` includes `sourceFormIndex`, `referenceChildIndex` and
boolean `visible`. Both include boolean `enabled`. Unknown actions/fields reject;
raw restore anchors, provenance or binary edits cannot be supplied.

Every imported operation, including paused ones, runs against the selected prefix
and original opened stream. Ref moves use `moveMenuReference`; AMI single-FormSet
hub tabs use `toggleTopLevelTabVisibility`; vendor-neutral HII menus use
`toggleUefiHiiMenuVisibility`. Visibility needs the existing proven constant-true
Suppression host. Runtime/hardware gates and unsupported roots gain no new controls.
HII original parent, next sibling and opcode restore anchor are regenerated by the
editor, never imported. Hide/Show preserves the existing editor's Ref ordering. Normal opcode, scope,
ownership, cross-package length, graph and expected-byte guards remain in force.
Only selected operations advance that prefix. Labels, logical patches, IFR byte
moves, remapped offsets and binary analysis are regenerated locally. The JSON
cannot replace Data or assert its own binary evidence. Invalid later operations
reject the entire load without replacing any entries or touching the source.

Export proves that each queued entry is exactly one regenerated supported action by
comparing its complete projected state with the normal editor's result. Stale
entries, dependent operations whose prerequisites were paused/removed/reordered,
compound unrecognized changes reject export, including paused entries. A locally
stored move description only selects the replay adapter; full-state equality is
still required, so a forged label cannot turn another change into a visibility action. Nothing is silently omitted.
An AMI workspace opened from extracted artefacts alone has no full-image identity
and does not expose these session controls. Existing AMI `data.json` is unchanged.

### Mapped AMI values

The `hii-menu-actions` format also accepts `ami-values`: boolean `enabled` and
an ordered `changes` array of existing `formIndex`/`childIndex` selectors, a
whitelisted `field` (`accessLevel`, `failsafe`, `optimal`) and uppercase one/two
hexadecimal digit `value`. Each batch preserves one original queue entry,
including bulk edits. Empty/incomplete values, duplicate targets, unknown fields
and batches above 1000 changes reject. This is an AMI-only adapter; HII workspaces
cannot acquire scalar editing through a JSON file.

Restore uses the currently opened SetupData and requires its SHA-256 to match
the logical base source hash. Every target must have all three complete scalar
fields and a valid in-bounds mapping, one unique original byte owner and a base
value matching that original byte. Ref moves retain these SetupData mappings;
they are not IFR offsets and are never imported. Only the same scalar assignment
exposed by the AMI controls is staged, with labels and patches generated locally.
Whole-state export equality rejects unrecognized compound mutations. Paused
batches receive all the same checks; later failures discard the whole session.

The raw `accessLevel` byte is displayed as SetupData flags; its bit meanings are
not inferred and changing it does not reclassify navigation or visibility.
Sessions contain desired scalar values, not original bytes or record payloads.
The existing writer and full-image allocation/re-read checks remain required
before download. The tests use synthetic SetupData mappings and verify the
three requested byte values with the existing patch builder, not physical flash.

### Suppression overrides

The `hii-menu-actions` contract also supports `suppressions`: boolean
`enabled` and a non-empty batch of `{conditionIndex, active}` selectors. Up to
1000 distinct existing conditions can be changed in one original queue entry.
Unknown fields, offsets, expressions, classifications, non-boolean states,
duplicate selectors and malformed/missing indices reject.

Restore resolves the conditions from the current selected prefix. It proves a
unique mapped SuppressIf opcode, scope, body boundary, matching closing End and
consistent FormSet ownership against the original editing stream after regenerated
Ref moves. GrayOutIf and other read-only condition kinds remain rejected.
Every selected scope is also validated with suppression disabled on a disposable
clone using the existing bounded End relocation and structural re-read, including
paused operations and requests to restore a scope. Unproven/ambiguous conditions
reject the entire session before queue replacement.

AMI replays the same active-state assignment as its Force visible control; HII
uses the existing suppression editor and recomputes the logical checksum.
Whole-state export comparison rejects additional mutations, and source/input
buffers stay untouched. A runtime/HW condition retains its original classification
and expression: an explicit suppression override does not establish that the
condition is false or that the page is reachable on physical hardware.
The existing reconstruction path, compression/allocation checks and complete-image
re-read remain required; this adapter does not expand supported write layouts.
Synthetic tests cover both families, disable/restore, batches, paused dependencies,
remapped Ref/condition positions, invalid scopes/ownership and atomic rejection.

### Proven AMI root visibility

The `hii-menu-actions` contract accepts `ami-roots`: boolean `enabled`
and up to 1000 distinct `{rootIndex, visible}` selectors. Source buffer IDs,
byte offsets, original/replacement bytes, GUIDs, labels and detector reports are
not imported. A batch preserves one original queue entry; the original ordered
FormSet declarations remain the basis for root identity.

The AMI footer supplies only the currently opened provenance graph. Restore
requires a unique root buffer matching the complete source bytes/size, unique
buffer IDs and exactly one selected Setup HII artifact. It runs the existing
Setup PE code/vector inspector again on the immutable graph and original
FormSet declarations. The fresh report must match both the base and selected
prefix evidence exactly. Unknown/HII families, absent/ambiguous vectors, stale
reports and missing roots reject atomically, including paused operations.

Desired states are regenerated with the existing AMI root toggle. The original
byte/ownership checks and last-enabled-root guard then run through the existing
root patch planner. Whole-state export comparison rejects forged plans and
compound changes; original evidence and source bytes stay untouched.
The session does not grant full-image write acceptance: the existing accepted
source gate, compression/allocation checks and independent reconstruction/re-read
remain required. A synthetically proven vector can be planned without becoming
an accepted real-image write path.

Synthetic PE-loop regressions cover all AMI profiles, batches, paused/restore
states, immutable original bytes, fresh code/vector inspection, contradictory
source provenance, malformed selectors, the last-root guard and atomic failure.
The exact Tiano combined v2 session has the separate real-source Firefox
record below; these synthetic regressions do not establish hardware validation.

Shared load behavior is the same as Phoenix: one undoable queue replacement,
fresh revision, unapplied state and no restored verified output. Queue/source or
workspace replacement and closing the dialog discard pending completions. Empty
sessions clear the queue; generated session IDs use a separate namespace from new
local edits so subsequent staging and Undo cannot collide with restored IDs.

New AMI/HII exports use version 2 kind `hii-menu-actions`, including Ref-only
queues, so every operation has an explicit action discriminator. Strict
version-1 `hii-ref-moves`, `hii-menu-actions` and `phoenix-visibility` files are
migrated in memory before normal identity checking and replay. The migration
adds only the action implied by the old kind; it cannot add selectors or editing
capability. Unknown versions/kinds and version-1 files containing version-2
fields fail explicitly. Other AMI/HII edit adapters, full-image binary comparison and
release/recovery documentation remain separate roadmap items.

Schema/source/context/selector and dependent-prefix regressions, mixed
move/visibility replay, retained editor capability guards, menu/order and HII
restore-anchor checks, shared-control asynchronous cancellation, queue history
and React output invalidation remain synthetic/jsdom coverage. Separately, the
[exact Z03 acceptance](phoenix/z03-session-firefox-acceptance.md) reproduces the
Phoenix v2 export/import and strict v1 migration with the accepted real source in
the deployed application under Firefox, then verifies identical complete-image
outputs and source-identity rejection. The
[exact P53 acceptance](phoenix/p53-session-firefox-acceptance.md) separately
reproduces those v2/v1 guarantees for one supported static HII Ref move, including
complete-SPI preservation and byte-identical rebuilt outputs. It does not validate
other AMI/HII actions, sources, dynamic roots or physical hardware. The
[exact Tiano combined v2 acceptance](ami/tiano-session-firefox-acceptance.md)
separately verifies one accepted move/SetupData/suppression/root queue in deployed
Firefox, metadata-only export, clear/import, fresh exact complete-SPI output and
source/context rejection after reopening the changed image. Combined v1 replay
is not claimed; the old Ref-only contract cannot represent those four actions. Existing
compression/reconstruction restrictions are unchanged. The
[exact nested-LZMA combined v2 acceptance](ami/nested-lzma-session-firefox-acceptance.md)
separately verifies root/move/SetupData/suppression session export/clear/import,
fresh exact full-SPI reconstruction, removal invalidation, independent four-edit
reload and rejection on the changed image. It adds no combined v1, AMITSE or
hardware claim. The
[exact first-LZMA v2 acceptance](ami/lzma-session-firefox-acceptance.md)
separately verifies one accepted suppression session, exact complete-BIOS output,
removal invalidation, independent empty-scope reload and changed-image rejection.
This source has no descriptor-bearing SPI regions; v1, other actions and hardware
remain unclaimed.

## AMITSE menu reassignment

The `ami-menu` action contains a batch of `{ menuIndex, targetFormIndex }`
selectors and an enabled flag. The opened AMITSE hash must match the base
context; each original registration needs a unique bounded two-byte mapping,
matching original FormId and the preceding 16-byte FormSet GUID. SetupData roots
with a matching AMITSE mapping use the same proof. Destinations
are unique existing Forms in the same FormSet. The adapter regenerates only
the normal menu FormId/name assignment, preserving physical order, root evidence
and classification. Offsets, names, GUIDs and replacement bytes are never imported.
Paused entries undergo the same validation. Entire-state equality rejects
compound metadata changes; all operations validate before queue replacement.

Synthetic regressions cover the three AMI family identifiers, exact AMITSE
patch bytes, restore/paused actions, bounds, stale/hash/overlapping ownership,
cross-FormSet and ambiguous destinations, strict selectors and atomic rejection.
This does not change full-image writer acceptance or claim new real-source or
physical flash validation. Version-1 Ref-only sessions remain compatible through
the bounded v1-to-v2 migration.
