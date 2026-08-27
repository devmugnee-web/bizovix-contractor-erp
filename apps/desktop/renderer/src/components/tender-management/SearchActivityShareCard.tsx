"use client";

import { DonutChart } from "@bizovix/ui";
import type { SearchActivityShareItem } from "@/app/(dashboard)/tender-management/mock-data";

export interface SearchActivityShareCardProps {
  items: SearchActivityShareItem[];
}

export function SearchActivityShareCard({ items }: SearchActivityShareCardProps) {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const chartData = items.map((item) => ({ label: item.member.name, value: item.count, color: item.member.color }));

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-biz-border bg-biz-surface shadow-[0_2px_10px_rgba(15,23,42,0.05)]">
      <div className="border-b border-biz-border px-3 py-2.5">
        <h3 className="text-[13px] font-semibold text-biz-text">Search Activity Share</h3>
        <p className="mt-0.5 text-[10.5px] text-biz-muted">Share of tender search by marketers</p>
      </div>

      <div className="flex flex-col items-center gap-3 p-3">
        <div className="relative" style={{ width: 112, height: 112 }}>
          <DonutChart data={chartData} size={112} />
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[20px] font-bold leading-none text-biz-text">{total}</span>
            <span className="mt-1 text-[10px] text-biz-muted">Total</span>
          </div>
        </div>

        <div className="flex w-full flex-col gap-1.5">
          {items.map((item) => (
            <div key={item.member.id} className="flex items-center gap-2 text-[11px]">
              <span
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-white"
                style={{ backgroundColor: item.member.color }}
              >
                {item.member.initial}
              </span>
              <span className="min-w-0 flex-1 truncate text-biz-text">{item.member.name}</span>
              <span className="shrink-0 whitespace-nowrap font-medium text-biz-muted">
                {item.count} ({total === 0 ? "0.00" : ((item.count / total) * 100).toFixed(2)}%)
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-biz-border px-3 py-2 text-[11.5px]">
        <span className="font-semibold text-biz-text">Total</span>
        <span className="font-semibold text-biz-text">{total} (100%)</span>
      </div>
    </div>
  );
}
