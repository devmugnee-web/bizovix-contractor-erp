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
    <SectionCard title="Recent Transactions" index={5} footer={{ label: "View all", href: "/receipts" }} className="lg:h-full lg:min-h-0" bodyClassName="scrollbar-hidden p-3 lg:overflow-y-auto">
      <ul className="flex flex-col gap-2">
        {items.map((item) => {
          const { icon: Icon, className } = TRANSACTION_ICONS[item.type] ?? DEFAULT_ICON;
          return (
            <li key={item.id} className="flex items-center gap-2.5 border-b border-biz-border pb-2 last:border-0 last:pb-0">
              <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", className)}>
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold leading-tight text-biz-text">{item.title}</p>
                <p className="truncate text-[11px] font-medium leading-tight text-biz-muted">{item.reference}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <span className="text-[12px] font-bold leading-tight text-biz-text">{formatBDT(item.amount)}</span>
                <StatusBadge label={item.status} tone={statusTone(item.status)} />
              </div>
            </li>
          );
        })}
        {items.length === 0 && <p className="text-[13px] text-biz-muted">No recent transactions.</p>}
      </ul>
    </SectionCard>
  );
}
