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
      headerRight={<span className="text-[12px] text-biz-muted">This Year</span>}
      footer={{ label: "View report" }}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-1 flex-col gap-2.5">
          {data.items.map((item) => (
            <div key={item.category} className="flex items-center justify-between gap-2 text-[13px]">
              <span className="flex min-w-0 items-center gap-2 truncate text-biz-text">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="truncate">{item.category}</span>
              </span>
              <span className="shrink-0 text-biz-muted">{formatBDTCompact(item.amount)}</span>
              <span className="w-10 shrink-0 text-right font-medium text-biz-text">{item.percentage}%</span>
            </div>
          ))}
          {data.items.length === 0 && <p className="text-[13px] text-biz-muted">No category data yet.</p>}
        </div>
        <DonutChart
          data={chartData}
          centerLabel="Total Business"
          centerValue={formatBDTCompact(data.totalBusiness)}
          size={140}
        />
      </div>
    </SectionCard>
  );
}
