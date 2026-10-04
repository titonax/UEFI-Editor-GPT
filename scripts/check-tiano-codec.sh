#!/usr/bin/env bash
set -euo pipefail

scratch_dir=$(mktemp -d)
trap 'rm -rf "$scratch_dir"' EXIT

gcc -O2 -DNDEBUG -Itools/tiano-wasi \
  tools/tiano-wasi/main.c tools/tiano-wasi/Decompress.c \
  tools/tiano-wasi/EfiCompress.c tools/tiano-wasi/TianoCompress.c \
  -o "$scratch_dir/codec"
python3 - "$scratch_dir/source.bin" <<'PY'
import sys
with open(sys.argv[1], "wb") as output:
    output.write(bytes(range(256)) * 16 + b"EFI/Tiano" * 1024)
    output.write(bytes((i * 73 + i * i * 19) % 256 for i in range(32768)))
PY

for mode in efi tiano; do
  "$scratch_dir/codec" "$scratch_dir/source.bin" "$scratch_dir/$mode.bin" "compress-$mode"
  "$scratch_dir/codec" "$scratch_dir/source.bin" "$scratch_dir/$mode-again.bin" "compress-$mode"
  cmp "$scratch_dir/$mode.bin" "$scratch_dir/$mode-again.bin"
  "$scratch_dir/codec" "$scratch_dir/$mode.bin" "$scratch_dir/$mode.decoded" "$mode"
  cmp "$scratch_dir/source.bin" "$scratch_dir/$mode.decoded"
done

if "$scratch_dir/codec" "$scratch_dir/efi.bin" "$scratch_dir/wrong.bin" tiano 2>/dev/null; then
  echo "Tiano incorrectly decoded EFI compression" >&2
  exit 1
fi
printf '\000\000\000\000\000\000\000\000' > "$scratch_dir/invalid.bin"
if "$scratch_dir/codec" "$scratch_dir/invalid.bin" "$scratch_dir/invalid.decoded" efi 2>/dev/null; then
  echo "Malformed EFI compression header was accepted" >&2
  exit 1
fi
printf 'EFI/Tiano native round trips and variant rejection passed.\n'
