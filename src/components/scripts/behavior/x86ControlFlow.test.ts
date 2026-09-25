import { describe, expect, it } from "vitest";
import type { BehaviorInstruction } from "./types";
import { analyzeX86RealModeControlFlow } from "./x86ControlFlow";
import type { X86RealModeDecoder } from "./x86RealModeDecoder";

class FixtureDecoder implements X86RealModeDecoder {
  constructor(private readonly instructions: BehaviorInstruction[]) {}

  decodeOne(_bytes: Uint8Array, address: number) {
    return (
      this.instructions.find((instruction) => instruction.address === address) ?? null
    );
  }

  close() {
    return undefined;
  }
}

function instruction(
  address: number,
  size: number,
  mnemonic: string,
  operands = "",
): BehaviorInstruction {
  return {
    address,
    size,
    mnemonic,
    operands,
    bytes: new Uint8Array(size),
  };
}

describe("x86 real-mode control-flow analysis", () => {
  it("explores both sides of a conditional and carries known AX returns", () => {
    const decoder = new FixtureDecoder([
      instruction(0, 1, "push", "bp"),
      instruction(1, 2, "mov", "bp, sp"),
      instruction(3, 2, "je", "0xa"),
      instruction(5, 3, "mov", "ax, 0x13"),
      instruction(8, 2, "jmp", "0xd"),
      instruction(10, 3, "xor", "ax, ax"),
      instruction(13, 1, "pop", "bp"),
      instruction(14, 1, "ret"),
    ]);

    const trace = analyzeX86RealModeControlFlow(new Uint8Array(15), 0, decoder);

    expect(trace.status).toBe("complete");
    expect(trace.instructions.map((entry) => entry.address)).toEqual([
      0, 1, 3, 5, 8, 10, 13, 14,
    ]);
    expect(trace.returns).toEqual([
      { address: 14, ax: 0 },
      { address: 14, ax: 0x13 },
    ]);
    expect(trace.edges).toContainEqual({ from: 3, to: 10, kind: "branch" });
    expect(trace.edges).toContainEqual({ from: 3, to: 5, kind: "fallthrough" });
  });

  it("records direct calls without entering another function", () => {
    const decoder = new FixtureDecoder([
      instruction(0, 3, "call", "0x20"),
      instruction(3, 1, "ret"),
    ]);

    const trace = analyzeX86RealModeControlFlow(new Uint8Array(4), 0, decoder);

    expect(trace.calls).toEqual([0x20]);
    expect(trace.edges).toContainEqual({ from: 0, to: 0x20, kind: "call" });
    expect(trace.edges).toContainEqual({ from: 0, to: 3, kind: "fallthrough" });
    expect(trace.returns).toEqual([{ address: 3, ax: null }]);
  });

  it("reports bounded partial evidence instead of walking outside the module", () => {
    const decoder = new FixtureDecoder([instruction(0, 2, "jmp", "0x40")]);

    const trace = analyzeX86RealModeControlFlow(new Uint8Array(8), 0, decoder);

    expect(trace.status).toBe("partial");
    expect(trace.limitations).toContain(
      "A control-flow target leaves the decoded template buffer.",
    );
    expect(trace.limitations).toContain("No reachable return instruction was found.");
  });
});
