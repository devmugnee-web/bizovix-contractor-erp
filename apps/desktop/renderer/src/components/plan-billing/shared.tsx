"use client";
import * as React from "react";
import { X } from "lucide-react";
import type { StatusBadgeTone } from "@bizovix/ui";
import { cn } from "@bizovix/ui";

export function useBillingNotice() {
  const [notice, setNotice] = React.useState("");
  React.useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(t);
  }, [notice]);
  const Notice = notice ? (
    <div className="fixed right-5 top-16 z-[60] rounded bg-biz-navy px-4 py-2 text-[12px] text-white">{notice}</div>
  ) : null;
  return { notify: setNotice, Notice };
}

export const STATUS_TONE: Record<string, StatusBadgeTone> = {
  TRIALING: "info",
  ACTIVE: "success",
  PAST_DUE: "warning",
  EXPIRED: "danger",
  CANCELED: "neutral",
  SUSPENDED: "danger",
  PAID: "success",
  PENDING: "warning",
  FAILED: "danger",
  OVERDUE: "danger",
  REFUNDED: "neutral",
  VERIFIED: "success",
  REJECTED: "danger",
};

export const STATUS_LABEL: Record<string, string> = {
  TRIALING: "TRIAL",
  ACTIVE: "ACTIVE",
  PAST_DUE: "PAST DUE",
  EXPIRED: "EXPIRED",
  CANCELED: "CANCELLED",
  SUSPENDED: "SUSPENDED",
};

export function money(currency: string, value: string | number) {
  const n = Number(value);
  return `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function Card({
  title,
  description,
  headerRight,
  children,
  className,
}: {
  title?: string;
  description?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border border-biz-border bg-white shadow-card", className)}>
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-biz-border p-4">
          <div>
            <h2 className="text-[14px] font-bold text-biz-text">{title}</h2>
            {description && <p className="mt-1 text-[11px] text-biz-muted">{description}</p>}
          </div>
          {headerRight}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function ProgressBar({ percent, tone = "blue" }: { percent: number; tone?: "blue" | "orange" | "red" }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const barColor = tone === "red" ? "bg-biz-danger" : tone === "orange" ? "bg-biz-orange" : "bg-biz-blue";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-biz-border">
      <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${clamped}%` }} />
    </div>
  );
}

export function Overlay({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <section
        className={cn("max-h-[92vh] w-full overflow-y-auto rounded-lg bg-white p-5 shadow-card-hover", wide ? "max-w-2xl" : "max-w-md")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[16px] font-bold">{title}</h2>
          <button aria-label="Close" onClick={onClose}>
            <X className="h-5 w-5 text-biz-muted" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

export function Field({ label, required = false, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="text-[11px] font-semibold">
      {label}
      {required && <span className="text-biz-danger"> *</span>}
      <div className="mt-1 font-normal">{children}</div>
    </label>
  );
}
