"use client";

import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface CollapsibleSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Width of the field once expanded. */
  expandedWidth?: string;
  /** Control height so a toolbar can match its neighbouring buttons. */
  size?: "sm" | "md" | "lg";
  className?: string;
  inputClassName?: string;
  /** Announced on the collapsed trigger, e.g. "Search transactions". */
  label?: string;
}

const sizeStyles = {
  sm: { box: "h-8", trigger: "h-8 w-8", collapsedWidth: "w-8", icon: "h-3.5 w-3.5", close: "h-5 w-5", closeIcon: "h-3 w-3" },
  md: { box: "h-10", trigger: "h-10 w-10", collapsedWidth: "w-10", icon: "h-4 w-4", close: "h-6 w-6", closeIcon: "h-3.5 w-3.5" },
  lg: { box: "h-12", trigger: "h-12 w-12", collapsedWidth: "w-12", icon: "h-5 w-5", close: "h-6 w-6", closeIcon: "h-4 w-4" },
} as const;

/**
 * Search field that stays collapsed to a single icon until clicked.
 *
 * Every list/table toolbar in the app uses this so the control behaves
 * identically everywhere instead of each screen hand-rolling its own
 * expand/collapse state. A field that already holds a query stays open on
 * mount, otherwise reopening a screen would hide an active filter.
 */
export function CollapsibleSearch({
  value,
  onChange,
  placeholder = "Search",
  expandedWidth = "w-full sm:w-[240px]",
  size = "md",
  className,
  inputClassName,
  label = "Search",
}: CollapsibleSearchProps) {
  const [expanded, setExpanded] = useState(() => value.trim().length > 0);
  const inputRef = useRef<HTMLInputElement>(null);
  const styles = sizeStyles[size];

  useEffect(() => {
    if (expanded) {
      inputRef.current?.focus();
    }
  }, [expanded]);

  // A query applied from elsewhere (a saved filter, a URL param) must not stay
  // hidden behind the collapsed icon.
  useEffect(() => {
    if (value.trim()) {
      setExpanded(true);
    }
  }, [value]);

  function collapse() {
    onChange("");
    setExpanded(false);
  }

  return (
    <div className={cn("shrink-0 transition-[width] duration-200 ease-out", expanded ? expandedWidth : styles.collapsedWidth, className)}>
      {expanded ? (
        <div className={cn("relative flex w-full min-w-0 items-center", styles.box)}>
          <Search className={cn("pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-[#8a97aa]", styles.icon)} />
          <Input
            ref={inputRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            autoComplete="off"
            spellCheck={false}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                collapse();
              }
            }}
            className={cn("w-full min-w-0 rounded-[6px] border-[#d5dbe4] pl-9 pr-9", styles.box, inputClassName)}
          />
          <button
            type="button"
            className={cn(
              "z-10 flex shrink-0 items-center justify-center rounded-full text-[#6f7d91] transition hover:bg-[#eef2f8] hover:text-[#1f2f46]",
              styles.close,
            )}
            // The app's global `button { position: relative }` rule outranks
            // Tailwind's `absolute`, so the offset has to be set inline.
            style={{ position: "absolute", right: "6px", top: "50%", transform: "translateY(-50%)" }}
            onClick={collapse}
            aria-label={`Close ${label.toLowerCase()}`}
          >
            <X className={styles.closeIcon} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={cn(
            "inline-flex items-center justify-center rounded-[6px] border border-[#d5dbe4] bg-white text-[#6f7d91] transition hover:border-[#b9c6d8] hover:text-[#1f2f46]",
            styles.trigger,
          )}
          onClick={() => setExpanded(true)}
          aria-label={label}
          aria-expanded={false}
          title={label}
        >
          <Search className={styles.icon} />
        </button>
      )}
    </div>
  );
}
