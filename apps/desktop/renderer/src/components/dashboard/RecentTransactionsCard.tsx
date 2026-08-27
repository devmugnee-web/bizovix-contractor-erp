import { Building2, CreditCard, Receipt, ShieldCheck, Wallet, type LucideIcon } from "lucide-react";
import { SectionCard, StatusBadge, type StatusBadgeTone, cn } from "@bizovix/ui";
import { formatBDT } from "@bizovix/utils";
import type { RecentTransaction } from "@bizovix/types";

const TRANSACTION_ICONS: Record<string, { icon: LucideIcon; className: string }> = {
  TENDER_SECURITY: { icon: ShieldCheck, className: "bg-biz-blue-soft text-biz-blue" },
  EXPENSE: { icon: Wallet, className: "bg-biz-danger-soft text-biz-danger" },
  RECEIPT: { icon: Receipt, className: "bg-biz-success-soft text-biz-success" },
  PG_BG: { icon: Building2, className: "bg-biz-purple-soft text-biz-purple" },
  CREDIT_COMMITMENT: { icon: CreditCard, className: "bg-biz-orange-soft text-biz-orange" },
};
const DEFAULT_ICON: { icon: LucideIcon; className: string } = { icon: Receipt, className: "bg-gray-100 text-biz-muted" };

function statusTone(status: string): StatusBadgeTone {
  const s = status.toLowerCase();
  if (["issued", "approved", "received"].includes(s)) return "success";
  if (s === "charged") return "warning";
  if (s === "rejected") return "danger";
  return "neutral";
}

export function RecentTransactionsCard({ items }: { items: RecentTransaction[] }) {
  return (
    <SectionCard title="Recent Transactions" index={5} footer={{ label: "View all", href: "/receipts" }} className="h-full min-h-0" bodyClassName="scrollbar-hidden overflow-y-auto p-1 sm:p-1.5">
      <ul className="flex h-full min-h-0 flex-col gap-1">
        {items.map((item) => {
          const { icon: Icon, className } = TRANSACTION_ICONS[item.type] ?? DEFAULT_ICON;
          return (
            <li key={item.id} className="flex min-h-0 flex-1 items-center gap-1 rounded-md border border-slate-100 bg-slate-50/60 p-1">
              <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md ring-1 ring-inset ring-black/[0.03]", className)}>
                <Icon className="h-2.5 w-2.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[6px] font-semibold leading-tight text-biz-text sm:text-[8px] lg:text-[9px]">{item.title}</p>
                <p className="truncate text-[5px] font-medium leading-tight text-biz-muted sm:text-[7px]">{item.reference}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <span className="text-[5px] font-bold leading-tight text-biz-text sm:text-[7px]">{formatBDT(item.amount)}</span>
                <StatusBadge label={item.status} tone={statusTone(item.status)} />
              </div>
            </li>
          );
        })}
        {items.length === 0 && <p className="rounded-md border border-dashed border-slate-200 bg-slate-50/70 px-1 py-3 text-center text-[7px] text-biz-muted sm:text-[9px]">No recent transactions.</p>}
      </ul>
    </SectionCard>
  );
}
