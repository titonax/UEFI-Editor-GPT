# Portable queue sessions

Phoenix Setup can save/load `firmware-session.json` from the Change queue dialog.
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

Version 1 has no prior portable format to migrate. Unknown versions and other
editor kinds fail explicitly. It does not replace AMI `data.json` or serialize
AMI/HII Data, root evidence or IFR moves. Those session adapters need separate
runtime validation and provenance rebuilding before support can be claimed.
Binary full-image comparison and release/recovery documentation remain separate
roadmap items.

Validation is synthetic: schema/source/selector regressions, shared-control
asynchronous cancellation and Phoenix React output invalidation. No new
real-source session round-trip, Firefox acceptance or physical flash test is
claimed. Existing LH5/reconstruction restrictions are unchanged.
