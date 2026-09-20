"use client";

import { cn } from "@bizovix/ui";

export interface SearchActivityShareItem {
  member: {
    id: string;
    name: string;
    initial: string;
    color: string;
  };
  count: number;
}

export interface SearchActivityShareCardProps {
  items: SearchActivityShareItem[];
  className?: string;
}

export function SearchActivityShareCard({ items, className }: SearchActivityShareCardProps) {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  let chartCursor = 0;
  const chartSegments = items.flatMap((item) => {
    const start = chartCursor;
    const end = total > 0 ? start + (item.count / total) * 360 : start;
    chartCursor = end;
    const visibleEnd = Math.max(start, end - 1.5);
    return [
      `${item.member.color} ${start}deg ${visibleEnd}deg`,
      `transparent ${visibleEnd}deg ${end}deg`,
    ];
  });
  const chartBackground = total > 0 ? `conic-gradient(${chartSegments.join(", ")})` : "#e2e8f0";

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-lg border border-biz-border bg-white shadow-card",
        className,
      )}
    >
      <div className="shrink-0 border-b border-biz-border bg-slate-50/45 px-3 py-2.5 [@media(max-height:700px)]:py-2">
        <h3 className="text-[13px] font-semibold text-biz-text">Search Activity Share</h3>
        <p className="mt-0.5 text-[10.5px] text-biz-muted [@media(max-height:700px)]:hidden">
          Share of tender search by marketers
        </p>
      </div>

      <div className="scrollbar-hidden flex min-h-0 flex-1 flex-col items-center gap-3 overflow-y-auto p-3 [@media(max-height:700px)]:grid [@media(max-height:700px)]:content-center [@media(max-height:700px)]:grid-cols-[80px_minmax(0,1fr)] [@media(max-height:700px)]:items-center [@media(max-height:700px)]:gap-2 [@media(max-height:700px)]:p-2">
        <div
          className="relative h-24 w-24 shrink-0 rounded-full [@media(max-height:700px)]:h-20 [@media(max-height:700px)]:w-20"
          style={{ background: chartBackground }}
        >
          <span className="absolute inset-[13px] rounded-full bg-white [@media(max-height:700px)]:inset-[11px]" />
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[20px] font-bold leading-none text-biz-text [@media(max-height:700px)]:text-[17px]">
              {total}
            </span>
            <span className="mt-1 text-[10px] text-biz-muted [@media(max-height:700px)]:mt-0.5 [@media(max-height:700px)]:text-[9px]">
              Total
            </span>
          </div>
        </div>

        <div className="flex w-full min-w-0 flex-col gap-1.5 [@media(max-height:700px)]:gap-1">
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

      <div className="flex shrink-0 items-center justify-between border-t border-biz-border px-3 py-2 text-[11.5px] [@media(max-height:700px)]:py-1.5">
        <span className="font-semibold text-biz-text">Total</span>
        <span className="font-semibold text-biz-text">{total} (100%)</span>
      </div>
    </div>
  );
}
