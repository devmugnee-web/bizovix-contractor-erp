import Link from "next/link";
import { SectionCard, cn } from "@bizovix/ui";
import { formatBDTCompact } from "@bizovix/utils";
import type { TopProject } from "@bizovix/types";

export function TopProjectsCard({ items }: { items: TopProject[] }) {
  return (
    <SectionCard
      title="Top Projects by Value"
      index={6}
      footer={{ label: "View all", href: "/cms/ongoing-works" }}
      className="h-[240px] min-h-0 xl:h-full"
      bodyClassName="scrollbar-hidden overflow-y-auto p-1 sm:p-1.5 2xl:p-2"
    >
      <div className="flex h-full min-h-0 flex-col gap-1 2xl:gap-1.5">
        <div className="grid grid-cols-[minmax(0,1fr)_5rem_3rem] gap-1 px-1 text-[8px] font-bold uppercase tracking-[0.03em] text-slate-600 2xl:grid-cols-[minmax(0,1fr)_7rem_4rem] 2xl:gap-2 2xl:text-[10px]">
          <span>Project Name</span>
          <span className="text-right">Contract Value</span>
          <span className="text-right">Progress</span>
        </div>
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/cms/ongoing-works/${item.id}`}
            className="grid h-8 shrink-0 grid-cols-[minmax(0,1fr)_5rem_3rem] items-center gap-1 rounded-md border border-slate-100 bg-slate-50/60 p-1 text-[9px] transition-colors hover:border-biz-blue/20 hover:bg-biz-blue-soft/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-biz-blue lg:text-[10px] 2xl:h-11 2xl:grid-cols-[minmax(0,1fr)_7rem_4rem] 2xl:gap-2 2xl:p-2 2xl:text-[12px]"
          >
            <span title={item.name} className="truncate font-medium text-biz-text">
              {item.name}
            </span>
            <span className="whitespace-nowrap text-right font-semibold text-slate-600">
              {formatBDTCompact(item.contractValue)}
            </span>
            <div className="flex justify-end">
              <span
                title={`${item.progressPercentage}% complete`}
                className={cn(
                  "inline-flex min-w-9 items-center justify-center rounded-full px-1.5 py-0.5 text-[8px] font-bold leading-none 2xl:min-w-11 2xl:px-2 2xl:py-1 2xl:text-[10px]",
                  item.progressPercentage >= 100
                    ? "bg-emerald-100 text-emerald-700"
                    : item.progressPercentage > 0
                      ? "bg-blue-100 text-blue-700"
                      : "bg-slate-100 text-slate-600",
                )}
              >
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
