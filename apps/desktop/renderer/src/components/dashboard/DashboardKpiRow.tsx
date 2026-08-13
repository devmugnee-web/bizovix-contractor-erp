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
import { formatBDTCompact, formatDate } from "@bizovix/utils";
import type { DashboardKpis } from "@bizovix/types";

export function DashboardKpiRow({ kpis }: { kpis: DashboardKpis }) {
  return (
    <div className="grid grid-cols-8 gap-1.5 sm:gap-2 lg:gap-3">
      <DashboardKpiCard
        index={1}
        title="Ongoing Works"
        icon={Briefcase}
        iconClassName="bg-biz-blue-soft text-biz-blue"
        value={String(kpis.ongoingWorks.count)}
      >
        Contract Value
        <br />
        {formatBDTCompact(kpis.ongoingWorks.contractValue)}
      </DashboardKpiCard>

      <DashboardKpiCard
        index={2}
        title="Tender Security"
        icon={ShieldCheck}
        iconClassName="bg-biz-purple-soft text-biz-purple"
        value={formatBDTCompact(kpis.tenderSecurity.amount)}
      >
        Instruments: {kpis.tenderSecurity.instruments}
      </DashboardKpiCard>

      <DashboardKpiCard
        index={3}
        title="PG / BG"
        icon={Building2}
        iconClassName="bg-biz-orange-soft text-biz-orange"
        value={formatBDTCompact(kpis.pgBg.amount)}
      >
        Instruments: {kpis.pgBg.instruments}
      </DashboardKpiCard>

      <DashboardKpiCard
        index={4}
        title="Security Deposit (SD)"
        icon={Lock}
        iconClassName="bg-biz-teal-soft text-biz-teal"
        value={formatBDTCompact(kpis.securityDeposit.amount)}
      >
        Projects: {kpis.securityDeposit.projects}
      </DashboardKpiCard>

      <DashboardKpiCard
        index={5}
        title="Receivables"
        icon={Wallet}
        iconClassName="bg-biz-success-soft text-biz-success"
        value={formatBDTCompact(kpis.receivables.amount)}
      >
        Overdue: <span className="font-medium text-biz-danger">{formatBDTCompact(kpis.receivables.overdue)}</span>
      </DashboardKpiCard>

      <DashboardKpiCard
        index={6}
        title="Payables"
        icon={CreditCard}
        iconClassName="bg-biz-danger-soft text-biz-danger"
        value={formatBDTCompact(kpis.payables.amount)}
      >
        Due Soon: <span className="font-medium text-biz-orange">{formatBDTCompact(kpis.payables.dueSoon)}</span>
      </DashboardKpiCard>

      <DashboardKpiCard
        index={7}
        title="Bank & Cash"
        icon={Landmark}
        iconClassName="bg-biz-blue-soft text-biz-blue"
        value={formatBDTCompact(kpis.bankAndCash.amount)}
      >
        Total Balance
      </DashboardKpiCard>

      <DashboardKpiCard
        index={8}
        title="Loans & EMI"
        icon={CircleDollarSign}
        iconClassName="bg-biz-purple-soft text-biz-purple"
        value={formatBDTCompact(kpis.loansAndEmi.amount)}
      >
        Next EMI:
        <br />
        {kpis.loansAndEmi.nextEmiDate ? (
          <span className="font-medium text-biz-danger">{formatDate(kpis.loansAndEmi.nextEmiDate)}</span>
        ) : (
          "—"
        )}
      </DashboardKpiCard>
    </div>
  );
}
