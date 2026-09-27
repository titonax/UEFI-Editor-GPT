import { LhaReader, Uint8ArrayReader, Uint8ArrayWriter } from "@kirinsaninc/lhats";
import type { PhoenixCompressionCodec } from "./phoenixCompressionCodec";

const LH5_MAX_BLOCK_SYMBOLS = 0xffff;

class MostSignificantBitWriter {
  private bytes: number[] = [];
  private currentByte = 0;
  private usedBits = 0;

  write(value: number, bitCount: number) {
    if (!Number.isInteger(value) || value < 0 || value >= 2 ** bitCount) {
      throw new RangeError(
        `Value ${String(value)} does not fit in ${String(bitCount)} bits.`,
      );
    }

    for (let bit = bitCount - 1; bit >= 0; bit -= 1) {
      this.currentByte = (this.currentByte << 1) | ((value >>> bit) & 1);
      this.usedBits += 1;
      if (this.usedBits === 8) {
        this.bytes.push(this.currentByte);
        this.currentByte = 0;
        this.usedBits = 0;
      }
    }
  }

  finish(appendGuardByte = false) {
    if (this.usedBits > 0) {
      this.bytes.push(this.currentByte << (8 - this.usedBits));
    }
    // Some bounded readers reject a constant-table final symbol when no
    // physical input bit remains, even though decoding it consumes zero bits.
    // A trailing zero byte is valid padding and makes that boundary explicit.
    if (appendGuardByte && this.bytes.length > 0) this.bytes.push(0);
    return Uint8Array.from(this.bytes);
  }
}

// Phoenix FFV modules store their compressed body as a bare -lh5- stream -
// the LZSS+static-Huffman payload only, with none of the surrounding LHA
// archive header @kirinsaninc/lhats expects. That header carries nothing an
// -lh5- decoder itself needs beyond the method id and the two size fields,
// so a minimal synthetic one (verified byte-for-byte against real Phoenix
// STRINGS0.ROM/TEMPLAT0.ROM payloads via an independent LH5 decoder) is
// enough to hand the real compressed bytes to a well-tested reader instead
// of reimplementing the bitstream format from scratch.
function buildSyntheticLhaArchive(compressed: Uint8Array, unpackedSize: number) {
  const method = new TextEncoder().encode("-lh5-");
  const filename = new TextEncoder().encode("payload.bin");
  const body = new Uint8Array(5 + 4 + 4 + 2 + 2 + 1 + 1 + 1 + filename.length + 2);
  const view = new DataView(body.buffer);
  let offset = 0;
  body.set(method, offset);
  offset += method.length;
  view.setUint32(offset, compressed.length, true);
  offset += 4;
  view.setUint32(offset, unpackedSize, true);
  offset += 4;
  offset += 2; // time (unused)
  view.setUint16(offset, 0x21, true); // a valid-looking MS-DOS date
  offset += 2;
  body[offset] = 0x20; // attribute
  offset += 1;
  body[offset] = 0x00; // header level 0
  offset += 1;
  body[offset] = filename.length;
  offset += 1;
  body.set(filename, offset);
  offset += filename.length;
  // CRC16 of the uncompressed data is unknown until it's decompressed;
  // checkCrc: "warn" below means a placeholder here never blocks the read.
  view.setUint16(offset, 0, true);

  let checksum = 0;
  for (const byte of body) checksum = (checksum + byte) & 0xff;
  const archive = new Uint8Array(2 + body.length + compressed.length);
  archive[0] = body.length;
  archive[1] = checksum;
  archive.set(body, 2);
  archive.set(compressed, 2 + body.length);
  return archive;
}

// Decompresses a raw Phoenix FFV -lh5- module body (LZSS with an 8 KiB
// window + static Huffman coding - the same scheme classic .lzh archives
// use). Never used for anything AMI Aptio parses or edits.
export async function decompressPhoenixLh5(
  compressed: Uint8Array,
  unpackedSize: number,
): Promise<Uint8Array> {
  const archive = buildSyntheticLhaArchive(compressed, unpackedSize);
  const reader = new LhaReader(new Uint8ArrayReader(archive), { checkCrc: "warn" });
  try {
    const entries = await reader.getEntries();
    if (entries.length === 0) throw new Error("LH5 decompression produced no output.");
    return await entries[0].getData(new Uint8ArrayWriter());
  } finally {
    await reader.close();
  }
}

/**
 * Produces a standards-valid raw -lh5- body using single-symbol blocks.
 *
 * This first writer intentionally emits literals only. Equal adjacent bytes
 * share one block, so long runs remain compact, but general LZSS matching and
 * multi-symbol Huffman tables are left to the optimizing encoder. Keeping this
 * baseline makes codec/container integration independently testable: callers
 * can already require exact round-trips and reject a body that does not fit the
 * original Phoenix allocation.
 */
export function compressPhoenixLh5(uncompressed: Uint8Array): Uint8Array {
  const writer = new MostSignificantBitWriter();
  let offset = 0;

  while (offset < uncompressed.length) {
    const literal = uncompressed[offset];
    let runLength = 1;
    while (
      runLength < LH5_MAX_BLOCK_SYMBOLS &&
      offset + runLength < uncompressed.length &&
      uncompressed[offset + runLength] === literal
    ) {
      runLength += 1;
    }

    writer.write(runLength, 16); // number of decoded C symbols in this block
    writer.write(0, 5); // single-symbol T table
    writer.write(0, 5); // unused T symbol
    writer.write(0, 9); // single-symbol C table
    writer.write(literal, 9); // literal produced for every symbol in the block
    writer.write(0, 4); // single-symbol P table
    writer.write(0, 4); // unused position symbol

    offset += runLength;
  }

  return writer.finish(true);
}

export const phoenixLh5Codec: PhoenixCompressionCodec = {
  method: "-lh5-",
  compress: compressPhoenixLh5,
  decompress: decompressPhoenixLh5,
};
