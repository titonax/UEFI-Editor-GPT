# Phoenix Setup menu reader

The individual firmware view now reads legacy Phoenix Setup tables separately
from AMI HII. It locates bounded `TEMPLAT*.ROM` and `STRINGS*.ROM` FFV modules,
decompresses LH5 payloads, resolves `STRPACK-BIOS` strings and parses the
template records. Phoenix SecureCore images can contain this legacy module
pair even without a `PhoenixBIOS` banner or BCP directory.

When the template has a recognized root pointer at offset `0x68` (relative to
the Phoenix BIOS Editor module), the displayed tab names and membership come
from that table. Other templates are displayed as **inferred item groups**:
contiguous item runs do not prove tab identity or runtime visibility. Pick
Field options describe available choices, not the machine's current NVRAM
setting. A detected visibility callback is evidence, not a runtime evaluation.

The Acer Z03 sample (`ACER-Z03-20140701.bin`, SHA-256
`d34c9695d6d54595836212021797dd7557cabae0d25fd33cd0faa87c25640194`)
produces the known 34-module inventory. The reader finds four inferred groups
containing 343 parsed records. These are not confirmed as four BIOS tabs.

This view is read-only. It does not produce a flashable Phoenix ROM or expose
the callback patch and Phoenix BIOS Editor export that exist in Claude's
experimental parser. Those operations require a separate review and a
validated write path for each supported template.
