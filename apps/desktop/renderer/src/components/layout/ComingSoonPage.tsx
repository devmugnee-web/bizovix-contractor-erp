"use client";

import { Construction } from "lucide-react";
import { PageHeader, type BreadcrumbItem } from "@bizovix/ui";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

export interface ComingSoonPageProps {
  title: string;
  breadcrumb: BreadcrumbItem[];
  subtitle?: string;
}

export function ComingSoonPage({ title, breadcrumb, subtitle }: ComingSoonPageProps) {
  useSetBreadcrumb(breadcrumb);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={title} subtitle={subtitle ?? "This module is coming soon."} />
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-biz-border bg-biz-surface py-16">
        <Construction className="h-8 w-8 text-biz-muted" />
        <p className="text-[13px] text-biz-muted">This module is under construction and will be available soon.</p>
      </div>
    </div>
  );
}
