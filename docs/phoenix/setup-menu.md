# Phoenix Setup menu reader

The firmware preflight now reads legacy Phoenix Setup tables separately from
AMI HII. After detection, **Start Phoenix Setup analysis** opens a full editor
workspace matching the Aptio layout: loaded-file header, resizable menu tree,
top-level summary, selected-screen details and a dedicated footer. It locates
bounded `TEMPLAT*.ROM` and `STRINGS*.ROM` FFV modules,
decompresses LH5 payloads, resolves `STRPACK-BIOS` strings and parses the
template records. Phoenix SecureCore images can contain this legacy module
pair even without a `PhoenixBIOS` banner or BCP directory.

When the template has a recognized root pointer at offset `0x68` (relative to
the Phoenix BIOS Editor module), the displayed tab names and membership come
from that table. Older templates can instead carry the same terminated
`(label, content)` directory without that fixed pointer; the reader discovers
it only when every label and target screen validates structurally. Other
templates are displayed as **inferred item groups**: contiguous item runs do
not prove tab identity or runtime visibility. Pick Field options describe
available choices, not the machine's current NVRAM setting. A detected
visibility callback is evidence, not a runtime evaluation.

Each screen list also carries an auxiliary pointer per item. The reader follows
it as a submenu only when it resolves to another bounded, terminated and
text-bearing item list. Ordinary `0x11` information rows remain Information;
they are no longer labelled as submenus merely because of their record type.

The parser also inventories terminated, interactive screen directories that
exist in `TEMPLAT.ROM` but are not reachable from the registered root tabs.
They are shown as **Unlinked / hidden screens**, never silently attached to a
guessed parent. Proven child pointers inside those orphan screens are still
followed recursively. On the Acer Z03 this recovers the retained advanced,
cache, resource and CPU/power pages, including the real `Primary Master`,
`Primary Slave` and `SATA Port 1`–`SATA Port 4` child directories.

Verified callbacks expose an on-demand **Trace callback** action. It decodes
bounded x86-16 paths, direct control-flow edges and reachable `AX` return values
inside the Phoenix workspace. See
[Phoenix callback behavior analysis](behavior-analysis.md) for its architecture,
limits and controlled-execution roadmap.

The Acer Z03 sample (`ACER-Z03-20140701.bin`, SHA-256
`d34c9695d6d54595836212021797dd7557cabae0d25fd33cd0faa87c25640194`)
produces the known 34-module inventory. Its alternative root directory resolves
five real top-level screens: Information, Main, Security, Boot and Exit. This
case is detected from the directory's structure, not from the Acer model name
or a hard-coded offset.

The workspace is read-only. It does not produce a flashable Phoenix ROM or expose
the callback patch and Phoenix BIOS Editor export that exist in Claude's
experimental parser. Behavior tracing also leaves every byte unchanged. Writing
requires a separate review and a validated path for each supported template.
