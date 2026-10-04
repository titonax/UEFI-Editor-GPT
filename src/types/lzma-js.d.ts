declare module "lzma/src/lzma_worker.js" {
  interface LzmaWorker {
    compress(
      input: Uint8Array,
      mode: number,
      callback: (result: number[] | null, error?: unknown) => void,
    ): void;
    decompress(
      input: Uint8Array,
      callback: (
        result: string | Uint8Array | number[] | null,
        error?: unknown,
      ) => void,
    ): void;
  }

  const module: { LZMA: LzmaWorker };
  export default module;
}
