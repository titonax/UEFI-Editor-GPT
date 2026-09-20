# SetupData control flags

The byte at offset +16 of a matched 54-byte AMI SetupData question record is
stored in the editor as `accessLevel` for compatibility with exported data.
The interface displays the raw byte and its set bits as **SetupData flags**.
It does not use those bits to decide whether a form or question is visible.

The [cross-vendor analysis in UEFI-Editor-CLAUDE](https://github.com/titonax/UEFI-Editor-CLAUDE/blob/main/docs/ami/setupdata-control-flags.md)
found that bit 0 was present in every one of more than 33,000 matched records
in an initial 14-image set; the bit did not distinguish known hidden pages
from visible ones. Later samples added other flag combinations. Their exact
meanings have not been established. IFR conditions and corroborated navigation
evidence remain the basis for visibility decisions.
