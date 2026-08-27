import { DonutChart, SectionCard } from "@bizovix/ui";
import { formatBDTCompact } from "@bizovix/utils";
import type { BusinessByCategory } from "@bizovix/types";

export function BusinessByCategoryCard({ data }: { data: BusinessByCategory }) {
  const chartData = data.items.map((item) => ({
    label: item.category,
    value: Number(item.amount),
    color: item.color,
  }));

  return (
    <SectionCard
      title="Business by Category (This Year)"
      index={3}
      headerRight={<span className="text-[6px] text-biz-muted sm:text-[8px] lg:text-[10px]">This Year</span>}
      bodyClassName="p-1.5 sm:p-2"
    >
      <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_80px] items-center gap-1 sm:gap-2 xl:grid-cols-[minmax(0,1fr)_116px]">
        <div className="flex min-w-0 flex-col gap-1">
          {data.items.map((item) => (
            <div key={item.category} className="grid min-w-0 grid-cols-[minmax(0,1fr)_38px_24px] items-center gap-1 rounded-md bg-slate-50/80 px-1 py-0.5 text-[6px] ring-1 ring-inset ring-slate-100 sm:text-[8px] lg:text-[9px] xl:grid-cols-[minmax(0,1fr)_72px_38px] xl:px-2.5 xl:py-1.5 xl:text-[10px]">
              <span className="flex min-w-0 items-center gap-2 text-biz-text">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="min-w-0 break-words leading-tight">{item.category}</span>
              </span>
              <span className="whitespace-nowrap text-right font-medium text-biz-muted">{formatBDTCompact(item.amount)}</span>
              <span className="whitespace-nowrap text-right font-semibold text-biz-text">{item.percentage}%</span>
            </div>
          ))}
          {data.items.length === 0 && <p className="rounded-md border border-dashed border-slate-200 bg-slate-50/70 px-1 py-3 text-center text-[7px] text-biz-muted sm:text-[9px] xl:py-6 xl:text-[10px]">No category data yet.</p>}
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
    </SectionCard>
  );
}
