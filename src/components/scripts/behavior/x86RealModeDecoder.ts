import type { BehaviorInstruction } from "./types";

export interface X86RealModeDecoder {
  decodeOne(bytes: Uint8Array, address: number): BehaviorInstruction | null;
  close(): void;
}

class CapstoneRealModeDecoder implements X86RealModeDecoder {
  constructor(
    private readonly decoder: {
      disasm(
        buffer: Uint8Array,
        address?: number,
        maximum?: number,
      ): {
        address: bigint;
        size: number;
        bytes: number[];
        mnemonic: string;
        op_str: string;
      }[];
      close(): void;
    },
  ) {}

  decodeOne(bytes: Uint8Array, address: number): BehaviorInstruction | null {
    if (bytes.length === 0) return null;
    try {
      const instruction = this.decoder.disasm(bytes, address, 1)[0];
      if (!instruction || instruction.size <= 0) return null;
      return {
        address: Number(instruction.address),
        size: instruction.size,
        bytes: Uint8Array.from(instruction.bytes),
        mnemonic: instruction.mnemonic.toLowerCase(),
        operands: instruction.op_str.toLowerCase(),
      };
    } catch {
      return null;
    }
  }

  close() {
    this.decoder.close();
  }
}

export async function createX86RealModeDecoder(): Promise<X86RealModeDecoder> {
  const [{ default: createCapstone }, { default: wasmUrl }] = await Promise.all([
    import("@alexaltea/capstone-js"),
    import("@alexaltea/capstone-js/dist/capstone.wasm?url"),
  ]);
  const capstone = await createCapstone({
    locateFile: (path) => (path.endsWith("capstone.wasm") ? wasmUrl : path),
  });
  const decoder = new capstone.Capstone(capstone.ARCH_X86, capstone.MODE_16);
  decoder.option(capstone.OPT_DETAIL, capstone.OPT_ON);
  return new CapstoneRealModeDecoder(decoder);
}
