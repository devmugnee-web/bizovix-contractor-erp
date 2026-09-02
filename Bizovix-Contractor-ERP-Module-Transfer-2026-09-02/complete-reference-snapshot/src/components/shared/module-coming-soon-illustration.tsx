import { Sparkles, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const TONES = {
  teal: {
    wash: "from-teal-50 via-cyan-50 to-white",
    ring: "border-teal-200/80",
    icon: "from-teal-500 to-cyan-500 shadow-[0_14px_30px_rgba(13,148,136,0.22)]",
    accent: "bg-teal-50 text-teal-600 ring-teal-100",
    dot: "bg-teal-400",
  },
  indigo: {
    wash: "from-indigo-50 via-blue-50 to-white",
    ring: "border-indigo-200/80",
    icon: "from-indigo-500 to-blue-500 shadow-[0_14px_30px_rgba(79,70,229,0.22)]",
    accent: "bg-indigo-50 text-indigo-600 ring-indigo-100",
    dot: "bg-indigo-400",
  },
  orange: {
    wash: "from-orange-50 via-amber-50 to-white",
    ring: "border-orange-200/80",
    icon: "from-orange-500 to-amber-500 shadow-[0_14px_30px_rgba(234,88,12,0.20)]",
    accent: "bg-orange-50 text-orange-600 ring-orange-100",
    dot: "bg-orange-400",
  },
} as const;

export function ModuleComingSoonIllustration({
  icon: Icon,
  detailIcons,
  tone,
}: {
  icon: LucideIcon;
  detailIcons: readonly [LucideIcon, LucideIcon, LucideIcon];
  tone: keyof typeof TONES;
}) {
  const palette = TONES[tone];
  const [FirstDetailIcon, SecondDetailIcon, ThirdDetailIcon] = detailIcons;

  return (
    <div className="relative mx-auto flex h-40 w-64 items-center justify-center" aria-hidden="true">
      <div className={cn("absolute h-36 w-36 rounded-full bg-gradient-to-br opacity-90", palette.wash)} />
      <div className={cn("absolute h-28 w-28 rounded-full border border-dashed", palette.ring)} />
      <span className={cn("absolute left-6 top-8 h-2 w-2 rounded-full", palette.dot)} />
      <span className={cn("absolute bottom-8 right-7 h-1.5 w-1.5 rounded-full opacity-70", palette.dot)} />

      <div className={cn("relative flex h-[76px] w-[76px] items-center justify-center rounded-[24px] bg-gradient-to-br", palette.icon)}>
        <Icon className="h-9 w-9 text-white" strokeWidth={1.8} />
        <span className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white text-primary shadow-[0_5px_14px_rgba(15,23,42,0.12)]">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
      </div>

      <span className={cn("absolute left-7 top-[76px] flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-[0_8px_20px_rgba(15,23,42,0.08)] ring-1", palette.accent)}>
        <FirstDetailIcon className="h-4 w-4" />
      </span>
      <span className={cn("absolute right-8 top-6 flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-[0_8px_20px_rgba(15,23,42,0.08)] ring-1", palette.accent)}>
        <SecondDetailIcon className="h-4 w-4" />
      </span>
      <span className={cn("absolute bottom-3 right-12 flex h-8 w-8 items-center justify-center rounded-xl bg-white shadow-[0_8px_20px_rgba(15,23,42,0.08)] ring-1", palette.accent)}>
        <ThirdDetailIcon className="h-3.5 w-3.5" />
      </span>
    </div>
  );
}
