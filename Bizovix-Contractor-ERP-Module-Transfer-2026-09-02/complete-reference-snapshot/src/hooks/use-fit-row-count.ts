"use client";

import { useEffect, useState } from "react";
import type { RefObject } from "react";

export function useFitRowCount(
  containerRef: RefObject<HTMLElement | null>,
  rowRef: RefObject<HTMLElement | null>,
  options: { min: number; max: number; fallback: number },
  headerRef?: RefObject<HTMLElement | null>,
) {
  const [count, setCount] = useState(options.fallback);

  function recompute() {
    const container = containerRef.current;
    const rowElement = rowRef.current;
    if (!container || !rowElement) {
      return;
    }

    const rowHeight = rowElement.offsetHeight;
    if (!rowHeight) {
      return;
    }

    const rowStyle = window.getComputedStyle(container);
    const rowGap = Number.parseFloat(rowStyle.rowGap || "0") || 0;
    const headerHeight = headerRef?.current?.offsetHeight ?? 0;
    const available = container.clientHeight - headerHeight;
    const fit = Math.floor((available + rowGap) / (rowHeight + rowGap));
    const next = Math.max(options.min, Math.min(options.max, fit || options.min));

    setCount((current) => (current === next ? current : next));
  }

  // Recompute on every commit (cheap DOM reads) so the count can never go
  // stale, regardless of when the container/row elements first appear or
  // how layout upstream (KPI cards, chart heights, etc.) shifts.
  useEffect(() => {
    recompute();
  });

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(recompute);
    const container = containerRef.current;
    const rowElement = rowRef.current;
    const headerElement = headerRef?.current;
    if (container) {
      observer.observe(container);
    }
    if (rowElement) {
      observer.observe(rowElement);
    }
    if (headerElement) {
      observer.observe(headerElement);
    }

    window.addEventListener("resize", recompute);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", recompute);
    };
  });

  return count;
}
