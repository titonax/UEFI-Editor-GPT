# Intel NUC10i5FNH / Frost Canyon BIOS 0067

> Metadata-only research record. The supplied firmware image is not committed.

## Identity

| Field                  | Observation                                                                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supplied file          | `FNCML357.0067(2).CAP`                                                                                                                                                |
| Product                | Intel NUC10i5FNH / Frost Canyon; [ASUS support page](https://www.asus.com/supportonly/nuc10i5fnh/helpdesk_bios/) lists BIOS 0067 and the NUC Firmware Integrator Tool |
| Size                   | 20,971,520 bytes                                                                                                                                                      |
| SHA-256                | `12770cbddbab0fd071e91142afe6b1882c7a50c0e7b438866f6b99b5c660da64`                                                                                                    |
| Input format           | Firmware-volume image starting with a valid FV at offset `0x0`, despite the `.CAP` suffix                                                                             |
| Outer scan             | 19 valid FFS2 firmware volumes, 15 LZMA GUID-defined sections, no directly visible Setup or AMITSE FFS                                                                |
| AMI family             | `AMITSESetup` and other AMI structures observed                                                                                                                       |
| Current app generation | Unresolved: the IV/V layout alone does not establish the generation                                                                                                   |

The hash matches the `FNCML357.0067.CAP` row in
[`sample-corpus.md`](../sample-corpus.md). The support site is now operated by
ASUS, but the image identifies the Intel NUC product family; it is kept as an
**Intel** observation rather than counted with ASUS motherboards. The
manufacturer is not inferred from the support site's domain.

## FID evidence

The supplied bytes contain three consistent FID records, each with the AMI
FID GUID `2EBE0275-6458-4AF9-91ED-D3F4EDB100AA` immediately before the
`$FID` marker. The markers are at offsets `0xCC2FB4`, `0xDC2FB4` and
`0xE000A4`. Each record contains ASCII `05` at `$FID + 0x20`, `FNCML357`
near the start, and `INTEL` after its date/version fields.

These bytes and the site's `iFlashV` tool are consistent with an Aptio V
identification. The application's present generation detector has not yet
validated the FID record as a general discriminator, so this sample does not
add a confirmed generation count to the manufacturer catalogue. Generation
must not be inferred from `.CAP`, the support site's domain, or `iFlashV`
alone.

## Setup navigation

The existing regression in
[`single-formset-ifr-navigation.md`](../single-formset-ifr-navigation.md)
records a single-FormSet IFR hub: nine direct visible tabs and four
constant-suppressed tabs inside Setup FormId `0x2710`. There are no matching
AMITSE page registrations. Its IFR parentage proves the navigation mechanism
despite that absence; the regression exposed nine Hide and four Show actions
on the extracted HII stream. This does not establish safe whole-image writing.

The CLI read-only preflight of the attached bytes reproduced the outer scan
and SHA-256 above. A full runner invocation in this local environment stopped
at extraction because the WebAssembly decompressor asset is not installed in
the checkout; this is an execution-environment limit, not a negative firmware
classification. The existing navigation regression is recorded separately.

## Catalogue use

The exact hash identifies this Intel case even when the file is renamed.
`Intel` or the exact `FNCML357` family token in a filename is a weaker clue
for other inputs. Vendor observations guide investigation; each new image
still requires independent parsing and safe reconstruction checks.
