"use client";
import Link from "next/link";
import {
  ArrowRight,
  Calculator,
  CalendarDays,
  FilePenLine,
  Import,
  ListChecks,
  QrCode,
  TextCursorInput,
} from "lucide-react";
import { TOOL_DEFS } from "@/lib/business-tools";
import { ToolLayout } from "./ToolLayout";
const icons = [Calculator, CalendarDays, TextCursorInput, FilePenLine, ListChecks, QrCode, Import];
export function BusinessToolsHome() {
  return (
    <ToolLayout
      home
      title="Business Tools"
      subtitle="Useful tools and utilities for tender, project and business operations."
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {TOOL_DEFS.map((tool, i) => {
          const Icon = icons[i]!;
          return (
            <Link
              key={tool.slug}
              href={`/business-tools/${tool.slug}`}
              className="group flex min-h-32 flex-col rounded-lg border border-biz-border bg-white p-4 shadow-card transition hover:border-blue-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-50 text-biz-blue">
                  <Icon className="h-4 w-4" />
                </span>
                <ArrowRight className="h-4 w-4 text-biz-muted transition group-hover:translate-x-1 group-hover:text-biz-blue" />
              </div>
              <h2 className="mt-3 text-[13px] font-bold text-biz-text">{tool.title}</h2>
              <p className="mt-1 text-[11px] leading-4 text-biz-muted">{tool.description}</p>
            </Link>
          );
        })}
      </div>
    </ToolLayout>
  );
}
