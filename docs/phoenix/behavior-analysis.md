# Phoenix callback behavior analysis

Phoenix Setup records can point to 16-bit callback code that decides whether a
menu item is available. The editor analyzes those callbacks locally, on demand,
without executing or changing the firmware.

## Current layer: bounded static path analysis

The **Trace callback** action is offered only when the existing Phoenix parser
has independently verified both the callback prologue and its `mov ax, imm16`
hide path. It then:

1. decodes x86 real-mode instructions from the verified callback entry;
2. follows direct jumps and both sides of conditional branches;
3. records direct calls without entering another function;
4. propagates simple known `AX` values to reachable returns; and
5. stops at explicit instruction and state limits.

The result is evidence, not a claim about what a particular machine will do at
runtime. Unknown register values, indirect transfers, interrupts, external
calls and hardware-backed memory are reported as trace boundaries. No branch is
silently guessed and no firmware byte is patched by this analyzer.

## Module boundaries

| Module                                | Responsibility                                       |
| ------------------------------------- | ---------------------------------------------------- |
| `behavior/types.ts`                   | Vendor-neutral trace, instruction and edge contracts |
| `behavior/x86RealModeDecoder.ts`      | Lazy x86-16 Capstone adapter                         |
| `behavior/x86ControlFlow.ts`          | Bounded, decoder-independent path engine             |
| `behavior/phoenixCallbackAnalysis.ts` | Phoenix record validation and entry-point adapter    |
| `PhoenixBehaviorDialog.tsx`           | On-demand presentation inside the Phoenix workspace  |

The decoder is loaded only after the user requests a trace, so the normal
firmware reader does not pay its WebAssembly cost. The path engine accepts a
small decoder interface and is tested with deterministic fixtures rather than
depending on Capstone internals.

## Next layer: controlled execution

The next layer can reuse the same trace contract while adding a bounded 8086
execution state: registers, flags, a private memory map and explicit models for
known Phoenix helper calls. External reads must be declared as scenario inputs,
so the editor can compare outcomes such as “feature bit clear” and “feature bit
set” without pretending to reproduce a real chipset. Unsupported instructions
or I/O remain visible stop conditions.

This separation lets new firmware cases teach the emulator one instruction or
helper model at a time, while the parser, decoder, execution engine and UI stay
independently testable.
