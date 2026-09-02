"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Barcode, CreditCard, Receipt, Sparkles, Store } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSessionContext } from "@/hooks/use-session-context";
import { buildWorkspaceRoute } from "@/config/routes";

const UPCOMING_HIGHLIGHTS = [
  { icon: Barcode, label: "Fast barcode & touch checkout" },
  { icon: CreditCard, label: "Cash, card & mobile payments in one bill" },
  { icon: Receipt, label: "Instant receipt printing" },
];

export function PosComingSoonScreen() {
  const router = useRouter();
  const { mode } = useSessionContext();

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center overflow-hidden rounded-[8px] border border-[#d9e1ed] bg-white shadow-[0_16px_36px_rgba(15,23,42,0.05)]">
      <div className="relative w-full max-w-[560px] px-6 py-14 text-center sm:px-10">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[220px] bg-[radial-gradient(circle_at_top,rgba(20,184,166,0.14),transparent_65%)]" />

        <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-[24px] bg-[linear-gradient(135deg,#14b8a6_0%,#0ea5e9_100%)] shadow-[0_16px_32px_rgba(14,165,233,0.28)]">
          <Store className="h-9 w-9 text-white" />
          <span className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-primary shadow-[0_6px_16px_rgba(15,23,42,0.14)]">
            <Sparkles className="h-4 w-4" />
          </span>
        </div>

        <div className="relative mt-6 inline-flex items-center gap-2 rounded-full bg-[#eef9f7] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#0f8a7a]">
          Coming Soon
        </div>

        <h1 className="relative mt-3 text-[26px] font-semibold text-[#1d2d4a] sm:text-[30px]">Bizovix POS</h1>
        <p className="relative mx-auto mt-3 max-w-[420px] text-[14px] leading-6 text-[#66768f]">
          A dedicated counter-billing experience for walk-in customers is on its way. We&apos;re polishing it before
          bringing it to your workspace.
        </p>

        <div className="relative mt-8 grid gap-3 text-left sm:grid-cols-1">
          {UPCOMING_HIGHLIGHTS.map((item) => (
            <div key={item.label} className="flex items-center gap-3 rounded-2xl border border-[#e7ecf3] bg-[#fbfcff] px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[#0f8a7a] shadow-[0_6px_14px_rgba(15,23,42,0.06)]">
                <item.icon className="h-4 w-4" />
              </span>
              <span className="text-[14px] font-medium text-[#33455f]">{item.label}</span>
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(buildWorkspaceRoute(mode, "/dashboard"))}
          className="relative mt-8 h-11 rounded-full border-[#d8e2ef] px-6 text-[#2f4566]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Button>
      </div>
    </div>
  );
}
