import {
  Bell,
  Building2,
  CalendarClock,
  CreditCard,
  FileWarning,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { SectionCard, cn } from "@bizovix/ui";
import { formatDate } from "@bizovix/utils";
import type { UpcomingReminder } from "@bizovix/types";

const REMINDER_ICONS: Record<string, { icon: LucideIcon; className: string }> = {
  "Tender Security": { icon: ShieldAlert, className: "bg-biz-danger-soft text-biz-danger" },
  "PG/BG": { icon: Building2, className: "bg-biz-orange-soft text-biz-orange" },
  "Bill Maturity": { icon: CreditCard, className: "bg-biz-purple-soft text-biz-purple" },
  "Cheque Maturity": { icon: CreditCard, className: "bg-biz-purple-soft text-biz-purple" },
  "Document Expiry": { icon: FileWarning, className: "bg-biz-blue-soft text-biz-blue" },
  "Tender Submission Due": {
    icon: CalendarClock,
    className: "bg-biz-success-soft text-biz-success",
  },
  "Tender Opening Due": { icon: CalendarClock, className: "bg-biz-success-soft text-biz-success" },
  "Work Order / Contract Expiry": {
    icon: Building2,
    className: "bg-biz-orange-soft text-biz-orange",
  },
  TENDER_SECURITY_EXPIRY: { icon: ShieldAlert, className: "bg-biz-danger-soft text-biz-danger" },
  PG_BG_EXPIRY: { icon: Building2, className: "bg-biz-orange-soft text-biz-orange" },
  CREDIT_COMMITMENT_CHARGE: { icon: CreditCard, className: "bg-biz-purple-soft text-biz-purple" },
  DOCUMENT_EXPIRY: { icon: FileWarning, className: "bg-biz-blue-soft text-biz-blue" },
  TENDER_OPENING: { icon: CalendarClock, className: "bg-biz-success-soft text-biz-success" },
};
const DEFAULT_ICON: { icon: LucideIcon; className: string } = {
  icon: Bell,
  className: "bg-biz-blue-soft text-biz-blue",
};

const REMINDER_LABELS: Record<string, string> = {
  "Tender Submission Due": "Tender Submission",
  "Tender Opening Due": "Tender Opening",
  "Work Order / Contract Expiry": "Contract Completion",
};

function reminderSubject(title: string) {
  const separator = title.indexOf(":");
  return separator >= 0 ? title.slice(separator + 1).trim() || title : title;
}

function reminderDate(value: string) {
  const [day, month, year] = formatDate(value).split(" ");
  return { dayMonth: [day, month].filter(Boolean).join(" "), year: year ?? "" };
}

export function UpcomingRemindersCard({ items }: { items: UpcomingReminder[] }) {
  return (
    <SectionCard
      title="Upcoming Reminders"
      index={4}
      headerRight={
        items.length > 0 ? (
          <span className="whitespace-nowrap rounded-full bg-biz-blue-soft px-2 py-0.5 text-[9px] font-semibold text-biz-blue 2xl:px-2.5 2xl:text-[10px]">
            {items.length} upcoming
          </span>
        ) : null
      }
      footer={{ label: "View all", href: "/reminders" }}
      className="h-full min-h-0"
      bodyClassName="scrollbar-hidden overflow-y-auto bg-slate-50/40 p-1 sm:p-1.5 2xl:p-2"
    >
      <ul className="flex min-h-0 flex-col gap-1 2xl:gap-1.5">
        {items.map((item) => {
          const { icon: Icon, className } = REMINDER_ICONS[item.type] ?? DEFAULT_ICON;
          const subject = reminderSubject(item.title);
          const dueDate = reminderDate(item.dueDate);
          return (
            <li
              key={item.id}
              className="group grid min-h-9 shrink-0 grid-cols-[1.5rem_minmax(0,1fr)_3.5rem] items-center gap-1.5 overflow-hidden rounded-md border border-slate-200/80 bg-white px-1.5 py-1 shadow-[0_1px_2px_rgba(15,23,42,0.035)] transition-colors hover:border-blue-200 hover:bg-blue-50/30 2xl:min-h-12 2xl:grid-cols-[2rem_minmax(0,1fr)_4.25rem] 2xl:gap-2 2xl:px-2 2xl:py-1.5"
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-md ring-1 ring-inset ring-black/[0.03] 2xl:h-8 2xl:w-8",
                  className,
                )}
              >
                <Icon className="h-3 w-3 2xl:h-4 2xl:w-4" />
              </span>
              <div className="min-w-0 overflow-hidden">
                <p className="truncate text-[8px] font-bold uppercase leading-none tracking-[0.04em] text-biz-blue 2xl:text-[9px]">
                  {REMINDER_LABELS[item.type] ?? item.type}
                </p>
                <p
                  title={item.title}
                  className="mt-0.5 truncate text-[10px] font-semibold leading-tight text-biz-text 2xl:text-[12px]"
                >
                  {subject}
                </p>
              </div>
              <span
                title={`Due ${formatDate(item.dueDate)}`}
                className="flex w-14 shrink-0 flex-col items-center rounded-md bg-red-50 px-1 py-0.5 text-center text-biz-danger ring-1 ring-inset ring-red-100 2xl:w-[68px] 2xl:py-1"
              >
                <span className="whitespace-nowrap text-[9px] font-bold leading-tight 2xl:text-[10px]">
                  {dueDate.dayMonth}
                </span>
                {dueDate.year && (
                  <span className="text-[7px] font-medium leading-none text-biz-danger/80 2xl:text-[8px]">
                    {dueDate.year}
                  </span>
                )}
              </span>
            </li>
          );
        })}
        {items.length === 0 && (
          <li className="flex min-h-24 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white px-3 py-4 text-center">
            <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-biz-blue-soft text-biz-blue">
              <Bell className="h-4 w-4" />
            </span>
            <p className="text-[10px] font-semibold text-biz-text 2xl:text-[12px]">
              No upcoming reminders
            </p>
            <p className="mt-0.5 text-[9px] text-biz-muted 2xl:text-[10px]">
              You are all caught up.
            </p>
          </li>
        )}
      </ul>
    </SectionCard>
  );
}
