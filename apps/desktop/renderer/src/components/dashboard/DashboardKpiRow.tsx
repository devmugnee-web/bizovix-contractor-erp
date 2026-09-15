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
import { formatBDTLakh, formatDate } from "@bizovix/utils";
import type { DashboardKpis } from "@bizovix/types";

export function DashboardKpiRow({ kpis }: { kpis: DashboardKpis }) {
  return (
    <div className="grid grid-cols-8 gap-1.5 sm:gap-2 2xl:gap-3">
      <Link
        href="/cms/ongoing-works"
        className="min-w-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-biz-blue"
      >
        <DashboardKpiCard
          index={1}
          title="Ongoing Works"
          icon={Briefcase}
          iconClassName="bg-biz-blue-soft text-biz-blue"
          value={String(kpis.ongoingWorks.count)}
        >
          Contract Value
          <br />
          {formatBDTLakh(kpis.ongoingWorks.contractValue)}
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
          value={formatBDTLakh(kpis.tenderSecurity.amount)}
        >
          Instruments: {kpis.tenderSecurity.instruments}
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
          value={formatBDTLakh(kpis.pgBg.amount)}
        >
          Instruments: {kpis.pgBg.instruments}
        </DashboardKpiCard>
      </Link>

      <Link
        href="/reports/tenders/security-deposit"
        className="min-w-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-biz-blue"
      >
        <DashboardKpiCard
          index={4}
          title="Security Deposit (SD)"
          icon={Lock}
          iconClassName="bg-biz-teal-soft text-biz-teal"
          value={
            kpis.securityDeposit.available
              ? formatBDTLakh(kpis.securityDeposit.amount)
              : "Not Available"
          }
        >
          {kpis.securityDeposit.available
            ? `Projects: ${kpis.securityDeposit.projects}`
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
          value={formatBDTLakh(kpis.receivables.amount)}
        >
          {kpis.receivables.bills > 0 ? (
            <>
              Outstanding Projects: {kpis.receivables.bills}
              <br />
              SD: {formatBDTLakh(kpis.receivables.securityDeposit)} · Overdue:{" "}
              <span className="font-medium text-biz-danger">
                {formatBDTLakh(kpis.receivables.overdue)}
              </span>
            </>
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
          value={formatBDTLakh(kpis.payables.amount)}
        >
          Due Soon:{" "}
          <span className="font-medium text-biz-orange">
            {formatBDTLakh(kpis.payables.dueSoon)}
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
          value={formatBDTLakh(kpis.bankAndCash.amount)}
        >
          Total Balance
        </DashboardKpiCard>
      </Link>

      <DashboardKpiCard
        index={8}
        title="Loans & EMI"
        icon={CircleDollarSign}
        iconClassName="bg-biz-purple-soft text-biz-purple"
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
              "—"
            )}
          </>
        ) : (
          "No Loan/EMI module yet"
        )}
      </DashboardKpiCard>
    </div>
  );
}
