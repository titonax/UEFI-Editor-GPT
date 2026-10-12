# Recovery and release readiness

This guide covers the existing verified complete-image output paths. The app
ends at an explicit download. A successful Check proves reconstruction,
independent re-extraction and requested edits for the opened source; physical
flashing and recovery need their own evidence.

## Preserve the original and the editing context

Before staging changes, keep an unmodified copy of the exact input image and a
separate backup location. Record its size and SHA-256 locally. Keep the original
container scope: complete SPI, BIOS region or legacy ROM. A manufacturer update
file is not automatically a complete device backup.

Record the application revision, detected family, selected Setup context and
intended edits. Save the queue session where available. Sessions contain source
identities and semantic selectors; they require the original firmware and the
same compatible opened context. They do not contain a backup, verified output
or a flash recovery mechanism. Existing AMI `data.json` has a separate schema.

Original images, decoded modules, device-specific NVRAM and identifying values
stay local. Public issue/case records should contain reviewed metadata and
anonymized diagnostics rather than firmware, serials or private paths.

## Review the output before using a flashing tool

1. Review the selected queue, Apply it and run **Check firmware output**.
   An error leaves the output blocked; resolve the reported source, ownership,
   compression, size or structural failure before continuing.
2. Open **Output details**. Check complete size, source allocations, verified
   physical copies and section-specific remaining capacity. Complete SPI input
   must produce complete SPI output, with every non-BIOS byte preserved exactly.
3. Review the complete-image comparison. Totals cover every byte; the display
   retains the first 64 changed ranges and at most 16 byte pairs per range.
   Compression, padding and checksum repairs can change bytes beyond the edited
   fields. The samples are bounded inspection data, not a complete hex dump.
4. Download the exact verified image explicitly. AMI also downloads its change
   log. Preserve the output separately from the original and record its hash.
   Opening details or downloading uses the checked bytes without another build.
5. Reopen the downloaded file for inspection of the intended edits and container
   scope. This is a file/engine check. Record physical boot, Setup behavior and
   recovery separately if those are tested later.

Queue changes, Undo/Redo, restored sessions and source/context replacement require
fresh Apply and Check. A previously downloaded file remains a local artifact;
changing the current queue does not update that file.

## Family-specific boundaries

| Path                                                  | Output/recovery boundary                                                                                                                                                                                                       | Evidence and remaining gate                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AMI Aptio IV/V accepted complete-image paths          | Preserve BIOS-only versus complete-SPI scope. Use a device-specific method that accepts that exact scope and preserves device-specific data. A `.bin` download does not establish compatibility with a vendor capsule updater. | [Writer boundaries](ami/full-image-reconstruction.md), [combined Tiano acceptance](ami/tiano-combined-queue-acceptance.md) and [output workflow](ami/firmware-output-user-flow.md). Exact LZMA acceptance remains HII-only; broader layouts and AMITSE output remain subject to their existing gates. |
| Vendor-neutral UEFI HII accepted P53 Setup path       | Preserve the complete SPI and both verified physical Setup copies. Keep the opened source and selected context together. Changes to a different compressed driver need their own acceptance.                                   | [Mirrored LZMA acceptance](phoenix/p53-mirrored-lzma-output-acceptance.md) and [output/Firefox checklist](phoenix/uefi-hii-output-user-flow.md). Engine and real-source React/jsdom acceptance do not complete the manual Firefox or physical flash gates.                                            |
| PhoenixBIOS legacy accepted Z03 fixed-allocation path | Preserve the complete legacy ROM and existing FFV/LH5 allocation. Use the documented recovery method for the exact device and ROM format; do not substitute UEFI capsule procedures.                                           | [Phoenix investigation and Z03 reconstruction](phoenix/README.md#z03-reconstruction-acceptance). Proven Show callbacks and fixed allocations are the supported write scope; directory growth and unproven callbacks remain blocked.                                                                   |
| Other/read-only paths                                 | Keep the original for analysis and recovery. A parsed tree, extracted module or family label does not establish a complete-image write path.                                                                                   | Award/AMIBIOS8 legacy output, EFI variant, mixed compressed ancestry and other unsupported layouts retain their documented blockers in the [roadmap](roadmap.md).                                                                                                                                     |

## Prepare a recovery method for the actual device

Choose the recovery/flashing method from the documentation for the exact device,
firmware storage and image scope. Confirm its expected input container, whether
it accepts a complete SPI or only a region, and how device-specific contents are
preserved. Keep the required recovery media/tool and original backup available
before writing. Establish how to restore the original if normal boot or Setup
access is lost; an alternate access method may be necessary for that device.

Do not treat renaming an image, extracting a region, a force flag or disabling
signature/size checks as validation. If the available flashing method requires a
signed capsule that this project does not produce, that method remains outside
the supported output workflow. This guide supplies no universal flash command
or hardware recovery recipe: those depend on the actual device.

After a hardware test, record the exact revision/source/output identities,
flashing method, boot result, requested Setup behavior and recovery result.
A working manually modified ROM from an earlier experiment does not establish
physical acceptance of a new application-generated output.

## Release checklist

Application release, AMI `data.json` schema and queue-session format are independent
versions. This documentation does not bump any of them; version-1 queue imports
still reject unsupported future versions instead of guessing a migration.

A release record must identify its commit and enumerate each advertised write
path with the following evidence:

- Passing formatting, lint, case checks, enforced coverage, project typecheck and
  production build for that commit, with successful PR CI.
- Positive and negative reconstruction regressions, independent re-extraction,
  requested-edit checks, allocation/checksum checks and non-BIOS preservation.
- A real-source acceptance record for each advertised source/layout/edit scope.
  Synthetic coverage and family/brand similarity cannot widen that scope.
- Browser/deployed-asset validation for the advertised user flow, including queue
  invalidation, Check failure, details, explicit download and reload. Retain the
  missing Firefox gate for the supported P53 flow until it is actually completed.
- Linked recovery guidance and a clear physical-flash validation status. Document
  hardware results when measured; engine or browser success is not that result.
- Explicit limitations for excluded codecs, layouts, root semantics, allocation
  growth, capsule output and session-version migration.

A release can keep unsupported paths excluded with their controls blocked. It
must not describe an unvalidated path as accepted. Current missing Firefox and
real mixed-source acceptance remain visible; this guide does not pass those gates,
expand the BIOS corpus or resume P53 dynamic-root research. Review the
[roadmap](roadmap.md) for the next bounded work item before starting another PR.
