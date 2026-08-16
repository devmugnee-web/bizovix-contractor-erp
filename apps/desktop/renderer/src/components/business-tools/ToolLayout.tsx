"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SecondaryButton } from "@bizovix/ui";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
export function ToolLayout({
  title,
  subtitle,
  children,
  home = false,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  home?: boolean;
}) {
  useSetBreadcrumb([
    { label: "Business Tools", href: home ? undefined : "/business-tools" },
    ...(!home ? [{ label: title }] : []),
  ]);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-page-title text-biz-text">{title}</h1>
          <p className="mt-1 text-[13px] text-biz-muted">{subtitle}</p>
        </div>
        {!home && (
          <Link href="/business-tools">
            <SecondaryButton>
              <ArrowLeft className="h-4 w-4" />
              Back to Business Tools
            </SecondaryButton>
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}
export function Field({
  label,
  children,
  required = false,
}: {
  label: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block text-[11px] font-semibold text-biz-text">
      {label}
      {required && <span className="text-red-500"> *</span>}
      <div className="mt-1">{children}</div>
    </label>
  );
}
export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-biz-border bg-white p-4 shadow-card">
      <h2 className="mb-4 text-[14px] font-bold text-biz-text">{title}</h2>
      {children}
    </section>
  );
}
export function Result({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-blue-100 bg-blue-50/60 p-3">
      <p className="text-[10px] font-semibold text-biz-muted">{label}</p>
      <p className="mt-1 text-[16px] font-bold text-biz-blue">{value}</p>
    </div>
  );
}
