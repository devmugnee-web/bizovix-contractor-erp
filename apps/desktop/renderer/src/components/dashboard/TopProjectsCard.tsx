import Link from "next/link";
import { SectionCard } from "@bizovix/ui";
import { formatBDTCompact } from "@bizovix/utils";
import type { TopProject } from "@bizovix/types";

export function TopProjectsCard({ items }: { items: TopProject[] }) {
  return (
    <SectionCard
      title="Top Projects by Value"
      index={6}
      footer={{ label: "View all", href: "/cms/ongoing-works" }}
      className="h-full min-h-0"
      bodyClassName="scrollbar-hidden overflow-y-auto p-1 sm:p-1.5 2xl:p-2"
    >
      <div className="flex h-full min-h-0 flex-col gap-1 2xl:gap-1.5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_2.5rem] gap-1 px-1 text-[8px] font-bold uppercase tracking-[0.03em] text-slate-600 2xl:grid-cols-[minmax(0,1fr)_auto_3.5rem] 2xl:gap-2 2xl:text-[10px]">
          <span>Project Name</span>
          <span>Contract Value</span>
          <span>Progress</span>
        </div>
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/cms/ongoing-works/${item.id}`}
            className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_auto_2.5rem] items-center gap-1 rounded-md border border-slate-100 bg-slate-50/60 p-1 text-[9px] transition-colors hover:border-biz-blue/20 hover:bg-biz-blue-soft/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-biz-blue lg:text-[10px] 2xl:grid-cols-[minmax(0,1fr)_auto_3.5rem] 2xl:gap-2 2xl:p-2 2xl:text-[12px]"
          >
            <span title={item.name} className="truncate font-medium text-biz-text">
              {item.name}
            </span>
            <span className="whitespace-nowrap font-semibold text-slate-600">
              {formatBDTCompact(item.contractValue)}
            </span>
            <div className="flex items-center gap-1.5">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-blue-100/80">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-biz-blue to-cyan-400"
                  style={{ width: `${item.progressPercentage}%` }}
                />
              </div>
              <span className="w-5 shrink-0 text-right text-[8px] font-semibold text-biz-text 2xl:w-7 2xl:text-[10px]">
                {item.progressPercentage}%
              </span>
            </div>
          </Link>
        ))}
        {items.length === 0 && (
          <p className="rounded-md border border-dashed border-slate-200 bg-slate-50/70 px-1 py-3 text-center text-[9px] text-biz-muted 2xl:text-[11px]">
            No ongoing projects.
          </p>
        )}
      </div>
    </SectionCard>
  );
}
