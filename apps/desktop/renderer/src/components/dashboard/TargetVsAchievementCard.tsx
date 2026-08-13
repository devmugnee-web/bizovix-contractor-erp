import { CircularProgress, SectionCard } from "@bizovix/ui";
import { formatBDTCompact } from "@bizovix/utils";
import type { TargetVsAchievement } from "@bizovix/types";

export function TargetVsAchievementCard({ data }: { data: TargetVsAchievement }) {
  return (
    <SectionCard
      title="Target vs Achievement (This Month)"
      index={1}
      headerRight={<span className="text-[12px] text-biz-muted">This Month</span>}
      footer={{ label: "View details" }}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-1 flex-col gap-3">
          <div>
            <p className="text-[12px] text-biz-muted">Target</p>
            <p className="text-[17px] font-bold text-biz-text">{formatBDTCompact(data.target)}</p>
          </div>
          <div className="border-t border-biz-border pt-3">
            <p className="text-[12px] text-biz-muted">Achievement</p>
            <p className="text-[17px] font-bold text-biz-text">{formatBDTCompact(data.achievement)}</p>
          </div>
          <div className="border-t border-biz-border pt-3">
            <p className="text-[12px] text-biz-muted">Achievement Rate</p>
            <p className="text-[17px] font-bold text-biz-success">{data.achievementRate}%</p>
          </div>
        </div>
        <CircularProgress
          percentage={Math.min(data.achievementRate, 100)}
          color="#0B5CFF"
          label={`${data.achievementRate}%`}
          sublabel="Achieved"
          size={140}
        />
      </div>
    </SectionCard>
  );
}
