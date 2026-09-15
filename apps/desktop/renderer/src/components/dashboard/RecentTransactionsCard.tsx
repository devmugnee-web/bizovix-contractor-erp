import Link from "next/link";
import {
  ArrowRightLeft,
  Banknote,
  Building2,
  CreditCard,
  Receipt,
  ShieldCheck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { SectionCard, StatusBadge, type StatusBadgeTone, cn } from "@bizovix/ui";
import { formatBDT } from "@bizovix/utils";
import type { RecentTransaction } from "@bizovix/types";

const TRANSACTION_ICONS: Record<string, { icon: LucideIcon; className: string }> = {
  TENDER_SECURITY: { icon: ShieldCheck, className: "bg-biz-blue-soft text-biz-blue" },
  EXPENSE: { icon: Wallet, className: "bg-biz-danger-soft text-biz-danger" },
  RECEIPT: { icon: Receipt, className: "bg-biz-success-soft text-biz-success" },
  PG_BG: { icon: Building2, className: "bg-biz-purple-soft text-biz-purple" },
  CREDIT_COMMITMENT: { icon: CreditCard, className: "bg-biz-orange-soft text-biz-orange" },
  MAIN_CASH: { icon: Banknote, className: "bg-biz-success-soft text-biz-success" },
  PETTY_CASH: { icon: Wallet, className: "bg-biz-orange-soft text-biz-orange" },
  BANK_TRANSFER: { icon: ArrowRightLeft, className: "bg-biz-blue-soft text-biz-blue" },
  SUPPLIER_PAYMENT: { icon: CreditCard, className: "bg-biz-danger-soft text-biz-danger" },
  GENERAL_EXPENSE: { icon: Wallet, className: "bg-biz-danger-soft text-biz-danger" },
};
const DEFAULT_ICON: { icon: LucideIcon; className: string } = {
  icon: Receipt,
  className: "bg-gray-100 text-biz-muted",
};
const TRANSACTION_ROUTES: Record<string, string> = {
  TENDER_SECURITY: "/bank-instruments/tender-security",
  EXPENSE: "/expenses",
  RECEIPT: "/receipts",
  PG_BG: "/bank-instruments/pg-bg",
  CREDIT_COMMITMENT: "/bank-instruments/credit-commitment",
  MAIN_CASH: "/cash-bank/main-cash",
  PETTY_CASH: "/cash-bank/petty-cash",
  BANK_TRANSFER: "/cash-bank/transfers",
  SUPPLIER_PAYMENT: "/accounts/payables",
  GENERAL_EXPENSE: "/expenses/general-expense",
};

function statusTone(status: string): StatusBadgeTone {
  const s = status.toLowerCase();
  if (["issued", "approved", "received", "posted"].includes(s)) return "success";
  if (s === "charged") return "warning";
  if (s === "rejected") return "danger";
  return "neutral";
}

export function RecentTransactionsCard({ items }: { items: RecentTransaction[] }) {
  return (
    <SectionCard
      title="Recent Transactions"
      index={5}
      footer={{ label: "View all", href: "/accounts/general-ledger" }}
      className="h-[240px] min-h-0 xl:h-full"
      bodyClassName="scrollbar-hidden overflow-y-auto p-1 sm:p-1.5 2xl:p-2"
    >
      <ul className="flex h-full min-h-0 flex-col gap-1 2xl:gap-1.5">
        {items.map((item) => {
          const { icon: Icon, className } = TRANSACTION_ICONS[item.type] ?? DEFAULT_ICON;
          const href = TRANSACTION_ROUTES[item.type] ?? "/accounts/general-ledger";
          return (
            <li key={`${item.type}-${item.id}`} className="h-8 shrink-0 2xl:h-11">
              <Link
                href={href}
                aria-label={`Open ${item.title} ${item.reference}`}
                className="flex h-full min-h-0 items-center gap-1.5 rounded-md border border-slate-100 bg-slate-50/60 p-1 transition-colors hover:border-biz-blue/20 hover:bg-biz-blue-soft/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-biz-blue 2xl:gap-2 2xl:p-2"
              >
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-md ring-1 ring-inset ring-black/[0.03] 2xl:h-8 2xl:w-8",
                    className,
                  )}
                >
                  <Icon className="h-3 w-3 2xl:h-4 2xl:w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    title={item.title}
                    className="truncate text-[9px] font-semibold leading-tight text-biz-text lg:text-[10px] 2xl:text-[12px]"
                  >
                    {item.title}
                  </p>
                  <p
                    title={item.reference}
                    className="truncate text-[8px] font-medium leading-tight text-slate-600 2xl:text-[10px]"
                  >
                    {item.reference}
                  </p>
                </div>
                <div className="flex min-w-[4.75rem] shrink-0 flex-col items-end gap-1 2xl:min-w-[6rem]">
                  <span className="whitespace-nowrap text-[8px] font-bold leading-tight text-biz-text 2xl:text-[10px]">
                    {formatBDT(item.amount)}
                  </span>
                  <StatusBadge label={item.status} tone={statusTone(item.status)} />
                </div>
              </Link>
            </li>
          );
        })}
        {items.length === 0 && (
          <p className="rounded-md border border-dashed border-slate-200 bg-slate-50/70 px-1 py-3 text-center text-[9px] text-biz-muted 2xl:text-[11px]">
            No recent transactions.
          </p>
        )}
      </ul>
    </SectionCard>
  );
}
