# ASUS N10J AMIBIOS8 legacy intake

`ASUS N10J BIOS.BIN` is a 1,048,576-byte legacy BIOS image, not an Aptio/UEFI
image. Its SHA-256 is
`78575954ba80c09b40b0283a0dc6b918ffeb4b9623a58613225cd85dd544ca4b`.

The bounded recognizer confirms three independent AMIBIOS8 boot invariants:

- `AMIBIOSC0800` at `0xDFFEA`;
- `AMIBOOT ROM` at `0xF004C`;
- an x86 far-jump reset vector to segment `F000` at `0xFFFF0`.

The final boot block also carries the BIOS date `11/24/08`. No checksummed UEFI
PI firmware volume exists, so UEFI HII extraction is not applicable. The UI
reports the image as a confirmed **AMIBIOS 8 legacy ROM** and does not invoke
the Aptio extractor.

AMIBIOS8 uses a distinct modular layout. Open-source 1B tooling documents a
component table containing target physical addresses, sizes, optional names and
fixed-allocation component data. That format is a future read/write path; this
case does not infer or edit a 1B module until its containing module is located
and validated independently.

References:

- [AMIBIOS8 1B utilities and format notes](https://github.com/pinczakko/AMIBIOS8_1B_Utils)
- [AMIBIOS8 1B header definitions](https://github.com/pinczakko/AMIBIOS8_1B_Utils/blob/master/ami_1B.h)
