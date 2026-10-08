# P53 mirrored LZMA Setup full-image acceptance

This record covers one existing 32 MiB Intel SPI source, not model-wide write
support. The internal vendor-neutral HII builder returns a complete image after
one queued, same-package Ref move and independently re-opens both physical Setup
copies. The footer download is still pending integration. Runtime root
registration and physical flash validation are not established by this result.

## Source and ownership

- Source SHA-256: `68eba5b369baf36c879551c0482a6feea31d68082bc4dd0631bf9e4427a88a64`.
- Complete source size: 33,554,432 bytes; BIOS region `[10485760, 33554432)`.
- Descriptor `[0, 4096)`, GbE `[4096, 12288)`, ME `[12288, 10485760)`.
- Discovery: nine decoded buffers, 25 canonical HII modules, no decode/ownership
  failures. The joined workspace retains nine modules and 187 Forms; the Startup
  GUI alternate is not joined because its FormSet is already supplied.
- Setup FFS GUID: `E6A7A1CE-5881-4B49-80BE-69C91811685C`.
- Two byte-identical decoded volumes, buffers 2 and 4, each 20,123,648 bytes.
  In each, Setup occupies FFS `[4127440, 4736210)` and body
  `[4127464, 4736210)` (608,746 bytes).
- The independent enclosing LZMA allocations are root FFS
  `[13238344, 17752012)` and `[21495880, 26009548)`.
  Their GUID is `9E21FD93-9C72-4C15-8C4B-E77F1DB2D792`.

These are physical copies in distinct SPI volumes, not interchangeable views of
one allocation. Fresh discovery resolves every exact GUID/body match and checks
that each occupies a distinct decoded buffer and that the complete membership
matches the workspace. An accepted edit is applied to every proved copy. Omitting
one copy or merely changing the cached mirror list is rejected.

## Edit and output

Move the selected **Debug Settings** Ref (FormId `0x1006`, original module-relative
IFR offset `0x6AB87`) from **Intel Advanced Menu** to **PCI Subsystem Settings** in
the same existing Forms Package. The queue produces one fixed-size Setup module
patch; neither new Forms nor new FormSets are created. The complete Ref payload
is preserved and the closing/ownership structure is independently re-read.

- Output SHA-256: `4c52549b9df88a7763eedf4fa0cf842909d800431b10a88c76d73c851792d10b`.
- Output size: 33,554,432 bytes; changed bytes: 8,991,518.
- Both LZMA sections: original 4,513,620 packed bytes, rebuilt 4,491,300 bytes,
  verified capacity 4,513,620 bytes, remaining 22,320 bytes each.
- Allocation fit uses only the existing payload/verified terminal padding.
  No FFS allocation grows and no global free-space claim is made.
- Inner Setup and enclosing FFS checksums are repaired in both copies.
- Every byte outside the two enclosing FFS allocations is identical, including
  all 10,485,760 bytes outside the BIOS region.
- Fresh WASI decoding re-opens the complete output. Both physical Setup bodies
  match the expected module patch. All discovered HII copies, including
  unselected drivers/alternates, are checked against edited or original bodies.
- Independent binary IFR and fresh IFRExtractor text confirm that the selected
  Ref belongs to the destination Form and that source/destination Ref counts
  change by minus/plus one. The canonical HII inventory remains 25 modules.

## Reproduction and rejection checks

`npm run firmware:acceptance` selects this real-input test with:

```bash
FIRMWARE_ACCEPTANCE_SCENARIO=uefi-hii-mirrors \
FIRMWARE_ACCEPTANCE_IMAGE=/private/source.bin \
FIRMWARE_ACCEPTANCE_WASM_DIR=/private/pages-codecs \
npm run firmware:acceptance
```

The input and WASM assets are local and are not committed. The test exercises the
shared selectable queue and the production generic builder. Stale Ref expected
bytes, edits to other joined drivers, an incomplete mirror list and a source hash
changed outside BIOS are
rejected without changing the source. Ordinary synthetic tests continue to reject
unknown mirrored sources and incomplete/compressed unaccepted paths.

## Scope and remaining work

Acceptance is limited by the exact source hash and size, and by the tested Setup
FFS GUID. Other joined Lenovo drivers do not receive compressed edit acceptance.
The generic acceptance predicate does not grant AMI HII, SetupData, AMITSE,
EFI/Tiano or AMI root-vector acceptance. Every build still requires complete
provenance, original-byte agreement, allocation fit and independent full-image
verification. A different P53 dump requires its own source acceptance.

Next: integrate check/report/explicit download into the generic footer, including
clear reporting of both physical copies and result invalidation on source/queue
changes. Mixed direct/nested HII ownership, other compressed drivers, wrappers,
capsules, allocation growth and unproven runtime root controls remain blocked.
