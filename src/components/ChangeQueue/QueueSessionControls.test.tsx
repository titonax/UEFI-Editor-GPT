import { MantineProvider } from "@mantine/core";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveAs } from "file-saver";
import QueueSessionControls, { type QueueSessionAdapter } from "./QueueSessionControls";
vi.mock("file-saver", () => ({ saveAs: vi.fn() }));
function view(session: QueueSessionAdapter, active = true) {
  return (
    <MantineProvider env="test">
      <QueueSessionControls session={session} active={active} />
    </MantineProvider>
  );
}
function file(text: () => Promise<string>, size = 2) {
  const value = new File(["{}"], "session.json");
  Object.defineProperty(value, "text", { value: text });
  Object.defineProperty(value, "size", { value: size });
  return value;
}
function upload(value: File) {
  fireEvent.change(screen.getByLabelText("Load queue session file"), {
    target: { files: [value] },
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("queue session controls", () => {
  beforeEach(() => {
    vi.mocked(saveAs).mockReset();
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });
  it("saves locally and commits a validated session only once", async () => {
    const commit = vi.fn();
    const save = vi.fn().mockResolvedValue("{}");
    const load = vi.fn().mockResolvedValue(commit);
    render(view({ context: {}, save, load }));
    fireEvent.click(screen.getByRole("button", { name: "Save queue session" }));
    await waitFor(() => {
      expect(saveAs).toHaveBeenCalledTimes(1);
    });
    expect(vi.mocked(saveAs).mock.calls[0][1]).toBe("firmware-session.json");
    upload(file(() => Promise.resolve("{}")));
    await waitFor(() => {
      expect(commit).toHaveBeenCalledTimes(1);
    });
    expect(load).toHaveBeenCalledWith("{}");
  });
  it.each(["save", "load"])(
    "discards a pending %s when the source or queue context changes",
    async (kind) => {
      const task = deferred<string>();
      const commit = vi.fn();
      const session: QueueSessionAdapter = {
        context: {},
        save: () => task.promise,
        load: vi.fn().mockResolvedValue(commit),
      };
      const { rerender } = render(view(session));
      if (kind === "save")
        fireEvent.click(screen.getByRole("button", { name: "Save queue session" }));
      else upload(file(() => task.promise));
      rerender(view({ ...session, context: {} }));
      await act(async () => {
        task.resolve("{}");
        await task.promise;
      });
      expect(commit).not.toHaveBeenCalled();
      expect(saveAs).not.toHaveBeenCalled();
      expect(session.load).not.toHaveBeenCalled();
    },
  );
  it("rejects oversized or invalid sessions without calling the commit action", async () => {
    const load = vi.fn().mockRejectedValue(new Error("Wrong source"));
    render(view({ context: {}, save: vi.fn(), load }));
    upload(file(() => Promise.resolve("{}"), 1024 * 1024 + 1));
    expect(
      await screen.findByText("Queue session exceeds the 1 MiB file limit."),
    ).toBeVisible();
    expect(load).not.toHaveBeenCalled();
    upload(file(() => Promise.resolve("{}")));
    expect(await screen.findByText("Wrong source")).toBeVisible();
    expect(saveAs).not.toHaveBeenCalled();
  });
  it("cancels loading as soon as the dialog closes, before animated unmount", async () => {
    const task = deferred<string>();
    const commit = vi.fn();
    const session: QueueSessionAdapter = {
      context: {},
      save: vi.fn(),
      load: vi.fn().mockResolvedValue(commit),
    };
    const { rerender } = render(view(session));
    upload(file(() => task.promise));
    rerender(view(session, false));
    await act(async () => {
      task.resolve("{}");
      await task.promise;
    });
    expect(commit).not.toHaveBeenCalled();
    expect(session.load).not.toHaveBeenCalled();
    rerender(view(session, true));
    expect(screen.getByRole("button", { name: "Load queue session" })).toBeEnabled();
  });
  it("does not start session validation after unmount during file reading", async () => {
    const task = deferred<string>();
    const load = vi.fn().mockResolvedValue(vi.fn());
    const { unmount } = render(view({ context: {}, save: vi.fn(), load }));
    upload(file(() => task.promise));
    unmount();
    await act(async () => {
      task.resolve("{}");
      await task.promise;
    });
    expect(load).not.toHaveBeenCalled();
    expect(saveAs).not.toHaveBeenCalled();
  });
  it("keeps a newer successful load when the old file read completes", async () => {
    const task = deferred<string>();
    const commit = vi.fn();
    const load = vi.fn().mockResolvedValue(commit);
    const session = { context: {}, save: vi.fn(), load };
    const { rerender } = render(view(session));
    upload(file(() => task.promise));
    rerender(view({ ...session, context: {} }));
    upload(file(() => Promise.resolve("new session")));
    await waitFor(() => {
      expect(commit).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      task.resolve("obsolete session");
      await task.promise;
    });
    expect(load).toHaveBeenCalledExactlyOnceWith("new session");
    expect(commit).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText("Queue session loaded. Apply and check the restored plan."),
    ).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("still discards a validation already in flight when the context changes", async () => {
    const validation = deferred<() => void>();
    const commit = vi.fn();
    const session = {
      context: {},
      save: vi.fn(),
      load: vi.fn().mockReturnValue(validation.promise),
    };
    const { rerender } = render(view(session));
    upload(file(() => Promise.resolve("{}")));
    await waitFor(() => {
      expect(session.load).toHaveBeenCalledTimes(1);
    });
    rerender(view({ ...session, context: {} }));
    await act(async () => {
      validation.resolve(commit);
      await validation.promise;
    });
    expect(commit).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load queue session" })).toBeEnabled();
  });
  it.each([
    ["read", false],
    ["read", true],
    ["validation", false],
    ["validation", true],
    ["save", false],
    ["save", true],
  ] as const)(
    "keeps the newer file picker after obsolete %s (reject: %s)",
    async (kind, rejects) => {
      const oldRead = deferred<string>();
      const oldValidation = deferred<() => void>();
      const currentRead = deferred<string>();
      const obsoleteCommit = vi.fn();
      const commit = vi.fn();
      const load = vi.fn().mockResolvedValue(commit);
      const session = {
        context: {},
        save: vi.fn(() => oldRead.promise),
        load: vi.fn(() => oldValidation.promise),
      };
      const { rerender } = render(view(session));
      if (kind === "save")
        fireEvent.click(screen.getByRole("button", { name: "Save queue session" }));
      else {
        upload(
          file(() => (kind === "read" ? oldRead.promise : Promise.resolve("old"))),
        );
        if (kind === "validation")
          await waitFor(() => {
            expect(session.load).toHaveBeenCalledTimes(1);
          });
      }
      rerender(view({ ...session, context: {}, load }));
      upload(file(() => currentRead.promise));
      const input = screen.getByLabelText<HTMLInputElement>("Load queue session file");
      const reset = vi.spyOn(input, "value", "set");
      await act(async () => {
        if (kind === "validation") {
          if (rejects) oldValidation.reject(new Error("Obsolete validation"));
          else oldValidation.resolve(obsoleteCommit);
          await oldValidation.promise.catch(() => undefined);
        } else {
          if (rejects) oldRead.reject(new Error("Obsolete file operation"));
          else oldRead.resolve("obsolete session");
          await oldRead.promise.catch(() => undefined);
        }
      });
      expect(reset).not.toHaveBeenCalled();
      expect(screen.getByText("Validating queue session…")).toBeVisible();
      expect(load).not.toHaveBeenCalled();
      expect(commit).not.toHaveBeenCalled();
      expect(obsoleteCommit).not.toHaveBeenCalled();
      expect(saveAs).not.toHaveBeenCalled();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      await act(async () => {
        currentRead.resolve("current session");
        await currentRead.promise;
      });
      expect(load).toHaveBeenCalledExactlyOnceWith("current session");
      expect(commit).toHaveBeenCalledTimes(1);
      expect(reset).toHaveBeenCalledExactlyOnceWith("");
      expect(screen.getByRole("button", { name: "Load queue session" })).toBeEnabled();
      reset.mockRestore();
    },
  );
  it("resets a cancelled picker immediately without resetting it again on old delivery", async () => {
    const task = deferred<string>();
    const session = { context: {}, save: vi.fn(), load: vi.fn() };
    const { rerender } = render(view(session));
    upload(file(() => task.promise));
    const input = screen.getByLabelText<HTMLInputElement>("Load queue session file");
    const reset = vi.spyOn(input, "value", "set");
    rerender(view(session, false));
    expect(reset).toHaveBeenCalledExactlyOnceWith("");
    await act(async () => {
      task.resolve("obsolete session");
      await task.promise;
    });
    expect(reset).toHaveBeenCalledTimes(1);
    expect(session.load).not.toHaveBeenCalled();
    rerender(view(session, true));
    expect(screen.getByRole("button", { name: "Load queue session" })).toBeEnabled();
    reset.mockRestore();
  });
});
