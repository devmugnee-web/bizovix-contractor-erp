"use client";

import { useEffect, useRef } from "react";

export function useTransientScrollbar<T extends HTMLElement>() {
  const elementRef = useRef<T | null>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) {
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const showScrollbar = () => {
      element.classList.add("is-scrolling");
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        element.classList.remove("is-scrolling");
        timeoutId = null;
      }, 900);
    };

    element.addEventListener("wheel", showScrollbar, { passive: true });
    element.addEventListener("scroll", showScrollbar, { passive: true });

    return () => {
      element.removeEventListener("wheel", showScrollbar);
      element.removeEventListener("scroll", showScrollbar);
      element.classList.remove("is-scrolling");
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  return elementRef;
}
