import { SectionCard } from "@bizovix/ui";
import { formatBDTCompact } from "@bizovix/utils";
import type { TopProject } from "@bizovix/types";

export function TopProjectsCard({ items }: { items: TopProject[] }) {
  return (
    <SectionCard title="Top Projects by Value" index={6} footer={{ label: "View all" }}>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-[1fr_auto_6rem] gap-3 text-[11px] font-medium text-biz-muted">
          <span>Project Name</span>
          <span>Contract Value</span>
          <span>Progress</span>
        </div>
        {items.map((item) => (
          <div
            key={item.id}
            className="grid grid-cols-[1fr_auto_6rem] items-center gap-3 border-t border-biz-border pt-3 text-[13px]"
          >
            <span className="truncate font-medium text-biz-text">{item.name}</span>
            <span className="whitespace-nowrap text-biz-muted">{formatBDTCompact(item.contractValue)}</span>
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-biz-border">
                <div className="h-full rounded-full bg-biz-blue" style={{ width: `${item.progressPercentage}%` }} />
              </div>
              <span className="w-8 shrink-0 text-right text-biz-text">{item.progressPercentage}%</span>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-[13px] text-biz-muted">No ongoing projects.</p>}
      </div>
    </SectionCard>
  );
}
