"use client";

import { useEffect, useState } from "react";

const MIN_WIDTH = 1024;
const MAX_WIDTH = 1920;
const MIN_SCALE = 0.82;
const MAX_SCALE = 1;

function computeScale(width: number) {
  if (width <= MIN_WIDTH) {
    return MIN_SCALE;
  }

  if (width >= MAX_WIDTH) {
    return MAX_SCALE;
  }

  const ratio = (width - MIN_WIDTH) / (MAX_WIDTH - MIN_WIDTH);
  return MIN_SCALE + ratio * (MAX_SCALE - MIN_SCALE);
}

export function useViewportScale() {
  const [scale, setScale] = useState(() => (typeof window === "undefined" ? MAX_SCALE : computeScale(window.innerWidth)));

  useEffect(() => {
    function handleResize() {
      setScale(computeScale(window.innerWidth));
    }

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return scale;
}
