import type { ReactNode } from "react";
import { DonutChart, SectionCard } from "@bizovix/ui";
import { formatBDTCompact } from "@bizovix/utils";
import type { BusinessByCategory } from "@bizovix/types";

export function BusinessByCategoryCard({
  data,
  periodControl,
  customDateRange,
}: {
  data: BusinessByCategory;
  periodControl: ReactNode;
  customDateRange?: ReactNode;
}) {
  const chartData = data.items.map((item) => ({
    label: item.category,
    value: Number(item.amount),
    color: item.color,
  }));

  return (
    <SectionCard
      title="Business by Category"
      index={3}
      headerRight={periodControl}
      bodyClassName="p-1.5 sm:p-2 2xl:p-3"
    >
      <div className="flex h-full min-h-0 flex-col gap-1 2xl:gap-2">
        {customDateRange}
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_80px] items-center gap-2 xl:grid-cols-[minmax(0,1fr)_116px] 2xl:grid-cols-[minmax(0,1fr)_138px] 2xl:gap-3">
          <div className="max-h-full min-h-0 min-w-0 overflow-y-auto pr-1">
            <div className="flex min-w-0 flex-col gap-1 2xl:gap-2">
              {data.items.map((item) => (
                <div
                  key={item.category}
                  className="grid min-w-0 grid-cols-[minmax(0,1fr)_48px_30px] items-center gap-1 rounded-md bg-slate-50/80 px-1.5 py-1 text-[8px] ring-1 ring-inset ring-slate-100 lg:text-[9px] xl:grid-cols-[minmax(0,1fr)_72px_38px] xl:px-2.5 xl:py-1.5 xl:text-[10px] 2xl:grid-cols-[minmax(0,1fr)_88px_44px] 2xl:px-3 2xl:py-2 2xl:text-[12px]"
                >
                  <span className="flex min-w-0 items-center gap-2 text-biz-text">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span title={item.category} className="min-w-0 truncate leading-tight">
                      {item.category}
                    </span>
                  </span>
                  <span className="whitespace-nowrap text-right font-medium text-biz-muted">
                    {formatBDTCompact(item.amount)}
                  </span>
                  <span className="whitespace-nowrap text-right font-semibold text-biz-text">
                    {item.percentage}%
                  </span>
                </div>
              ))}
              {data.items.length === 0 && (
                <p className="rounded-md border border-dashed border-slate-200 bg-slate-50/70 px-1 py-3 text-center text-[9px] text-biz-muted xl:py-6 xl:text-[10px] 2xl:text-[12px]">
                  No category data yet.
                </p>
              )}
            </div>
          </div>
          <div className="justify-self-end">
            <DonutChart
              data={chartData}
              centerLabel="Total Business"
              centerValue={formatBDTCompact(data.totalBusiness)}
              size={108}
              responsive
            />
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
