# Portable queue sessions

Phoenix Setup and full-image AMI/vendor-neutral HII editors can save/load
`firmware-session.json` from the Change queue dialog. AMI/HII currently support
queues of individual Ref moves only; other operations reject export explicitly.
The user first opens and analyses the original firmware normally, then loads the
session. Renaming the original file is fine; changing any image byte, image size
or decoded template rejects the session. All hashing and JSON processing are
local. The session does not include firmware bytes or upload anything.

The initial format is `uefi-editor-queue-session`, version `1`, kind
`phoenix-visibility`. It records only:

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

## AMI/HII Ref move sessions

Version 1 kind `hii-ref-moves` stores full-image SHA-256/size, an opened-context
SHA-256 and ordered `sourceFormIndex`, `referenceChildIndex`,
`destinationFormIndex`, `enabled` selectors. These indices refer to the selected
prefix at that step, not to global FormIds. The context digest binds the original
editing stream, complete logical base/evidence, family and current trusted module
locations/ownership. Repeated AMI contexts and joined/isolated HII workspaces must
match exactly. Reopening with a different parser/model may conservatively reject
a session; this version has no migration mechanism.

Every imported operation, including paused ones, runs `moveMenuReference` against
the currently selected prefix and original opened stream. Normal opcode, scope,
ownership, cross-package length, graph and expected-byte guards remain in force.
Only selected operations advance that prefix. Labels, logical patches, IFR byte
moves, remapped offsets and binary analysis are regenerated locally. The JSON
cannot replace Data or assert its own binary evidence. Invalid later operations
reject the entire load without replacing any entries or touching the source.

Export proves that each queued entry is exactly one regenerated Ref move by
comparing its complete projected state with the normal editor's result. Stale
entries, dependent operations whose prerequisites were paused/removed/reordered,
compound changes and scalar, suppression, root/tab visibility or menu-retargeting
operations reject export, including paused entries. Nothing is silently omitted.
An AMI workspace opened from extracted artefacts alone has no full-image identity
and does not expose these session controls. Existing AMI `data.json` is unchanged.

Shared load behavior is the same as Phoenix: one undoable queue replacement,
fresh revision, unapplied state and no restored verified output. Queue/source or
workspace replacement and closing the dialog discard pending completions. Empty
sessions clear the queue; generated session IDs use a separate namespace from new
local edits so subsequent staging and Undo cannot collide with restored IDs.

Version 1 has no prior portable format to migrate. Unknown versions/kinds fail
explicitly. Other AMI/HII edit adapters, full-image binary comparison and
release/recovery documentation remain separate roadmap items.

Validation is synthetic: schema/source/context/selector and dependent-prefix
regressions, shared-control asynchronous cancellation, queue history and React
output invalidation. No new real-source session round-trip, Firefox acceptance or
physical flash test is claimed. Existing compression/reconstruction restrictions
are unchanged.
