import { cn } from "../lib/cn";

export type StatusBadgeTone = "success" | "warning" | "danger" | "info" | "purple" | "neutral";

const TONE_CLASSES: Record<StatusBadgeTone, string> = {
  success: "bg-biz-success-soft text-biz-success",
  warning: "bg-biz-warning-soft text-biz-warning",
  danger: "bg-biz-danger-soft text-biz-danger",
  info: "bg-biz-blue-soft text-biz-blue",
  purple: "bg-biz-purple-soft text-biz-purple",
  neutral: "bg-gray-100 text-biz-muted",
};

export interface StatusBadgeProps {
  label: string;
  tone?: StatusBadgeTone;
  className?: string;
}

export function StatusBadge({ label, tone = "neutral", className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}
