import type { BehaviorEdge, BehaviorInstruction, BehaviorTrace } from "./types";
import type { X86RealModeDecoder } from "./x86RealModeDecoder";

export interface X86ControlFlowOptions {
  maximumInstructions?: number;
  maximumStates?: number;
}

interface AnalysisState {
  address: number;
  ax: number | null;
}

const conditionalBranchPattern = /^(?:j(?!mp)[a-z0-9]+|loop[a-z]*|jcxz)$/;
const returnPattern = /^(?:ret|retf|iret)$/;
const interruptPattern = /^(?:int|into)$/;

function parseNumericOperand(value: string): number | null {
  const operand = value.split(",", 1)[0]?.trim();
  if (!operand) return null;
  if (/^0x[0-9a-f]+$/i.exec(operand)) return Number.parseInt(operand.slice(2), 16);
  if (/^[0-9a-f]+h$/i.exec(operand)) return Number.parseInt(operand.slice(0, -1), 16);
  if (/^\d+$/.exec(operand)) return Number.parseInt(operand, 10);
  return null;
}

function nextAx(instruction: BehaviorInstruction, current: number | null) {
  const operands = instruction.operands.replace(/\s+/g, "");
  const immediate = /^ax,(?:0x([0-9a-f]+)|([0-9a-f]+)h|(\d+))$/i.exec(operands);
  if (instruction.mnemonic === "mov" && immediate) {
    const value = immediate[1]
      ? Number.parseInt(immediate[1], 16)
      : immediate[2]
        ? Number.parseInt(immediate[2], 16)
        : Number.parseInt(immediate[3], 10);
    return value & 0xffff;
  }
  if (
    (instruction.mnemonic === "xor" || instruction.mnemonic === "sub") &&
    operands === "ax,ax"
  ) {
    return 0;
  }
  if (
    operands.startsWith("ax,") ||
    operands.startsWith("al,") ||
    operands.startsWith("ah,")
  )
    return null;
  if (instruction.mnemonic.startsWith("call")) return null;
  return current;
}

function stateKey(state: AnalysisState) {
  return `${String(state.address)}:${state.ax === null ? "?" : String(state.ax)}`;
}

function edgeKey(edge: BehaviorEdge) {
  return `${String(edge.from)}:${String(edge.to)}:${edge.kind}`;
}

export function analyzeX86RealModeControlFlow(
  bytes: Uint8Array,
  entry: number,
  decoder: X86RealModeDecoder,
  options: X86ControlFlowOptions = {},
): BehaviorTrace {
  const maximumInstructions = options.maximumInstructions ?? 256;
  const maximumStates = options.maximumStates ?? 512;
  const instructionMap = new Map<number, BehaviorInstruction>();
  const edgeMap = new Map<string, BehaviorEdge>();
  const calls = new Set<number>();
  const returns = new Map<string, { address: number; ax: number | null }>();
  const limitations = new Set<string>();
  const queued: AnalysisState[] = [{ address: entry, ax: null }];
  const visited = new Set<string>();

  while (queued.length > 0 && visited.size < maximumStates) {
    const state = queued.shift();
    if (!state) break;
    if (state.address < 0 || state.address >= bytes.length) {
      limitations.add("A control-flow target leaves the decoded template buffer.");
      continue;
    }
    const key = stateKey(state);
    if (visited.has(key)) continue;
    visited.add(key);
    if (instructionMap.size >= maximumInstructions) {
      limitations.add(
        "The instruction limit was reached before every path terminated.",
      );
      break;
    }

    const instruction =
      instructionMap.get(state.address) ??
      decoder.decodeOne(bytes.subarray(state.address), state.address);
    if (!instruction) {
      limitations.add(
        `Instruction decoding stopped at 0x${state.address.toString(16)}.`,
      );
      continue;
    }
    instructionMap.set(state.address, instruction);
    const ax = nextAx(instruction, state.ax);
    const nextAddress = instruction.address + instruction.size;

    if (returnPattern.test(instruction.mnemonic)) {
      returns.set(`${String(instruction.address)}:${ax === null ? "?" : String(ax)}`, {
        address: instruction.address,
        ax,
      });
      continue;
    }
    if (interruptPattern.test(instruction.mnemonic)) {
      limitations.add(`Interrupt ${instruction.mnemonic} is not followed statically.`);
      continue;
    }

    const directTarget = parseNumericOperand(instruction.operands);
    if (instruction.mnemonic.startsWith("call")) {
      if (directTarget === null) {
        limitations.add("An indirect call requires dynamic emulation.");
      } else {
        calls.add(directTarget);
        const edge = {
          from: instruction.address,
          to: directTarget,
          kind: "call" as const,
        };
        edgeMap.set(edgeKey(edge), edge);
      }
      const fallthrough = {
        from: instruction.address,
        to: nextAddress,
        kind: "fallthrough" as const,
      };
      edgeMap.set(edgeKey(fallthrough), fallthrough);
      queued.push({ address: nextAddress, ax });
      continue;
    }
    if (instruction.mnemonic === "jmp") {
      if (directTarget === null) {
        limitations.add("An indirect jump requires dynamic emulation.");
      } else {
        const edge = {
          from: instruction.address,
          to: directTarget,
          kind: "branch" as const,
        };
        edgeMap.set(edgeKey(edge), edge);
        queued.push({ address: directTarget, ax });
      }
      continue;
    }
    if (conditionalBranchPattern.test(instruction.mnemonic)) {
      if (directTarget === null) {
        limitations.add("A conditional branch target could not be resolved.");
      } else {
        const branch = {
          from: instruction.address,
          to: directTarget,
          kind: "branch" as const,
        };
        edgeMap.set(edgeKey(branch), branch);
        queued.push({ address: directTarget, ax });
      }
      const fallthrough = {
        from: instruction.address,
        to: nextAddress,
        kind: "fallthrough" as const,
      };
      edgeMap.set(edgeKey(fallthrough), fallthrough);
      queued.push({ address: nextAddress, ax });
      continue;
    }

    const edge = {
      from: instruction.address,
      to: nextAddress,
      kind: "fallthrough" as const,
    };
    edgeMap.set(edgeKey(edge), edge);
    queued.push({ address: nextAddress, ax });
  }

  if (queued.length > 0 && visited.size >= maximumStates) {
    limitations.add("The state limit was reached before every path terminated.");
  }
  if (returns.size === 0) {
    limitations.add("No reachable return instruction was found.");
  }

  return {
    architecture: "x86-16",
    entry,
    instructions: [...instructionMap.values()].sort((a, b) => a.address - b.address),
    edges: [...edgeMap.values()],
    calls: [...calls].sort((a, b) => a - b),
    returns: [...returns.values()].sort((a, b) => {
      if (a.address !== b.address) return a.address - b.address;
      return (a.ax ?? -1) - (b.ax ?? -1);
    }),
    status: limitations.size === 0 ? "complete" : "partial",
    limitations: [...limitations],
  };
}
