import { CircularProgress, SectionCard } from "@bizovix/ui";
import { formatBDTCompact } from "@bizovix/utils";
import type { TargetVsAchievement } from "@bizovix/types";

export function TargetVsAchievementCard({ data }: { data: TargetVsAchievement }) {
  return (
    <SectionCard
      title="Target vs Achievement (This Month)"
      index={1}
      headerRight={<span className="text-[11px] text-biz-muted">This Month</span>}
      footer={{ label: "View details" }}
      bodyClassName="p-3"
    >
      <div className="grid items-center gap-2 xl:grid-cols-[1fr_auto]">
        <div className="grid min-w-0 grid-cols-1 gap-1.5 sm:grid-cols-3 xl:grid-cols-1 xl:gap-2">
          <div>
            <p className="text-[11px] text-biz-muted">Target</p>
            <p className="text-[15px] font-bold leading-tight text-biz-text">{formatBDTCompact(data.target)}</p>
          </div>
          <div className="border-t border-biz-border pt-1.5 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0 xl:border-l-0 xl:border-t xl:pl-0 xl:pt-2">
            <p className="text-[11px] text-biz-muted">Achievement</p>
            <p className="text-[15px] font-bold leading-tight text-biz-text">{formatBDTCompact(data.achievement)}</p>
          </div>
          <div className="border-t border-biz-border pt-1.5 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0 xl:border-l-0 xl:border-t xl:pl-0 xl:pt-2">
            <p className="text-[11px] text-biz-muted">Achievement Rate</p>
            <p className="text-[15px] font-bold leading-tight text-biz-success">{data.achievementRate}%</p>
          </div>
        </div>
        <div className="justify-self-center">
          <CircularProgress
            percentage={Math.min(data.achievementRate, 100)}
            color="#0B5CFF"
            label={`${data.achievementRate}%`}
            sublabel="Achieved"
            size={104}
          />
        </div>
      </div>
    </SectionCard>
  );
}
