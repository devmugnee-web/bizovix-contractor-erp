"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { m, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  overlayClassName,
  children,
  submitOnEnter = false,
  hideClose = false,
  disableMotion = false,
  ...props
}: DialogPrimitive.DialogContentProps & { submitOnEnter?: boolean; hideClose?: boolean; overlayClassName?: string; disableMotion?: boolean }) {
  const reduceMotion = useReducedMotion();
  const customPlacementClass = typeof className === "string" ? className : "";
  const useViewportCenter =
    !customPlacementClass.includes("left-auto") &&
    !customPlacementClass.includes("right-0") &&
    !customPlacementClass.includes("!left-0") &&
    !customPlacementClass.includes("!top-0") &&
    !customPlacementClass.includes("translate-x-0") &&
    !customPlacementClass.includes("translate-y-0");

  function handleKeyDownCapture(event: React.KeyboardEvent<HTMLDivElement>) {
    props.onKeyDownCapture?.(event);

    if (
      !submitOnEnter ||
      event.defaultPrevented ||
      event.key !== "Enter" ||
      event.shiftKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.nativeEvent.isComposing
    ) {
      return;
    }

    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) {
      return;
    }

    if (
      target.closest("form") ||
      target.closest("[data-disable-enter-submit]") ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLButtonElement ||
      target instanceof HTMLAnchorElement ||
      target.isContentEditable
    ) {
      return;
    }

    if (
      target instanceof HTMLInputElement &&
      ["button", "submit", "reset", "checkbox", "radio", "file"].includes(target.type)
    ) {
      return;
    }

    if (target.closest("[role='listbox'], [role='menu'], [cmdk-root]")) {
      return;
    }

    const action = event.currentTarget.querySelector<HTMLElement>(
      "[data-enter-submit], button[type='submit'], input[type='submit']",
    );
    if (!action) {
      return;
    }

    if (
      ("disabled" in action && Boolean((action as HTMLButtonElement | HTMLInputElement).disabled)) ||
      action.getAttribute("aria-disabled") === "true"
    ) {
      return;
    }

    event.preventDefault();
    action.click();
  }

  return (
    <DialogPortal>
      <DialogPrimitive.Overlay asChild>
        <m.div
          className={cn("fixed inset-0 z-50 bg-[#0f172a]/20 backdrop-blur-[1px]", overlayClassName)}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={reduceMotion ? undefined : { opacity: 1 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        />
      </DialogPrimitive.Overlay>
      {useViewportCenter ? (
        <DialogPrimitive.Content asChild {...props}>
          <m.div
            data-erp-modal-content="true"
            onKeyDownCapture={handleKeyDownCapture}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
              }
            }}
            className={cn(
              "fixed left-1/2 top-1/2 z-50 w-[min(92vw,680px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[24px] border border-border bg-white p-5 shadow-xl",
              className,
            )}
            initial={reduceMotion || disableMotion ? false : { opacity: 0 }}
            animate={reduceMotion || disableMotion ? undefined : { opacity: 1 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
            {hideClose ? null : (
              <DialogPrimitive.Close className="!absolute !right-4 !top-4 z-20 rounded-full bg-[#eef1f6] p-1.5 text-[#4b5768] shadow-sm transition hover:bg-[#fee2e2] hover:text-[#dc2626]">
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
            )}
          </m.div>
        </DialogPrimitive.Content>
      ) : (
        <DialogPrimitive.Content asChild {...props}>
          <m.div
            data-erp-modal-content="true"
            onKeyDownCapture={handleKeyDownCapture}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
              }
            }}
            className={cn("fixed z-50 w-[min(92vw,680px)] overflow-hidden rounded-[24px] border border-border bg-white p-5 shadow-xl", className)}
            initial={reduceMotion || disableMotion ? false : { opacity: 0 }}
            animate={reduceMotion || disableMotion ? undefined : { opacity: 1 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
            {hideClose ? null : (
              <DialogPrimitive.Close className="!absolute !right-4 !top-4 z-20 rounded-full bg-[#eef1f6] p-1.5 text-[#4b5768] shadow-sm transition hover:bg-[#fee2e2] hover:text-[#dc2626]">
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
            )}
          </m.div>
        </DialogPrimitive.Content>
      )}
    </DialogPortal>
  );
}

export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;
