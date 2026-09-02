import { CalendarCheck2, Sparkles, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

export function HrEmptyState({ icon: Icon, title, description, actionLabel, onAction, compact = false }: { icon: LucideIcon; title: string; description: string; actionLabel?: string; onAction?: () => void; compact?: boolean }) {
  return (
    <div className={`flex w-full flex-col items-center justify-center px-5 text-center ${compact ? "min-h-[150px] py-5" : "min-h-[360px] py-10"}`}>
      <div className={`relative ${compact ? "h-20 w-32" : "h-32 w-52"}`} aria-hidden="true">
        <div className="absolute left-1/2 top-1/2 h-[86%] w-[58%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,#e4edff_0%,#f2f6ff_62%,transparent_73%)]" />
        <div className={`absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 rotate-[-4deg] items-center justify-center rounded-[22px] bg-[linear-gradient(145deg,#5b88ef,#3267df)] text-white shadow-[0_18px_38px_rgba(50,103,223,0.22)] ${compact ? "h-14 w-14" : "h-20 w-20"}`}><Icon className={compact ? "h-6 w-6" : "h-9 w-9"} strokeWidth={1.7} /></div>
        <span className={`absolute right-[13%] top-[13%] flex items-center justify-center rounded-full bg-white text-[#e4a11b] shadow-[0_8px_20px_rgba(48,67,94,0.12)] ${compact ? "h-7 w-7" : "h-9 w-9"}`}><Sparkles className={compact ? "h-3 w-3" : "h-4 w-4"} /></span>
        <span className={`absolute bottom-[8%] left-[14%] flex items-center justify-center rounded-[11px] border border-[#d9e4f8] bg-white text-[#3267df] shadow-[0_8px_20px_rgba(48,67,94,0.1)] ${compact ? "h-7 w-7" : "h-10 w-10"}`}><CalendarCheck2 className={compact ? "h-3.5 w-3.5" : "h-5 w-5"} /></span>
      </div>
      <h3 className={`${compact ? "mt-1 text-[12px]" : "mt-3 text-[16px]"} font-semibold text-[#30435e]`}>{title}</h3>
      <p className={`${compact ? "mt-1 max-w-[280px] text-[10px] leading-4" : "mt-2 max-w-[430px] text-[12px] leading-5"} text-[#8491a5]`}>{description}</p>
      {actionLabel && onAction ? <Button onClick={onAction} className={`${compact ? "mt-3 h-8 text-[10px]" : "mt-5 h-9 text-[12px]"} rounded-[9px] bg-[#2f67e8] px-4 text-white hover:bg-[#2459ce]`}>{actionLabel}</Button> : null}
    </div>
  );
}
