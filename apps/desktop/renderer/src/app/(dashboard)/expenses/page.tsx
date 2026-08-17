"use client";

import Link from "next/link";
import { ArrowRight, Briefcase, Wallet } from "lucide-react";
import { PageHeader } from "@bizovix/ui";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

const CARDS = [
  {
    href: "/expenses/project-expense",
    icon: Briefcase,
    title: "Project Expense",
    description: "Log and review expenses linked to a specific ongoing or archived project.",
  },
  {
    href: "/expenses/general-expense",
    icon: Wallet,
    title: "General Expense",
    description: "Log and review administrative and company-wide expenses.",
  },
];

export default function ExpensesPage() {
  useSetBreadcrumb([{ label: "Expenses" }]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Expenses" subtitle="Choose an expense type to continue." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {CARDS.map(({ href, icon: Icon, title, description }) => (
          <Link
            key={href}
            href={href}
            className="group flex min-h-28 flex-col rounded-lg border border-biz-border bg-biz-surface p-4 shadow-card transition hover:border-biz-blue/40 hover:shadow-md"
          >
            <div className="flex justify-between">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-biz-blue-soft text-biz-blue">
                <Icon className="h-4 w-4" />
              </span>
              <ArrowRight className="h-4 w-4 text-biz-muted group-hover:text-biz-blue" />
            </div>
            <h2 className="mt-3 text-[13px] font-bold text-biz-text">{title}</h2>
            <p className="mt-1 text-[11px] text-biz-muted">{description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
