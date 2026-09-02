"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ResizeState<T extends string> = {
  columnId: T;
  startX: number;
  startWidth: number;
} | null;

export function useColumnResize<T extends string>(initialWidths: Record<T, number>, minWidth = 72) {
  const [columnWidths, setColumnWidths] = useState<Record<T, number>>(initialWidths);
  const resizeStateRef = useRef<ResizeState<T>>(null);

  useEffect(() => {
    setColumnWidths((current) => {
      let changed = false;
      const next = { ...current };

      for (const [columnId, width] of Object.entries(initialWidths) as Array<[T, number]>) {
        if (next[columnId] == null) {
          next[columnId] = width;
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [initialWidths]);

  useEffect(() => {
    function handlePointerMove(event: MouseEvent) {
      const resizeState = resizeStateRef.current;
      if (!resizeState) {
        return;
      }

      const delta = event.clientX - resizeState.startX;
      setColumnWidths((current) => ({
        ...current,
        [resizeState.columnId]: Math.max(minWidth, resizeState.startWidth + delta),
      }));
    }

    function handlePointerUp() {
      resizeStateRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseup", handlePointerUp);
    return () => {
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseup", handlePointerUp);
    };
  }, [minWidth]);

  const totalWidth = useMemo(
    () => (Object.values(columnWidths) as number[]).reduce((sum, width) => sum + width, 0),
    [columnWidths],
  );

  function beginResize(columnId: T, clientX: number) {
    resizeStateRef.current = {
      columnId,
      startX: clientX,
      startWidth: columnWidths[columnId],
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  return {
    beginResize,
    columnWidths,
    setColumnWidths,
    totalWidth,
  };
}
