"use client";

import Link from "next/link";
import { ArrowRight, Boxes, Building2, ClipboardList, HardHat, Layers, ReceiptText, Ruler, Truck } from "lucide-react";
import { useItemStats, usePartyStats, usePaymentTerms, useUoms } from "@bizovix/api-client";
import { PageHeader } from "@bizovix/ui";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

export default function MastersPage() {
  useSetBreadcrumb([{ label: "Masters" }]);

  const vendorStats = usePartyStats("VENDOR,SUPPLIER,SERVICE_PROVIDER,OTHER");
  const subcontractorStats = usePartyStats("SUBCONTRACTOR");
  const itemStats = useItemStats();
  const uoms = useUoms();
  const paymentTerms = usePaymentTerms();

  const cards = [
    {
      href: "/masters/expense-heads",
      icon: ReceiptText,
      title: "Expense Heads",
      description: "Manage expense heads and their Budget vs Actual category mappings.",
      count: undefined,
    },
    {
      href: "/masters/organizations",
      icon: Building2,
      title: "Organizations / Clients",
      description: "Client / issuing-authority master used across Tenders, Contracts and Projects.",
      count: undefined,
    },
    {
      href: "/masters/vendors",
      icon: Truck,
      title: "Vendors & Suppliers",
      description: "Approved suppliers, vendors and service providers with bank, tax and contact details.",
      count: vendorStats.data?.total,
    },
    {
      href: "/masters/subcontractors",
      icon: HardHat,
      title: "Subcontractors",
      description: "Subcontractors engaged for project execution, with trade, retention and performance data.",
      count: subcontractorStats.data?.total,
    },
    {
      href: "/masters/items",
      icon: Boxes,
      title: "Materials / Items",
      description: "Reusable material, service and equipment master data — procurement-ready.",
      count: itemStats.data?.total,
    },
    {
      href: "/masters/units",
      icon: Ruler,
      title: "Units of Measurement",
      description: "PCS, KG, TON, M, SQM and other reusable units for items.",
      count: uoms.data?.length,
    },
    {
      href: "/masters/categories",
      icon: Layers,
      title: "Categories",
      description: "Reusable, typed categories for vendors, materials and subcontractor trades.",
      count: undefined,
    },
    {
      href: "/masters/payment-terms",
      icon: ClipboardList,
      title: "Payment Terms",
      description: "Immediate, 7/15/30/45/60 Days or custom terms shared across vendors and subcontractors.",
      count: paymentTerms.data?.length,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Masters" subtitle="Master Data Center — vendors, subcontractors, materials and the reusable lookups behind them." />

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
