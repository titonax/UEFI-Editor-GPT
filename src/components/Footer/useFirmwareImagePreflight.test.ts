import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { firmwareData } from "../../test/fixtures";
import type { PopulatedFiles } from "../firmwareFiles";
import {
  buildAmiFirmwareImage,
  type AmiFirmwareBuildResult,
} from "../scripts/amiFirmwareRebuilder";
import { useFirmwareImagePreflight } from "./useFirmwareImagePreflight";

vi.mock("../scripts/amiFirmwareRebuilder", () => ({
  buildAmiFirmwareImage: vi.fn(),
}));

const output: AmiFirmwareBuildResult = {
  image: new Uint8Array([1, 2, 3]),
  spaceReport: {
    biosStart: 0,
    biosEnd: 3,
    preservedOutsideBiosBytes: 0,
    affectedRanges: [{ start: 0, end: 3 }],
    compressedSections: [],
  },
  fileName: "modified.bin",
  changeLog: "verified edits",
  containerKind: "bios-image",
  replacedArtifacts: ["setup-hii"],
  changedByteCount: 1,
  changedStart: 1,
  changedEnd: 2,
};
function inputs() {
  const container = {
    file: new File([], "fixture"),
    textContent: "",
    isWrongFile: false,
  };
  const files: PopulatedFiles = {
    firmwareSource: {
      fileName: "synthetic.bin",
      artifacts: {
        hii: new Uint8Array(),
        ifrText: "",
        formPackageCount: 0,
        extractionDepth: 0,
        artifactSets: [],
        selectedArtifactSetId: "synthetic",
        provenance: {
          rootBufferId: 0,
          sourceSize: 3,
          buffers: [{ id: 0, bytes: Uint8Array.of(1, 0, 3), depth: 0 }],
          artifacts: [],
        },
      },
    },
    setupSctContainer: container,
    setupTxtContainer: container,
    amitseSctContainer: container,
    setupdataBinContainer: container,
  };
  return { data: firmwareData(), files, enabled: true };
}
function pending() {
  let resolve!: (value: AmiFirmwareBuildResult) => void;
  const promise = new Promise<AmiFirmwareBuildResult>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("firmware output preflight (synthetic orchestration)", () => {
  beforeEach(() => vi.mocked(buildAmiFirmwareImage).mockReset());

  it("exposes only the exact completed, verified result and builds once", async () => {
    const task = pending();
    vi.mocked(buildAmiFirmwareImage).mockReturnValue(task.promise);
    const props = inputs();
    const { result } = renderHook(() =>
      useFirmwareImagePreflight(props.data, props.files, props.enabled),
    );
    expect(result.current.result).toBeUndefined();
    let check!: Promise<void>;
    act(() => {
      check = result.current.check();
    });
    expect(result.current.status).toBe("building");
    expect(result.current.result).toBeUndefined();
    await act(async () => {
      await result.current.check();
    });
    expect(buildAmiFirmwareImage).toHaveBeenCalledTimes(1);
    await act(async () => {
      task.resolve(output);
      await check;
    });
    expect(result.current.status).toBe("ready");
    expect(result.current.result?.image).toBe(output.image);
    expect(result.current.result?.binaryComparison).toMatchObject({
      imageSize: 3,
      changedByteCount: 1,
      unchangedByteCount: 2,
      ranges: [{ start: 1, end: 2, original: [0], rebuilt: [2] }],
    });
    expect(result.current.result).toMatchObject(output);
    expect(buildAmiFirmwareImage).toHaveBeenCalledWith(props.data, props.files);
  });

  it.each(["data", "files", "enabled"] as const)(
    "invalidates ready bytes after changing %s, including returning to old inputs",
    async (key) => {
      vi.mocked(buildAmiFirmwareImage).mockResolvedValue(output);
      const original = inputs();
      const { result, rerender } = renderHook(
        (props) => useFirmwareImagePreflight(props.data, props.files, props.enabled),
        { initialProps: original },
      );
      await act(async () => {
        await result.current.check();
      });
      const changed = { ...original };
      if (key === "data") changed.data = firmwareData();
      if (key === "files") changed.files = { ...original.files };
      if (key === "enabled") changed.enabled = false;
      rerender(changed);
      expect(result.current.result).toBeUndefined();
      rerender(original);
      expect(result.current.result).toBeUndefined();
      expect(result.current.status).toBe("idle");
    },
  );

  it("discards an old completion without replacing a newer verified queue", async () => {
    const old = pending();
    vi.mocked(buildAmiFirmwareImage)
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(output);
    const original = inputs();
    const { result, rerender } = renderHook(
      (props) => useFirmwareImagePreflight(props.data, props.files, props.enabled),
      { initialProps: original },
    );
    let check!: Promise<void>;
    act(() => {
      check = result.current.check();
    });
    rerender({ ...original, data: firmwareData() });
    await act(async () => {
      await result.current.check();
    });
    await act(async () => {
      old.resolve({ ...output, fileName: "stale.bin" });
      await check;
    });
    expect(result.current.result).toMatchObject(output);
  });

  it("keeps allocation failure blocked, permits retry, and ignores disabled checks", async () => {
    vi.mocked(buildAmiFirmwareImage)
      .mockRejectedValueOnce(
        new Error("Compressed section cannot grow beyond its FFS allocation."),
      )
      .mockResolvedValueOnce(output);
    const original = inputs();
    const { result, rerender } = renderHook(
      (props) => useFirmwareImagePreflight(props.data, props.files, props.enabled),
      { initialProps: { ...original, enabled: false } },
    );
    await act(async () => {
      await result.current.check();
    });
    expect(buildAmiFirmwareImage).not.toHaveBeenCalled();
    rerender(original);
    await act(async () => {
      await result.current.check();
    });
    expect(result.current.status).toBe("failed");
    expect(result.current.error).toContain("FFS allocation");
    expect(result.current.result).toBeUndefined();
    await act(async () => {
      await result.current.check();
    });
    expect(result.current.result).toMatchObject(output);
    expect(result.current.error).toBeUndefined();
  });
  it("invalidates cached output on a new queue revision with otherwise identical inputs", async () => {
    vi.mocked(buildAmiFirmwareImage).mockResolvedValue(output);
    const props = inputs();
    const { result, rerender } = renderHook(
      ({ revision }) =>
        useFirmwareImagePreflight(props.data, props.files, true, revision),
      { initialProps: { revision: 1 } },
    );
    await act(async () => {
      await result.current.check();
    });
    expect(result.current.result).toMatchObject(output);
    rerender({ revision: 2 });
    expect(result.current.result).toBeUndefined();
    await act(async () => {
      await result.current.check();
    });
    expect(result.current.result).toMatchObject(output);
    expect(buildAmiFirmwareImage).toHaveBeenCalledTimes(2);
  });
  it("rejects a verified result with a different complete image size", async () => {
    vi.mocked(buildAmiFirmwareImage).mockResolvedValue({
      ...output,
      image: new Uint8Array(2),
    });
    const props = inputs();
    const { result } = renderHook(() =>
      useFirmwareImagePreflight(props.data, props.files, true),
    );
    await act(async () => {
      await result.current.check();
    });
    expect(result.current.status).toBe("failed");
    expect(result.current.result).toBeUndefined();
    expect(result.current.error).toMatch(/equal original and rebuilt sizes/);
  });
  it("compares against the source snapshot captured before asynchronous rebuilding", async () => {
    const task = pending();
    vi.mocked(buildAmiFirmwareImage).mockReturnValue(task.promise);
    const props = inputs();
    const { result } = renderHook(() =>
      useFirmwareImagePreflight(props.data, props.files, true),
    );
    let check!: Promise<void>;
    act(() => {
      check = result.current.check();
    });
    props.files.firmwareSource?.artifacts.provenance.buffers[0].bytes.fill(99);
    await act(async () => {
      task.resolve(output);
      await check;
    });
    expect(result.current.result?.binaryComparison.changedByteCount).toBe(1);
  });
  it("rejects a missing opened source before calling the builder", async () => {
    const props = inputs();
    delete props.files.firmwareSource;
    const { result } = renderHook(() =>
      useFirmwareImagePreflight(props.data, props.files, true),
    );
    await act(async () => {
      await result.current.check();
    });
    expect(result.current.status).toBe("failed");
    expect(buildAmiFirmwareImage).not.toHaveBeenCalled();
  });
});
