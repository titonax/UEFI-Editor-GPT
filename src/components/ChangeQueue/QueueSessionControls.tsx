import React from "react";
import { Alert, Button, FileButton, Group, Stack, Text } from "@mantine/core";
import { saveAs } from "file-saver";
import { errorMessage } from "../scripts/errors";
import { queueSessionTextLimit } from "../scripts/phoenixQueueSession";

export interface QueueSessionAdapter {
  context: object;
  description?: string;
  save: () => Promise<string>;
  // Validation returns a commit action; the controls run it only if the queue
  // and source still match the operation's initial context.
  load: (text: string) => Promise<() => void>;
}
export default function QueueSessionControls({
  session,
  active = true,
}: {
  session: QueueSessionAdapter;
  active?: boolean;
}) {
  const context = React.useMemo(
    () => ({ source: session.context, active }),
    [session.context, active],
  );
  const [state, setState] = React.useState<{
    context: object;
    busy?: boolean;
    error?: string;
    message?: string;
  } | null>(null);
  const request = React.useRef(0);
  const resetRef = React.useRef<() => void>(null);
  React.useEffect(
    () => () => {
      request.current += 1;
      resetRef.current?.();
    },
    [context],
  );
  const current = active && state?.context === context ? state : null;
  const run = async (
    operation: (isCurrent: () => boolean) => Promise<(() => void) | undefined>,
    message: string,
  ) => {
    if (!active) return;
    const id = ++request.current;
    setState({ context, busy: true });
    try {
      const commit = await operation(() => request.current === id);
      if (request.current !== id || !commit) return;
      commit();
      setState({ context, message });
    } catch (reason: unknown) {
      if (request.current === id) setState({ context, error: errorMessage(reason) });
    } finally {
      // An obsolete completion must not clear a newer request's selected file.
      if (request.current === id) resetRef.current?.();
    }
  };
  return (
    <Stack gap="xs">
      <Text size="xs" c="dimmed">
        {session.description ?? "Phoenix queue session · order and selection only."}{" "}
        Load replaces this queue; Undo can restore it. Apply and verified output are not
        restored.
      </Text>
      <Group gap="xs">
        <Button
          variant="default"
          disabled={current?.busy}
          onClick={() => {
            void run(async () => {
              const text = await session.save();
              return () => {
                saveAs(
                  new Blob([text], { type: "application/json" }),
                  "firmware-session.json",
                );
              };
            }, "Queue session saved.");
          }}
        >
          Save queue session
        </Button>
        <FileButton
          resetRef={resetRef}
          accept=".json"
          inputProps={{ "aria-label": "Load queue session file" }}
          onChange={(file) => {
            if (!file) return;
            void run(async (isCurrent) => {
              if (file.size > queueSessionTextLimit)
                throw new Error("Queue session exceeds the 1 MiB file limit.");
              const text = await file.text();
              // Do not hash or replay an obsolete source after a delayed read.
              // Validation already in flight still needs the final commit guard.
              if (!isCurrent()) return;
              return session.load(text);
            }, "Queue session loaded. Apply and check the restored plan.");
          }}
        >
          {(props) => (
            <Button {...props} variant="default" disabled={current?.busy}>
              Load queue session
            </Button>
          )}
        </FileButton>
      </Group>
      {current?.busy && (
        <Text size="xs" role="status">
          Validating queue session…
        </Text>
      )}
      {current?.error && (
        <Alert color="red" title="Queue session rejected">
          {current.error}
        </Alert>
      )}
      {current?.message && (
        <Text size="xs" role="status">
          {current.message}
        </Text>
      )}
    </Stack>
  );
}
