"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, BriefcaseBusiness, FileText, Landmark, UserRoundCheck, Users } from "lucide-react";

import { ModuleComingSoonIllustration } from "@/components/shared/module-coming-soon-illustration";
import { Button } from "@/components/ui/button";
import { buildWorkspaceRoute } from "@/config/routes";
import { useSessionContext } from "@/hooks/use-session-context";

const MODULES = {
  lc: {
    title: "LC Management",
    description: "Manage letters of credit, shipment documents, bank activity, and import settlement from one workspace.",
    icon: BriefcaseBusiness,
    tone: "orange" as const,
    highlights: [
      { icon: FileText, label: "Track LC applications and supporting documents" },
      { icon: Landmark, label: "Monitor issuing banks, limits, and settlements" },
      { icon: BriefcaseBusiness, label: "Follow shipment and import milestones" },
    ],
  },
  payroll: {
    title: "HR & Payroll",
    description: "Manage employees, attendance, payroll processing, and HR records from one workspace.",
    icon: Users,
    tone: "indigo" as const,
    highlights: [
      { icon: Users, label: "Maintain employee profiles and departments" },
      { icon: UserRoundCheck, label: "Track attendance, leave, and employment status" },
      { icon: BriefcaseBusiness, label: "Process salaries, deductions, and payroll history" },
    ],
  },
} as const;

export function OrganizationalModuleComingSoonScreen({ module }: { module: keyof typeof MODULES }) {
  const router = useRouter();
  const { mode } = useSessionContext();
  const details = MODULES[module];
  const ModuleIcon = details.icon;

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center overflow-hidden rounded-[8px] border border-[#d9e1ed] bg-white shadow-[0_16px_36px_rgba(15,23,42,0.05)]">
      <div className="relative w-full max-w-[560px] px-6 py-14 text-center sm:px-10">
        <ModuleComingSoonIllustration
          icon={ModuleIcon}
          detailIcons={[details.highlights[0].icon, details.highlights[1].icon, details.highlights[2].icon]}
          tone={details.tone}
        />
        <div className="relative mt-2 inline-flex rounded-full bg-[#eef4ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#2563eb]">Coming Soon</div>
        <h1 className="relative mt-3 text-[30px] font-semibold text-[#1d2d4a]">{details.title}</h1>
        <p className="relative mx-auto mt-3 max-w-[440px] text-[14px] leading-6 text-[#66768f]">{details.description}</p>
        <div className="relative mt-8 grid gap-3 text-left">
          {details.highlights.map((item) => (
            <div key={item.label} className="flex items-center gap-3 rounded-2xl border border-[#e7ecf3] bg-[#fbfcff] px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[#2563eb] shadow-[0_6px_14px_rgba(15,23,42,0.06)]"><item.icon className="h-4 w-4" /></span>
              <span className="text-[14px] font-medium text-[#33455f]">{item.label}</span>
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" onClick={() => router.push(buildWorkspaceRoute(mode, "/dashboard"))} className="relative mt-8 h-11 rounded-full px-6">
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </Button>
      </div>
    </div>
  );
}
