import React from "react";

// Mantine's sticky table header takes an absolute viewport offset. The
// summary above a form can wrap and change height with the viewport, so a
// fixed number eventually overlaps either the header or the first data row.
// Measuring the summary's real lower edge keeps the two sticky regions
// adjacent without coupling this component to a particular shell height.
export function useStickyTableOffset(refreshKey: number) {
  const anchorRef = React.useRef<HTMLDivElement>(null);
  const [offset, setOffset] = React.useState(0);

  React.useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const update = () => {
      setOffset(Math.ceil(anchor.getBoundingClientRect().bottom));
    };
    update();

    const observer = new ResizeObserver(update);
    observer.observe(anchor);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [refreshKey]);

  return { anchorRef, offset };
}
