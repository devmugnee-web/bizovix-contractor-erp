"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Boxes, Landmark, TrendingDown } from "lucide-react";

import { ModuleComingSoonIllustration } from "@/components/shared/module-coming-soon-illustration";
import { Button } from "@/components/ui/button";
import { useSessionContext } from "@/hooks/use-session-context";
import { buildWorkspaceRoute } from "@/config/routes";

const UPCOMING_HIGHLIGHTS = [
  { icon: Landmark, label: "Track fixed assets by category and location" },
  { icon: TrendingDown, label: "Automatic depreciation schedules" },
  { icon: Boxes, label: "Asset transfer, disposal & write-off history" },
];

export function AssetsManagementComingSoonScreen() {
  const router = useRouter();
  const { mode } = useSessionContext();

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center overflow-hidden rounded-[8px] border border-[#d9e1ed] bg-white shadow-[0_16px_36px_rgba(15,23,42,0.05)]">
      <div className="relative w-full max-w-[560px] px-6 py-14 text-center sm:px-10">
        <ModuleComingSoonIllustration icon={Landmark} detailIcons={[Landmark, TrendingDown, Boxes]} tone="teal" />

        <div className="relative mt-2 inline-flex items-center gap-2 rounded-full bg-[#eef9f7] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#0f8a7a]">
          Coming Soon
        </div>

        <h1 className="relative mt-3 text-[26px] font-semibold text-[#1d2d4a] sm:text-[30px]">Assets Management</h1>
        <p className="relative mx-auto mt-3 max-w-[420px] text-[14px] leading-6 text-[#66768f]">
          Track fixed assets, depreciation, and asset lifecycle across your business. We&apos;re building it now.
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
