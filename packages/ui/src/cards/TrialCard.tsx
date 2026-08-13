import { ChevronRight, Crown } from "lucide-react";

export interface TrialCardProps {
  daysLeft: number;
  totalDays?: number;
  onUpgradeClick?: () => void;
}

export function TrialCard({ daysLeft, totalDays = 30, onUpgradeClick }: TrialCardProps) {
  const percentage = Math.max(0, Math.min(100, (daysLeft / totalDays) * 100));

  return (
    <div className="rounded-md bg-white/10 p-3">
      <p className="text-[12px] text-white/90">{daysLeft} days left in your free trial</p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/15">
        <div className="h-full rounded-full bg-biz-orange" style={{ width: `${percentage}%` }} />
      </div>
      <button
        type="button"
        onClick={onUpgradeClick}
        className="mt-3 flex w-full items-center justify-between text-[12px] font-medium text-biz-orange"
      >
        <span className="flex items-center gap-1.5">
          <Crown className="h-3.5 w-3.5" />
          Upgrade to Premium
        </span>
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
