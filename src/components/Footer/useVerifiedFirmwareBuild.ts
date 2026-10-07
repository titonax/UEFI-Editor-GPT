import React from "react";
import { errorMessage } from "../scripts/errors";

interface PreflightState<Input, Result> {
  context: { input: Input; enabled: boolean; build: (input: Input) => Promise<Result> };
  status: "building" | "ready" | "failed";
  result?: Result;
  error?: string;
}

// Keep the verified bytes bound to the applied queue and opened source. Old
// asynchronous completions must never unlock a newer queue's download.
export function useVerifiedFirmwareBuild<Input, Result>(
  input: Input,
  enabled: boolean,
  build: (input: Input) => Promise<Result>,
) {
  const context = React.useMemo(
    () => ({ input, enabled, build }),
    [input, enabled, build],
  );
  const [state, setState] = React.useState<PreflightState<Input, Result> | null>(null);
  const request = React.useRef(0);
  React.useEffect(() => {
    return () => {
      request.current += 1;
    };
  }, [context]);

  const current = enabled && state?.context === context ? state : null;

  const check = async () => {
    if (!enabled || current?.status === "building") return;
    const id = ++request.current;
    setState({ context, status: "building" });
    try {
      const result = await build(input);
      if (request.current === id) {
        setState({ context, status: "ready", result });
      }
    } catch (reason: unknown) {
      if (request.current === id) {
        setState({ context, status: "failed", error: errorMessage(reason) });
      }
    }
  };

  return {
    status: current?.status ?? "idle",
    result: current?.result,
    error: current?.error,
    check,
  };
}
