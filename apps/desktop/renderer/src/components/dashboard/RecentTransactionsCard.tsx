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
    <SectionCard title="Recent Transactions" index={5} footer={{ label: "View all" }}>
      <ul className="flex flex-col gap-3">
        {items.map((item) => {
          const { icon: Icon, className } = TRANSACTION_ICONS[item.type] ?? DEFAULT_ICON;
          return (
            <li key={item.id} className="flex items-center gap-3 border-b border-biz-border pb-3 last:border-0 last:pb-0">
              <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md", className)}>
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-biz-text">{item.title}</p>
                <p className="truncate text-[12px] text-biz-muted">{item.reference}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-[13px] font-semibold text-biz-text">{formatBDT(item.amount)}</span>
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
