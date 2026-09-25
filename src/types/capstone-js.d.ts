declare module "@alexaltea/capstone-js" {
  export interface CapstoneInstruction {
    address: bigint;
    size: number;
    bytes: number[];
    mnemonic: string;
    op_str: string;
  }

  export interface CapstoneDecoder {
    option(option: number, value: number): void;
    disasm(
      buffer: Uint8Array,
      address?: number,
      maximum?: number,
    ): CapstoneInstruction[];
    close(): void;
  }

  export interface CapstoneModule {
    ARCH_X86: number;
    MODE_16: number;
    OPT_DETAIL: number;
    OPT_ON: number;
    Capstone: new (architecture: number, mode: number) => CapstoneDecoder;
  }

  export interface CapstoneModuleOptions {
    locateFile?: (path: string) => string;
  }

  export default function createCapstone(
    options?: CapstoneModuleOptions,
  ): Promise<CapstoneModule>;
}

declare module "@alexaltea/capstone-js/dist/capstone.wasm?url" {
  const url: string;
  export default url;
}
