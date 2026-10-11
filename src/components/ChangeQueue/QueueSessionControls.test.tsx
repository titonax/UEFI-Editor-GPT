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
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
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
    rerender(view(session, true));
    expect(screen.getByRole("button", { name: "Load queue session" })).toBeEnabled();
  });
});
