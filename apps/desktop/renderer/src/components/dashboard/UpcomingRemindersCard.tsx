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
    <SectionCard title="Upcoming Reminders" index={4} footer={{ label: "View all", href: "/reminders" }} className="lg:h-full lg:min-h-0" bodyClassName="scrollbar-hidden p-3 lg:overflow-y-auto">
      <ul className="flex flex-col gap-2">
        {items.map((item) => {
          const { icon: Icon, className } = REMINDER_ICONS[item.type] ?? DEFAULT_ICON;
          return (
            <li key={item.id} className="flex items-start gap-2.5 border-b border-biz-border pb-2 last:border-0 last:pb-0">
              <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", className)}>
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold leading-tight text-biz-text">{item.title}</p>
                <p className="truncate text-[11px] font-medium leading-tight text-biz-muted">{item.subtitle}</p>
              </div>
              <span className="shrink-0 text-[11px] font-semibold text-biz-danger">{formatDate(item.dueDate)}</span>
            </li>
          );
        })}
        {items.length === 0 && <p className="text-[13px] text-biz-muted">No upcoming reminders.</p>}
      </ul>
    </SectionCard>
  );
}
