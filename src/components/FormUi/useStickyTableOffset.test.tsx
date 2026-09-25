import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useStickyTableOffset } from "./useStickyTableOffset";

function Harness() {
  const { anchorRef, offset } = useStickyTableOffset(1);
  return (
    <>
      <div ref={anchorRef}>Summary</div>
      <output>{String(offset)}</output>
    </>
  );
}

describe("useStickyTableOffset", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("places the table header at the measured lower edge of the summary", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      bottom: 137.2,
    } as DOMRect);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = vi.fn();
        disconnect = vi.fn();
        unobserve = vi.fn();
      },
    );

    render(<Harness />);

    expect(screen.getByRole("status")).toHaveTextContent("138");
  });
});
