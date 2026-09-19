# Mixed firmware intake: three local archives

This intake covers 148 archive entries from three supplied BIOS collections,
representing 147 distinct SHA-256 hashes. The figures below describe this
collection only. No original firmware bytes, extracted modules, or device
identifiers are stored in this repository.

The read-only classifier examined payload bytes and checked UEFI firmware
volume headers and checksums. The deep analysis used the same Setup extraction,
IFR parsing and navigation rules as the browser corpus runner. One duplicate
entry was counted once.

| Preflight family             | Distinct images | Deep result                                                |
| ---------------------------- | --------------: | ---------------------------------------------------------- |
| Probable AMI Aptio           |              48 | 41 recognized, 4 partial, 3 unsupported                    |
| UEFI, family unresolved      |              57 | 57 unsupported; no coherent AMI Setup found                |
| Insyde UEFI                  |               6 | 6 unsupported by the AMI editor                            |
| Phoenix UEFI module evidence |               3 | 3 unsupported by the AMI editor; conflicting vendor string |
| Standalone Intel ME region   |               5 | Firmware component, not a UEFI image                       |
| Legacy AMIBIOS               |               3 | Classified only                                            |
| Phoenix BIOS                 |               1 | 34 modular FFV entries inventoried                         |
| Non-firmware file            |               2 | Classified only                                            |
| Unidentified binary          |              22 | Insufficient family evidence                               |
| **Total distinct images**    |         **147** |                                                            |

Of the 147 distinct payloads, 114 contained at least one bounded, checksummed
UEFI firmware volume; the other 33 did not. No real Award payload was present
in these archives, so Award recognition has only a synthetic signature test.
Neither filename nor the computer manufacturer's branding assigns a firmware
family on its own.

Among the 48 probable AMI Aptio images, 41 produced parsed HII with proven
navigation and an available structural edit plan. Four large HII contexts
(570–602 forms) yielded only menu evidence; no top-level root was proven, so
they remain partial. Two older images did not yield an AMI Setup FFS after
recursive extraction. One older AMI image yielded **Framework IFR** instead of
UEFI HII Forms: its read-only inventory has 6 FormSets, 62 forms and 87
references. The UEFI parser cannot safely edit that format. These are distinct
limits, not reasons to assign a guessed Aptio version.

One UEFI image without a vendor signature contained a compressed section that
trapped the decompressor. That section is now reported as undecodable while
other branches continue; no AMI Setup was found in the image. The other 56
unclassified UEFI images also did not yield a coherent AMI Setup context. The
six remaining Insyde images and three Lenovo UEFI images with Phoenix SecCore
module provenance remained outside the AMI edit path after the deep scan.
The Lenovo images also contain an Insyde copyright string; the corpus keeps
both pieces of evidence and does not claim to know their Setup implementation.

The PhoenixBIOS 4.0 image has a validated BCP/FFV module directory and
separate Setup, template and strings modules. See the
[Phoenix format investigation](../phoenix/README.md) for the offsets, module
sizes and limits of the read-only parser. A fourth supplied archive was
also searched for PhoenixBIOS and Phoenix SecCore module provenance; it yielded
no additional matches for those signatures.

An available HII edit plan does not mean a complete firmware image can be
written. Full-image recompression and independent reconstruction verification
remain blocked for every image in this intake. The corpus JSON and CSV expose
the family evidence, IFR format, stage outcomes and distinct-case denominators
so future collections can be measured on the same terms.
