export type BehaviorEdgeKind = "fallthrough" | "branch" | "call";

export interface BehaviorInstruction {
  address: number;
  size: number;
  bytes: Uint8Array;
  mnemonic: string;
  operands: string;
}

export interface BehaviorEdge {
  from: number;
  to: number;
  kind: BehaviorEdgeKind;
}

export interface BehaviorReturn {
  address: number;
  ax: number | null;
}

export interface BehaviorTrace {
  architecture: "x86-16";
  entry: number;
  instructions: BehaviorInstruction[];
  edges: BehaviorEdge[];
  calls: number[];
  returns: BehaviorReturn[];
  status: "complete" | "partial";
  limitations: string[];
}
