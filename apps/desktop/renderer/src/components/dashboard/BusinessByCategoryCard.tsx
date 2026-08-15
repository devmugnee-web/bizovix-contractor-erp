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
      headerRight={<span className="text-[11px] text-biz-muted">This Year</span>}
      footer={{ label: "View report" }}
      bodyClassName="p-3"
    >
      <div className="grid items-center gap-2 xl:grid-cols-[minmax(0,1fr)_144px]">
        <div className="flex min-w-0 flex-col gap-1.5">
          {data.items.map((item) => (
            <div key={item.category} className="grid min-w-0 grid-cols-[minmax(0,1fr)_72px_40px] items-center gap-1.5 text-[10px]">
              <span className="flex min-w-0 items-center gap-2 text-biz-text">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="min-w-0 break-words leading-tight">{item.category}</span>
              </span>
              <span className="whitespace-nowrap text-right text-biz-muted">{formatBDTCompact(item.amount)}</span>
              <span className="whitespace-nowrap text-right font-semibold text-biz-text">{item.percentage}%</span>
            </div>
          ))}
          {data.items.length === 0 && <p className="text-[13px] text-biz-muted">No category data yet.</p>}
        </div>
        <div className="justify-self-end">
          <DonutChart
            data={chartData}
            centerLabel="Total Business"
            centerValue={formatBDTCompact(data.totalBusiness)}
            size={136}
          />
        </div>
      </div>
    </SectionCard>
  );
}
