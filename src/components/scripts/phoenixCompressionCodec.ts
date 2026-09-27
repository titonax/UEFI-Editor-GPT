export type PhoenixCompressionMethod = "-lh5-";

/**
 * Compression boundary for Phoenix module bodies.
 *
 * A codec only transforms the raw body. FFV allocation, padding, sizes and
 * checksums belong to the container rebuilder and must not leak into codecs.
 */
export interface PhoenixCompressionCodec {
  readonly method: PhoenixCompressionMethod;

  compress(uncompressed: Uint8Array): Uint8Array | Promise<Uint8Array>;

  decompress(compressed: Uint8Array, unpackedSize: number): Promise<Uint8Array>;
}
