import Link from "next/link";
import {
  Briefcase,
  Building2,
  CircleDollarSign,
  CreditCard,
  Landmark,
  Lock,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { DashboardKpiCard } from "@bizovix/ui";
import { formatAmount, formatBDTLakh, formatDate } from "@bizovix/utils";
import type { DashboardKpis } from "@bizovix/types";

export function DashboardKpiRow({ kpis }: { kpis: DashboardKpis }) {
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 sm:gap-2 xl:grid-cols-8 2xl:gap-3">
      <Link
        href="/cms/ongoing-works"
        className="min-w-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-biz-blue"
      >
        <DashboardKpiCard
          index={1}
          title="Ongoing Works"
          icon={Briefcase}
          iconClassName="bg-biz-blue-soft text-biz-blue"
          solidClassName="border-transparent bg-[#169f98] hover:border-white/30"
          value={String(kpis.ongoingWorks.count)}
        >
          Value: {formatAmount(kpis.ongoingWorks.contractValue)}
        </DashboardKpiCard>
      </Link>

      <Link
        href="/bank-instruments/tender-security"
        className="min-w-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-biz-blue"
      >
        <DashboardKpiCard
          index={2}
          title="Tender Security"
          icon={ShieldCheck}
          iconClassName="bg-biz-purple-soft text-biz-purple"
          solidClassName="border-transparent bg-[#df4660] hover:border-white/30"
          value={formatBDTLakh(kpis.tenderSecurity.amount)}
        >
          {kpis.tenderSecurity.instruments} instruments
        </DashboardKpiCard>
      </Link>

      <Link
        href="/bank-instruments/pg-bg"
        className="min-w-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-biz-blue"
      >
        <DashboardKpiCard
          index={3}
          title="PG / BG"
          icon={Building2}
          iconClassName="bg-biz-orange-soft text-biz-orange"
          solidClassName="border-transparent bg-[#168aa3] hover:border-white/30"
          value={formatBDTLakh(kpis.pgBg.amount)}
        >
          {kpis.pgBg.instruments} instruments
        </DashboardKpiCard>
      </Link>

      <Link
        href="/reports/tenders/security-deposit"
        className="min-w-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-biz-blue"
      >
        <DashboardKpiCard
          index={4}
          title="Security Deposit"
          icon={Lock}
          iconClassName="bg-biz-teal-soft text-biz-teal"
          solidClassName="border-transparent bg-[#159e72] hover:border-white/30"
          value={
            kpis.securityDeposit.available
              ? formatBDTLakh(kpis.securityDeposit.amount)
              : "Not Available"
          }
        >
          {kpis.securityDeposit.available
            ? `${kpis.securityDeposit.projects} projects`
            : "No authoritative source yet"}
        </DashboardKpiCard>
      </Link>

      <Link
        href="/accounts/receivables"
        className="min-w-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-biz-blue"
      >
        <DashboardKpiCard
          index={5}
          title="Receivables"
          icon={Wallet}
          iconClassName="bg-biz-success-soft text-biz-success"
          solidClassName="border-transparent bg-[#3569d4] hover:border-white/30"
          value={formatBDTLakh(kpis.receivables.amount)}
        >
          {kpis.receivables.bills > 0 ? (
            <span className="min-w-0 leading-[1.25]">
              <span className="block whitespace-nowrap">{kpis.receivables.bills} projects</span>
              <span className="block whitespace-nowrap">
                SD: {formatAmount(kpis.receivables.securityDeposit)}
                {Number(kpis.receivables.overdue) > 0
                  ? ` · Overdue: ${formatAmount(kpis.receivables.overdue)}`
                  : null}
              </span>
            </span>
          ) : (
            "No outstanding project receivables"
          )}
        </DashboardKpiCard>
      </Link>

      <Link
        href="/accounts/payables"
        className="min-w-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-biz-blue"
      >
        <DashboardKpiCard
          index={6}
          title="Payables"
          icon={CreditCard}
          iconClassName="bg-biz-danger-soft text-biz-danger"
          solidClassName="border-transparent bg-[#c96a08] hover:border-white/30"
          value={formatBDTLakh(kpis.payables.amount)}
        >
          <span className="whitespace-nowrap">
            Due Soon: {formatAmount(kpis.payables.dueSoon)}
          </span>
        </DashboardKpiCard>
      </Link>

      <Link
        href="/cash-bank"
        className="min-w-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-biz-blue"
      >
        <DashboardKpiCard
          index={7}
          title="Bank & Cash"
          icon={Landmark}
          iconClassName="bg-biz-blue-soft text-biz-blue"
          solidClassName="border-transparent bg-[#805ad5] hover:border-white/30"
          value={formatBDTLakh(kpis.bankAndCash.amount)}
        >
          Available balance
        </DashboardKpiCard>
      </Link>

      <DashboardKpiCard
        index={8}
        title="Loans & EMI"
        icon={CircleDollarSign}
        iconClassName="bg-biz-purple-soft text-biz-purple"
        solidClassName="border-transparent bg-[#dc4048] hover:border-white/30"
        value={
          kpis.loansAndEmi.configured ? formatBDTLakh(kpis.loansAndEmi.amount) : "Not Configured"
        }
      >
        {kpis.loansAndEmi.configured ? (
          <>
            Next EMI:
            <br />
            {kpis.loansAndEmi.nextEmiDate ? (
              <span className="font-medium text-biz-danger">
                {formatDate(kpis.loansAndEmi.nextEmiDate)}
              </span>
            ) : (
              "-"
            )}
          </>
        ) : (
          "Company loan not configured"
        )}
      </DashboardKpiCard>
    </div>
  );
}
