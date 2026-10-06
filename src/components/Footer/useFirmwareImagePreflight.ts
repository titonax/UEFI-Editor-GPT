import React from "react";
import type { PopulatedFiles } from "../firmwareFiles";
import type { Data } from "../scripts/types";
import {
  buildAmiFirmwareImage,
  type AmiFirmwareBuildResult,
} from "../scripts/amiFirmwareRebuilder";
import { errorMessage } from "../scripts/errors";

interface PreflightState {
  context: { data: Data; files: PopulatedFiles; enabled: boolean };
  status: "building" | "ready" | "failed";
  result?: AmiFirmwareBuildResult;
  error?: string;
}

// Keep the verified bytes bound to the applied queue and opened source. Old
// asynchronous completions must never unlock a newer queue's download.
export function useFirmwareImagePreflight(
  data: Data,
  files: PopulatedFiles,
  enabled: boolean,
) {
  const context = React.useMemo(
    () => ({ data, files, enabled }),
    [data, files, enabled],
  );
  const [state, setState] = React.useState<PreflightState | null>(null);
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
      const result = await buildAmiFirmwareImage(data, files);
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
