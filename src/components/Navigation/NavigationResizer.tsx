import React from "react";
import { NAVIGATION_WIDTH_STEP } from "./navigationWidth";
import s from "./NavigationResizer.module.css";

interface NavigationResizerProps {
  width: number;
  minWidth: number;
  maxWidth: number;
  onChange: (width: number) => void;
  onReset: () => void;
}

export default function NavigationResizer({
  width,
  minWidth,
  maxWidth,
  onChange,
  onReset,
}: NavigationResizerProps) {
  const [dragging, setDragging] = React.useState(false);

  React.useEffect(() => {
    if (!dragging) return;

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [dragging]);

  return (
    <button
      type="button"
      role="separator"
      aria-label="Resize BIOS menu tree"
      aria-orientation="vertical"
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
      aria-valuenow={width}
      className={`${s.handle} ${dragging ? s.dragging : ""}`}
      title="Drag to resize the menu tree. Double-click to reset."
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
        onChange(event.clientX);
      }}
      onPointerMove={(event) => {
        if (dragging && event.currentTarget.hasPointerCapture(event.pointerId)) {
          onChange(event.clientX);
        }
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        setDragging(false);
      }}
      onLostPointerCapture={() => {
        setDragging(false);
      }}
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          onChange(width - NAVIGATION_WIDTH_STEP);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          onChange(width + NAVIGATION_WIDTH_STEP);
        } else if (event.key === "Home") {
          event.preventDefault();
          onChange(minWidth);
        } else if (event.key === "End") {
          event.preventDefault();
          onChange(maxWidth);
        }
      }}
    />
  );
}
