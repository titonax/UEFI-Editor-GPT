# Firmware-context selection

Modern AMI images can contain more than one valid copy of Setup, AMITSE and
SetupData. A GUID identifies a module type; it does not identify the active
firmware slot. Selecting the first global occurrence can silently combine Setup
from one copy with policy data from another.

## Laboratory evidence

The modern corpus covered Supermicro H14SHM, H14SSL and X14SAE-F plus ASRock
TRX50, WRX90, W790, X870 and Z890 families. Across these samples:

- Setup HII remained standard PI/HII data, commonly exposed through the `HII`
  PE resource and the shared AMI Setup FormSet GUID;
- the surrounding Setup path used the usual GUID-defined LZMA encapsulation;
- `$SPF` remained shared SetupData evidence and did not distinguish Aptio IV
  from Aptio V;
- H14 images contained two complete Setup/AMITSE/SetupData sets, so the decoded
  buffer and firmware-volume slot were required to keep them separate;
- some images carried generic AMI and OEM navigation profiles together; and
- duplicate names such as `Main` or `Advanced` were not sufficient to collapse
  pages or choose a live profile.

These observations are deliberately expressed as structural rules rather than
vendor or board-name exceptions.

## Selection model

The extractor now separates five concerns:

1. the physical input image;
2. the decoded encapsulation branch and FV/FFS ownership;
3. the selected HII graph;
4. AMITSE/SetupData navigation and profile policy; and
5. runtime visibility or availability conditions.

Every usable Setup occurrence becomes a firmware-context candidate. Companion
modules are ranked in this order:

1. same decoded buffer and same firmware volume;
2. same decoded buffer;
3. one unambiguous shared encapsulation branch.

If two companions have the same best provenance, neither is attached. If more
than one usable Setup context remains, the preflight requires the user to select
one before entering the HII tree. The choice is local and the selected context's
provenance is carried with the extracted artefacts.

This phase does not decide which redundant slot the platform will boot, nor does
it enable complete-image writing. It prevents cross-slot analysis and preserves
the information required for later reconstruction and slot-aware editing.
