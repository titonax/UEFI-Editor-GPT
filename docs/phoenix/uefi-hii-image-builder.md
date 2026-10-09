# Vendor-neutral HII image builder foundation

The `buildUefiHiiFirmwareImage` builder reinserts fixed-size HII module
edits into independently discovered FFS owners. The editor footer now exposes
Apply → Check firmware output → Output details → explicit complete-image download.
The verified bytes are cached for the current source, workspace and applied queue;
any change invalidates that result, including pending asynchronous completion.
The module-download action remains available for independent drivers; mixed
workspaces use verified complete-image output to combine parent and child changes.
See the [user flow and Firefox checks](uefi-hii-output-user-flow.md).
The uncompressed routes have synthetic engine evidence. A separate
[P53 mirrored LZMA acceptance record](p53-mirrored-lzma-output-acceptance.md) covers
the exact real source and Setup module; neither establishes physical flash validation.

## Boundaries

The internal route accepts direct FFS modules and modules reached through
uncompressed identity encapsulation in a raw PI image with a firmware volume
rooted at zero, or a complete descriptor-rooted Intel SPI.
It snapshots the image, workspace bytes and edit state before asynchronous work.
Fresh discovery must match each selected module's identity, FFS GUID, exact body
bytes and workspace span. Overlapping spans, duplicate identities and mirrored
copies are rejected unless complete physical copy ownership belongs to the exact
accepted mirrored source. A separate FFS inventory detects identical copies even when
HII discovery deduplicates copies in the same buffer.

Discovery excludes an enclosing carrier only after matching its actual PI section,
FFS owner, payload bounds and byte-identical decoded child. Valid Forms packages
within the child's independently inventoried FFS bodies belong to those inner
drivers. Identity sections containing direct HII without a nested FFS owner keep
their existing ownership. For a mixed carrier, discovery retains only its own
Forms packages in the module metadata, with original body-relative offsets and
FormSet identities; nested packages remain assigned to their inner drivers.
The complete carrier body is retained unchanged as source evidence. A carrier
marked `mixed-direct-nested` can enter the editor only with retained, validated
owned packages and nested payload envelopes. Its isolated view exposes only
its own packages; independently selected children retain separate module identity.
Missing ownership metadata keeps a carrier inspection-only. Existing Setup
selection and alternate-FormSet rules still apply; discovery is not runtime root
registration evidence.

Packages crossing a nested FFS body boundary, or present in the decoded nested
payload without a bounded FFS body owner (including FV free space), produce an
explicit diagnostic and prevent the carrier from being joined. The payload
envelope as well as its FFS body ranges are checked; a package outside those
bodies cannot be reassigned to the outer carrier merely because it is contained
in the outer FFS allocation.
Contradictory child provenance cannot silently remove an outer HII owner.

`uefiHiiOwnership.ts` provides an offset-preserving analysis copy for owned Forms
packages. It masks each proven nested payload envelope in full, including nested
string packages, and omits other Forms Packages without compacting the body.
Direct string evidence and all original offsets remain available. The workspace
retains separate original `sourceBytes` and isolated `editorBytes`. Text extraction,
binary analysis, navigation actions, move planning and replay use the isolated
stream. Failed text-extraction bodies are masked from that stream too. Source
bodies and body-relative owned-package ranges remain available independently.

Module patching checks every changed byte against those valid original package
boundaries. Code, strings, PI section headers and nested driver bytes cannot be
changed by a package edit. Full-image reconstruction derives the allowed package
ranges again from fresh source discovery; omitted or widened workspace claims
cannot override that evidence. Replay runs on a freshly constructed isolated
stream; only changed owned bytes are overlaid onto the original bodies. Zeroed
nested bytes and gaps in the view are never copied into output. A stale cached
editor view rejects reconstruction. Mixed edits must preserve their existing
Forms Package boundaries; package rebalancing in mixed carriers remains blocked.

The shared PI builder receives one expected-byte patch per exact owning FFS. Its
optional `sourceFileStart` selector distinguishes multiple HII owners in one
buffer; callers omitting it retain the previous unique-owner requirement. FFS
header and data checksums are repaired. The original allocation and image size
remain fixed, and all bytes outside the affected FFS allocations remain identical.
Complete SPI output preserves every byte outside the BIOS region.

Parent own-package changes are applied before the shared PI builder propagates
modified children bottom-up, retaining both changes before repairing enclosing
FFS checksums. Mixed output accepts complete identity-only ancestry. Compressed
mixed paths remain blocked, independently of the accepted P53 LZMA route.

