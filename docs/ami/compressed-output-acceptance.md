# First compressed AMI full-image acceptance

The input is the 16 MiB `BIOS/16M.BIN` member of the user-supplied
`BIOS(1).zip`. Its SHA-256 is
`fcd0a7d9f42934b92783bc569ad3f48dea8e6b9775d0fafdd7b2dee9af587b03`.
The name alone does not identify a motherboard or generation. No firmware
bytes, decoded modules or identifying NVRAM data are committed.

The deployed browser WASI decoders found one AMI Setup context, one Forms
package, 277 forms and 3,548 `SuppressIf` conditions. Setup HII (2,459,840
bytes), AMITSE (1,897,504 bytes) and SetupData (629,696 bytes) have complete
paths through LZMA sections. The outer Setup section ends exactly at the end
of its FFS; its firmware volume declares erase polarity `0xff` and the next
FFS alignment bytes are `0xff`.

On this exact input, disabling the `SuppressIf` at IFR offset `0x5B2D9` with
the normal patch builder produced a 16 MiB output. The rebuilt image was
independently re-extracted: its Setup HII bytes matched the requested patch,
the Forms package reopened, and the bytes outside the owned FFS and outside
the BIOS region stayed unchanged. The output SHA-256 was
`31973e862e1929f8791508582da5189f28355a2577fcab15f28f90056299d543`.
There were 4,987,327 changed bytes, all within the owning FFS interval
`[2949240, 7956530)`; the large byte count reflects recompression. The changelog contained only the requested
Setup HII edit.

The acceptance is deliberately limited to Setup HII edits for this exact
source hash. Edits to AMITSE or SetupData, another hash, EFI/Tiano ancestors,
and FFS growth remain blocked. This is binary reconstruction and re-open
evidence, not physical flash validation or evidence of broad Aptio support.

## Reproduce the acceptance

Build or obtain the same WASI assets used by Pages, then run:

```bash
FIRMWARE_ACCEPTANCE_IMAGE=/path/to/16M.BIN \
FIRMWARE_ACCEPTANCE_WASM_DIR=/path/to/wasm-assets \
npm run firmware:acceptance
```

The assets directory must contain `firmware-decompress.wasm`,
`tiano-decompress.wasm` and `ifrextractor.wasm`. This explicit local test rejects
another source hash. It runs the normal parser, patch builder and complete-image
builder, then re-extracts with the WASI readers and regenerates IFR text. It checks
Setup HII, unchanged AMITSE/SetupData, image size/layout, immutable source and every
byte outside the owned FFS, and prints metadata only. It writes no firmware and
is separate from the synthetic CI suite because the BIOS is not in the repository.

The same explicit test also accepts the separately reviewed
[Tiano SPI source](tiano-spi-output-acceptance.md), choosing the test edit by its
exact source identity. Neither source acceptance authorizes the other source's
compression class or mixed ancestors.
