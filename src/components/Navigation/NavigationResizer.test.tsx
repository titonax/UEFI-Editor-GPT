import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import NavigationResizer from "./NavigationResizer";

describe("navigation resizer", () => {
  it("supports pointer, keyboard and reset interactions", () => {
    const onChange = vi.fn();
    const onReset = vi.fn();
    render(
      <NavigationResizer
        width={360}
        minWidth={200}
        maxWidth={800}
        onChange={onChange}
        onReset={onReset}
      />,
    );

    const separator = screen.getByRole("separator", {
      name: "Resize BIOS menu tree",
    });
    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    Object.assign(separator, {
      setPointerCapture,
      hasPointerCapture: () => true,
      releasePointerCapture,
    });

    fireEvent(
      separator,
      new MouseEvent("pointerdown", { bubbles: true, clientX: 480 }),
    );
    fireEvent(
      separator,
      new MouseEvent("pointermove", { bubbles: true, clientX: 520 }),
    );
    fireEvent(separator, new MouseEvent("pointerup", { bubbles: true }));
    expect(onChange).toHaveBeenNthCalledWith(1, 480);
    expect(onChange).toHaveBeenNthCalledWith(2, 520);
    expect(setPointerCapture).toHaveBeenCalledWith(undefined);
    expect(releasePointerCapture).toHaveBeenCalledWith(undefined);

    fireEvent.keyDown(separator, { key: "ArrowRight" });
    fireEvent.keyDown(separator, { key: "Home" });
    fireEvent.keyDown(separator, { key: "End" });
    expect(onChange).toHaveBeenCalledWith(384);
    expect(onChange).toHaveBeenCalledWith(200);
    expect(onChange).toHaveBeenCalledWith(800);

    fireEvent.doubleClick(separator);
    expect(onReset).toHaveBeenCalledOnce();
  });
});
