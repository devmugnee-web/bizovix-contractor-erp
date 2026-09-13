import type { ReactNode } from "react";
import { CircularProgress, SectionCard, cn } from "@bizovix/ui";
import { formatBDT, formatBDTCompact } from "@bizovix/utils";
import type { TargetVsAchievement } from "@bizovix/types";

function compactCardAmount(amount: number | string) {
  return formatBDTCompact(amount).replace(/^BDT\s+/, "");
}

export function TargetVsAchievementCard({
  data,
  periodControl,
  customDateRange,
  onSetTarget,
}: {
  data: TargetVsAchievement;
  periodControl: ReactNode;
  customDateRange?: ReactNode;
  onSetTarget?: () => void;
}) {
  const targetAmount = Number(data.target);
  const achievementAmount = Number(data.achievement);
  const hasTarget = targetAmount > 0;
  const remainingAmount = hasTarget ? Math.max(targetAmount - achievementAmount, 0) : 0;
  return (
    <SectionCard
      title="Target vs Achievement"
      index={1}
      headerRight={periodControl}
      bodyClassName="p-1.5 sm:p-2 2xl:p-3"
    >
      <div className="flex h-full min-h-0 flex-col gap-1 2xl:gap-2">
        {customDateRange}
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_82px] items-center gap-1.5 sm:grid-cols-[minmax(0,1fr)_88px] sm:gap-2 2xl:grid-cols-[minmax(0,1fr)_108px] 2xl:gap-3">
          <div className="grid min-w-0 grid-cols-2 gap-1.5 2xl:gap-2">
            <div className="flex min-h-[52px] min-w-0 flex-col justify-center rounded-lg bg-slate-50 px-2 py-1.5 ring-1 ring-inset ring-slate-100 2xl:min-h-[64px] 2xl:px-3 2xl:py-2">
              <p className="whitespace-nowrap text-[8px] font-bold uppercase tracking-[0.04em] text-slate-500 lg:text-[9px] 2xl:text-[10px]">
                Target
              </p>
              <p className="mt-0.5 whitespace-nowrap text-[11px] font-bold leading-tight text-biz-text lg:text-[13px] 2xl:text-[15px]">
                {hasTarget ? compactCardAmount(data.target) : "Not Set"}
              </p>
            </div>
            <div className="flex min-h-[52px] min-w-0 flex-col justify-center rounded-lg bg-blue-50/70 px-2 py-1.5 ring-1 ring-inset ring-blue-100 2xl:min-h-[64px] 2xl:px-3 2xl:py-2">
              <p className="whitespace-nowrap text-[8px] font-bold uppercase tracking-[0.04em] text-slate-500 lg:text-[9px] 2xl:text-[10px]">
                Achievement
              </p>
              <p className="mt-0.5 whitespace-nowrap text-[11px] font-bold leading-tight text-biz-text lg:text-[13px] 2xl:text-[15px]">
                {compactCardAmount(data.achievement)}
              </p>
            </div>
            <div className="flex min-h-[52px] min-w-0 flex-col justify-center rounded-lg bg-emerald-50/70 px-2 py-1.5 ring-1 ring-inset ring-emerald-100 2xl:min-h-[64px] 2xl:px-3 2xl:py-2">
              <p className="whitespace-nowrap text-[8px] font-bold uppercase tracking-[0.04em] text-slate-500 lg:text-[9px] 2xl:text-[10px]">
                Rate
              </p>
              <p className="mt-0.5 whitespace-nowrap text-[11px] font-bold leading-tight text-biz-success lg:text-[13px] 2xl:text-[15px]">
                {hasTarget ? `${data.achievementRate}%` : "Not Set"}
              </p>
            </div>
            <div className="flex min-h-[52px] min-w-0 flex-col justify-center rounded-lg bg-amber-50/70 px-2 py-1.5 ring-1 ring-inset ring-amber-100 2xl:min-h-[64px] 2xl:px-3 2xl:py-2">
              <p
                title="Remaining to Target"
                className="whitespace-nowrap text-[8px] font-bold uppercase tracking-[0.04em] text-slate-500 lg:text-[9px] 2xl:text-[10px]"
              >
                Remaining
              </p>
              <p
                title={hasTarget ? formatBDT(remainingAmount) : undefined}
                className={cn(
                  "mt-0.5 whitespace-nowrap text-[11px] font-bold leading-tight lg:text-[13px] 2xl:text-[15px]",
                  hasTarget && remainingAmount === 0 ? "text-biz-success" : "text-biz-orange",
                )}
              >
                {hasTarget ? compactCardAmount(remainingAmount) : "Not Set"}
              </p>
            </div>
          </div>
          <div className="flex w-full flex-col items-center justify-center gap-1.5 2xl:gap-2">
            <div className="h-[82px] w-[82px] 2xl:h-[98px] 2xl:w-[98px]">
              <div className="origin-top-left 2xl:scale-[1.195]">
                <CircularProgress
                  percentage={hasTarget ? Math.min(data.achievementRate, 100) : 0}
                  color="#0B5CFF"
                  label={hasTarget ? `${data.achievementRate}%` : "—"}
                  sublabel={hasTarget ? "Achieved" : "Not Set"}
                  size={82}
                />
              </div>
            </div>
            {onSetTarget && (
              <button
                type="button"
                onClick={onSetTarget}
                className="h-7 w-full rounded-md bg-biz-blue px-1.5 text-[9px] font-semibold text-white shadow-sm transition hover:bg-biz-blue-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-biz-blue focus-visible:ring-offset-1 2xl:h-8 2xl:text-[11px]"
              >
                Set Target
              </button>
            )}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