The complete result is decoded again and every discovered HII module is checked
against its exact expected edited or unchanged body. A mixed parent's isolated
body is compared separately from its nested payloads: a child edit must not make
its unchanged parent appear to have received an own-package edit. The additional
`uefiHiiIdentityVerification.ts` guard compares every decoded buffer and permits
changes only in requested HII bodies, ancestor child payloads and repaired FFS
checksum fields. It verifies exact child-to-parent payload identity, unchanged
buffer provenance/allocation bounds, and valid header/data checksums, including
ancestors without HII. Thus nested FV headers, padding and non-HII siblings stay
protected even where the parent's analysis view masks them. Missing modules,
changed unselected siblings and decode failures reject the result. Outer BIOS/SPI
bounds and every non-BIOS byte remain identical too.

## Validation

`uefiHiiFirmwareRebuilder.test.ts` uses synthetic PI/IFR firmware only. Five tests
edit separate FFS modules in one buffer, independently re-open their complete raw
BIOS/SPI outputs, check inner and enclosing FFS checksums and preserve an unselected
third module, FV headers, padding and all other bytes. They cover direct modules,
one identity ancestor in raw BIOS/SPI, and two identity ancestors in complete SPI.

Negative tests cover stale bytes/GUIDs/IDs,
wrong bounds, duplicate and overlapping spans, same-buffer mirrored FFS copies,
wrapper containers, missing edits, stale End opcodes, incomplete/compressed
provenance, crossing HII ownership, unowned packages in nested FV free space,
contradictory child metadata, decode
failures and contradictory full-image re-extraction.
`uefiImageRebuilder.test.ts` covers the selector's ambiguous/missing-owner rejection.
Mixed inventory tests assert one outer-owned package/FormSet and three separate
inner drivers with no duplicated package ownership. Nine reconstruction variants
cover parent-only, child-only and combined edits in raw BIOS, SPI and SPI with two
identity levels. A queued parent Ref move plus child Show runs through the actual
isolated workspace, semantic planner, queue, patcher, builder and independent
read-back. Another test rebuilds a selected child while retaining an unselected
mixed parent. Negative read-back tests cover unowned bytes, nested FV headers,
checksum corruption, altered requested edits with repaired checksums, provenance
changes and missing buffers. Stale views reject output; omitted summary envelopes
cannot remove fresh ownership isolation. Source buffers remain unchanged.

Workspace tests verify isolated mixed/child analysis without duplicate packages,
masking of failed extraction bodies, and exclusion of carriers lacking ownership
evidence. Footer tests require verified full-image download for mixed workspaces
and keep separate module export disabled. These are synthetic regressions, not
real mixed-source or physical flash acceptance.

`uefiHiiOwnership.test.ts` verifies unchanged source bytes, stable offsets,
preserved direct strings, removed nested payloads/strings, ordinary views,
malformed and overlapping envelopes, stale package claims, length changes and
changed bytes outside owned packages. Workspace tests verify text extraction
receives a separate copy and original bodies retain their package bounds.
An additional synthetic PI carrier regression stages a valid own-package
SuppressIf edit and rejects the same edit redirected into its nested driver.
Existing raw/SPI reconstruction regressions now also supply empty or widened
summary claims to prove the builder derives its own bounds independently.

## Remaining gates

Mixed direct/nested HII editing and combined reconstruction now have synthetic
evidence for bounded, fixed-package, uncompressed identity paths. A real mixed
source acceptance record remains pending; this does not establish broad vendor
compatibility. Compressed mixed paths and mixed package rebalancing remain blocked.
Generic LZMA output has exact
real-source acceptance only for the P53 Setup FFS and its two physical copies.
Other LZMA sources/drivers, EFI/Tiano, unknown mirrored modules, wrappers, capsules,
allocation growth and runtime root registration remain unsupported. AMI acceptance
never enables the generic route, and generic acceptance never enables AMI output.

The exact P53 source now reproduces one queued Ref move through complete-image
reconstruction and independent re-extraction. The generic footer retains the full
source image, reports each modified module's independently verified physical
FFS copies (offsets are relative to their decoded buffers), and shows the existing
compression capacity and preserved non-BIOS bytes. Downloads use the checked bytes
without rebuilding and always return a complete `.bin` for a complete SPI input.
Synthetic frontend tests cover Apply, explicit download, failure/retry, exact cached
bytes, report contents, queue mutations, source/workspace replacement and stale
asynchronous completion. This is separate from the real source engine acceptance;
Firefox/hardware behavior is not established by the synthetic UI tests.
Root FormSet presence continues to be distinct
from runtime registration or visibility. The [root evidence table](uefi-hii-root-evidence.md)
retains all parsed declarations, including entries with incoming cross-FormSet Refs,
without adding registration or runtime-visibility edits.
