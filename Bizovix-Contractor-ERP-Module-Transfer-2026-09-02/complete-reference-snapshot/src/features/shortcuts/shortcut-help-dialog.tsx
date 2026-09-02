"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { globalShortcutItems } from "@/config/shortcuts";
import { voucherShortcutOrder } from "@/config/navigation";
import { useEscapeDismiss } from "@/hooks/use-escape-dismiss";
import { useUiStore } from "@/stores/ui-store";

export function ShortcutHelpDialog() {
  const open = useUiStore((state) => state.shortcutHelpOpen);
  const setOpen = useUiStore((state) => state.setShortcutHelpOpen);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEscapeDismiss(open, () => setOpen(false));

  if (!mounted || !open) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[140]">
      <button
        type="button"
        className="absolute inset-0 bg-[#0f172a]/20 backdrop-blur-[1px]"
        aria-label="Close shortcuts"
        onClick={() => setOpen(false)}
      />
      <div className="relative flex h-full w-full items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="shortcut-help-title"
          aria-describedby="shortcut-help-description"
          className="relative max-h-[85vh] w-[min(92vw,740px)] overflow-y-auto rounded-[24px] border border-border bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.22)]"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 id="shortcut-help-title" className="text-lg font-semibold">
                Keyboard Shortcuts
              </h2>
              <p id="shortcut-help-description" className="text-sm text-muted">
                Designed to keep Bizovix ERP fast for accountants and demo walkthroughs.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#d7dfeb] bg-white text-[#334155] shadow-sm transition hover:bg-[#f8fafc] hover:text-[#0f172a]"
              aria-label="Close shortcuts"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-6 pt-4 md:grid-cols-2">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted">Global</h3>
              {globalShortcutItems.map((item) => (
                <div key={item.combo} className="flex items-center justify-between rounded-xl border border-border px-3 py-3">
                  <span className="text-sm text-foreground">{item.description}</span>
                  <span className="rounded-md border border-border px-2 py-1 text-xs font-semibold text-primary">{item.combo}</span>
                </div>
              ))}
            </div>
            <div className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted">Vouchers</h3>
              {voucherShortcutOrder.map((item) => (
                <div key={item.key} className="flex items-center justify-between rounded-xl border border-border px-3 py-3">
                  <span className="text-sm text-foreground">{item.label}</span>
                  <span className="rounded-md border border-border px-2 py-1 text-xs font-semibold text-primary">{item.key}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

