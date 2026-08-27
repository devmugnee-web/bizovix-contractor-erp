import { CircularProgress, SectionCard } from "@bizovix/ui";
import { formatBDTCompact } from "@bizovix/utils";
import type { TargetVsAchievement } from "@bizovix/types";

export function TargetVsAchievementCard({ data }: { data: TargetVsAchievement }) {
  return (
    <SectionCard
      title="Target vs Achievement (This Month)"
      index={1}
      headerRight={<span className="text-[6px] text-biz-muted sm:text-[8px] lg:text-[10px]">This Month</span>}
      bodyClassName="p-1.5 sm:p-2"
    >
      <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-1 sm:gap-2">
        <div className="grid min-w-0 grid-cols-1 gap-1">
          <div className="rounded-md bg-slate-50 px-1.5 py-1 ring-1 ring-inset ring-slate-100 sm:px-2 xl:px-3 xl:py-2">
            <p className="text-[6px] font-semibold uppercase tracking-[0.04em] text-biz-muted sm:text-[8px] lg:text-[9px] xl:text-[10px]">Target</p>
            <p className="text-[8px] font-bold leading-tight text-biz-text sm:text-[10px] lg:text-[12px] xl:text-[14px]">{formatBDTCompact(data.target)}</p>
          </div>
          <div className="rounded-md bg-blue-50/60 px-1.5 py-1 ring-1 ring-inset ring-blue-100/70 sm:px-2 xl:px-3 xl:py-2">
            <p className="text-[6px] font-semibold uppercase tracking-[0.04em] text-biz-muted sm:text-[8px] lg:text-[9px] xl:text-[10px]">Achievement</p>
            <p className="text-[8px] font-bold leading-tight text-biz-text sm:text-[10px] lg:text-[12px] xl:text-[14px]">{formatBDTCompact(data.achievement)}</p>
          </div>
          <div className="rounded-md bg-emerald-50/60 px-1.5 py-1 ring-1 ring-inset ring-emerald-100/70 sm:px-2 xl:px-3 xl:py-2">
            <p className="text-[6px] font-semibold uppercase tracking-[0.04em] text-biz-muted sm:text-[8px] lg:text-[9px] xl:text-[10px]">Achievement Rate</p>
            <p className="text-[8px] font-bold leading-tight text-biz-success sm:text-[10px] lg:text-[12px] xl:text-[14px]">{data.achievementRate}%</p>
          </div>
        </div>
        <div className="justify-self-center">
          <CircularProgress
            percentage={Math.min(data.achievementRate, 100)}
            color="#0B5CFF"
            label={`${data.achievementRate}%`}
            sublabel="Achieved"
            size={104}
            responsive
          />
        </div>
      </div>
    </SectionCard>
  );
}
