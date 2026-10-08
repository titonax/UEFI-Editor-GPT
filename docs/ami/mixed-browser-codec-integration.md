# Nested browser codec reconstruction checks

The Pages build now tests complete bottom-up reconstruction through the actual
WASI/browser adapters after building its codec assets. This closes an integration
gap between native EFI/Tiano round trips, mocked standard-codec unit tests and
real-image acceptance of the currently supported sources.

Four independently generated synthetic PI/SPI fixtures exercise LZMA→EFI,
EFI→LZMA, LZMA→Tiano and Tiano→LZMA. Each has a compressed outer firmware volume
and a separately compressed inner FFS section. Its raw payload is test data,
not a real BIOS or semantic HII fixture. Initial EFI/Tiano streams come from
the compiled C encoder; LZMA streams come from the application's JS encoder.

The ordinary `rebuildUefiImage` writer uses the real codec factories and changes
a bounded inner payload. It repairs the inner FFS checksum before encoding its
parent, then repairs the outer FFS checksum. A fresh `decodeFirmwareBuffers`
call parses the complete output and independently decodes both ancestors with
the WASI readers, including the Rust LZMA reader rather than the JS encoder's
own round-trip decoder.

Each scenario checks:

- Exact reopened inner stream, both FFS header/data checksums and no decoding
  failures.
- Fixed total SPI size and byte-identical Descriptor/ME before the BIOS region.
- Preserved FV headers and bytes outside both owned FFS allocations.
- Two rebuilt compressed boundaries in the expected bottom-up report order.
- Explicit rejection when a less compressible replacement exceeds the inner
  allocation, with immutable original image and decoded buffers after success
  and failure.
- Continued `writeEnabled: false` from the application acceptance assessment:
  codec integration does not promote a synthetic source to output readiness.

These four tests run on every Pages pull-request/main build after WASM compilation
and before the production app build. They use freshly built artifacts in CI and
commit no WASM binaries or firmware. They are separate from the ordinary synthetic
unit coverage suite because the latter runs without built WASM assets.

To reproduce locally using the same assets:

```bash
FIRMWARE_CODEC_WASM_DIR=/path/to/pages-assets npm run firmware:codec-integration
```

The directory needs `firmware-decompress.wasm` and `tiano-decompress.wasm`.
Missing assets fail the check; it does not silently skip integration tests.

**EFI and mixed compressed real-image output remain blocked.** Passing these
fixtures proves the assembled codec/reconstruction path on synthetic bytes,
not physical flashing, an actual BIOS layout, or compatibility with additional
sources. A real source still needs bounded provenance, independent requested-edit
re-extraction and its own documented acceptance before the application gate can
be extended.
