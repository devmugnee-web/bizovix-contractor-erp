import { Bell, Building2, CalendarClock, CreditCard, FileWarning, ShieldAlert, type LucideIcon } from "lucide-react";
import { SectionCard, cn } from "@bizovix/ui";
import { formatDate } from "@bizovix/utils";
import type { UpcomingReminder } from "@bizovix/types";

const REMINDER_ICONS: Record<string, { icon: LucideIcon; className: string }> = {
  TENDER_SECURITY_EXPIRY: { icon: ShieldAlert, className: "bg-biz-danger-soft text-biz-danger" },
  PG_BG_EXPIRY: { icon: Building2, className: "bg-biz-orange-soft text-biz-orange" },
  CREDIT_COMMITMENT_CHARGE: { icon: CreditCard, className: "bg-biz-purple-soft text-biz-purple" },
  DOCUMENT_EXPIRY: { icon: FileWarning, className: "bg-biz-blue-soft text-biz-blue" },
  TENDER_OPENING: { icon: CalendarClock, className: "bg-biz-success-soft text-biz-success" },
};
const DEFAULT_ICON: { icon: LucideIcon; className: string } = { icon: Bell, className: "bg-gray-100 text-biz-muted" };

export function UpcomingRemindersCard({ items }: { items: UpcomingReminder[] }) {
  return (
    <SectionCard title="Upcoming Reminders" index={4} footer={{ label: "View all", href: "/reminders" }} className="h-full min-h-0" bodyClassName="scrollbar-hidden overflow-y-auto p-1 sm:p-1.5">
      <ul className="flex h-full min-h-0 flex-col gap-1">
        {items.map((item) => {
          const { icon: Icon, className } = REMINDER_ICONS[item.type] ?? DEFAULT_ICON;
          return (
            <li key={item.id} className="flex min-h-0 flex-1 items-start gap-1 rounded-md border border-slate-100 bg-slate-50/60 p-1">
              <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md ring-1 ring-inset ring-black/[0.03]", className)}>
                <Icon className="h-2.5 w-2.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[6px] font-semibold leading-tight text-biz-text sm:text-[8px] lg:text-[9px]">{item.title}</p>
                <p className="truncate text-[5px] font-medium leading-tight text-biz-muted sm:text-[7px]">{item.subtitle}</p>
              </div>
              <span className="shrink-0 rounded-full bg-red-50 px-1 py-0.5 text-[5px] font-semibold text-biz-danger sm:text-[7px]">{formatDate(item.dueDate)}</span>
            </li>
          );
        })}
        {items.length === 0 && <p className="rounded-md border border-dashed border-slate-200 bg-slate-50/70 px-1 py-3 text-center text-[7px] text-biz-muted sm:text-[9px]">No upcoming reminders.</p>}
      </ul>
    </SectionCard>
  );
}
