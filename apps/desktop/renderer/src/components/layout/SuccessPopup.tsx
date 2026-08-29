"use client";

import * as React from "react";
import { CheckCircle2, X } from "lucide-react";

export interface SuccessPopupProps {
  open: boolean;
  message: string;
  onClose: () => void;
  title?: string;
  primaryLabel?: string;
  onPrimary?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  dismissOnBackdrop?: boolean;
  dismissOnEscape?: boolean;
}

export function SuccessPopup({
  open,
  message,
  onClose,
  title = "Success",
  primaryLabel = "OK",
  onPrimary,
  secondaryLabel,
  onSecondary,
  dismissOnBackdrop = true,
  dismissOnEscape = true,
}: SuccessPopupProps) {
  const dialogRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && dismissOnEscape) {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [dismissOnEscape, onClose, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-biz-navy/35 p-4"
      onClick={dismissOnBackdrop ? onClose : undefined}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="success-popup-title"
        aria-describedby="success-popup-message"
        className="relative w-full max-w-sm rounded-xl border border-biz-success/20 bg-white px-6 py-7 text-center shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Close success message"
          onClick={onClose}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-biz-muted hover:bg-biz-bg hover:text-biz-text"
        >
          <X className="h-4 w-4" />
        </button>
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-biz-success-soft text-biz-success">
          <CheckCircle2 className="h-8 w-8" />
        </span>
        <h2 id="success-popup-title" className="mt-4 text-[18px] font-bold text-biz-navy">
          {title}
        </h2>
        <p id="success-popup-message" className="mt-2 text-[13px] font-medium leading-5 text-biz-text">
          {message}
        </p>
        <div className="mt-5 flex flex-col-reverse justify-center gap-2 sm:flex-row">
          {secondaryLabel && (
            <button
              type="button"
              onClick={onSecondary ?? onClose}
              className="h-9 rounded-md border border-biz-border bg-white px-5 text-[12px] font-semibold text-biz-navy hover:bg-biz-bg"
            >
              {secondaryLabel}
            </button>
          )}
          <button
            type="button"
            autoFocus
            onClick={onPrimary ?? onClose}
            className="h-9 rounded-md bg-biz-blue px-5 text-[12px] font-semibold text-white hover:bg-biz-blue/90"
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
