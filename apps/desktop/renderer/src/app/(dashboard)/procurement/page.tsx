"use client";

import Link from "next/link";
import { ArrowRight, ClipboardList, FileSearch, PackageCheck, ScrollText, ShoppingCart, Truck } from "lucide-react";
import {
  useComparativeStatementStats,
  useGoodsReceiptStats,
  useGoodsReceipts,
  usePurchaseOrderStats,
  usePurchaseRequisitionStats,
  useRfqStats,
} from "@bizovix/api-client";
import { ModuleStatCard, PageHeader } from "@bizovix/ui";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

function count(value: number | undefined): string {
  return value === undefined ? "—" : String(value);
}

export default function ProcurementHubPage() {
  useSetBreadcrumb([{ label: "Procurement" }]);

  const prStats = usePurchaseRequisitionStats();
  const rfqStats = useRfqStats();
  const csStats = useComparativeStatementStats();
  const poStats = usePurchaseOrderStats();
  const grnStats = useGoodsReceiptStats();
  // No aggregate endpoint exposes a PENDING-inspection count, so it is derived from the real
  // paginated GRN API rather than invented. The single-step receipt flow resolves inspection on
  // creation, so this stays 0 until a two-step inspection flow lands.
  const grnPending = useGoodsReceipts({ inspectionStatus: "PENDING", limit: 1 });

  const cards = [
    {
      href: "/procurement/requisitions",
      icon: ClipboardList,
      title: "Purchase Requisitions",
      description: "Raise, submit and approve internal material or service requests before they reach the market.",
      count: prStats.data?.total,
    },
    {
      href: "/procurement/rfqs",
      icon: FileSearch,
      title: "RFQs",
      description: "Invite approved suppliers to quote against an approved requisition, and record their offers.",
      count: rfqStats.data?.total,
    },
    {
      href: "/procurement/comparative-statements",
      icon: ScrollText,
      title: "Comparative Statements",
      description: "Compare supplier offers side by side, then select and approve a supplier on the record.",
      count: csStats.data?.total,
    },
    {
      href: "/procurement/purchase-orders",
      icon: ShoppingCart,
      title: "Purchase Orders",
      description: "Raise, approve and issue purchase orders against an approved supplier selection.",
      count: poStats.data?.total,
    },
    {
      href: "/procurement/grns",
      icon: Truck,
      title: "Goods Receipts",
      description: "Record full or partial deliveries against an issued purchase order, with inspection outcomes.",
      count: grnStats.data?.total,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Procurement"
        subtitle="Requisition to receipt — PR, RFQ, quotations, comparative statement, purchase order and goods receipt."
      />

      <div className="flex flex-wrap gap-4">
        <ModuleStatCard
          icon={ClipboardList}
          iconClassName="bg-biz-warning-soft text-biz-warning"
          label="Pending PR Approval"
          value={count(prStats.data?.pendingApproval)}
          helper={`${count(prStats.data?.draft)} still in draft`}
        />
        <ModuleStatCard
          icon={FileSearch}
          iconClassName="bg-biz-blue-soft text-biz-blue"
          label="Open RFQs"
          value={count(rfqStats.data?.open)}
          helper={`${count(rfqStats.data?.awarded)} awarded`}
        />
        <ModuleStatCard
          icon={ShoppingCart}
          iconClassName="bg-biz-purple-soft text-biz-purple"
          label="POs Awaiting Delivery"
          value={count(poStats.data?.awaitingDelivery)}
          helper={`${count(poStats.data?.received)} fully received`}
        />
        <ModuleStatCard
          icon={PackageCheck}
          iconClassName="bg-biz-success-soft text-biz-success"
          label="GRNs Pending Inspection"
          value={count(grnPending.data?.meta.total)}
          helper={`${count(grnStats.data?.partial)} partial · ${count(grnStats.data?.rejected)} rejected`}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group flex min-h-32 flex-col rounded-lg border border-biz-border bg-white p-4 shadow-card transition hover:border-blue-300 hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-50 text-biz-blue">
                <card.icon className="h-4 w-4" />
              </span>
              <div className="flex items-center gap-2">
                {card.count !== undefined && <span className="text-[12px] font-semibold text-biz-muted">{card.count}</span>}
                <ArrowRight className="h-4 w-4 text-biz-muted transition group-hover:translate-x-1 group-hover:text-biz-blue" />
              </div>
            </div>
            <h2 className="mt-3 text-[13px] font-bold text-biz-text">{card.title}</h2>
            <p className="mt-1 text-[11px] leading-4 text-biz-muted">{card.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
