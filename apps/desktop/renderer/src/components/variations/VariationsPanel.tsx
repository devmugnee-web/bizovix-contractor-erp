"use client";

import Link from "next/link";
import { Eye, Plus } from "lucide-react";
import { useVariationOrders } from "@bizovix/api-client";
import { DataTable, IconButton, PrimaryButton, StatusBadge } from "@bizovix/ui";
import { formatBDT, formatDate } from "@bizovix/utils";
import type { VariationOrderRecord } from "@bizovix/types";
import { VARIATION_STATUS_META, VARIATION_TYPE_META } from "@/lib/variations";

export function VariationsPanel({ workId }: { workId: string }) {
  const variations = useVariationOrders(workId);

  return (
    <section className="rounded-lg border border-biz-border bg-biz-surface shadow-card">
      <div className="flex items-center justify-between border-b border-biz-border px-4 py-3">
        <h3 className="text-[15px] font-semibold text-biz-text">Variation Orders</h3>
        <Link href={`/cms/variations/create?cmsWorkId=${workId}`}>
          <PrimaryButton>
            <Plus className="h-4 w-4" />
            Add Variation Order
          </PrimaryButton>
        </Link>
      </div>
      <DataTable<VariationOrderRecord>
        isLoading={variations.isLoading}
        data={variations.data?.items ?? []}
        rowKey={(row) => row.id}
        emptyMessage="No variation orders created yet."
        columns={[
          {
            key: "variationNo",
            header: "Variation No.",
            render: (row) => (
              <Link href={`/cms/variations/${row.id}`} className="font-medium text-biz-blue hover:underline">
                {row.variationNo}
              </Link>
            ),
          },
          { key: "title", header: "Title", render: (row) => row.title },
          { key: "type", header: "Type", render: (row) => VARIATION_TYPE_META[row.variationType] },
          { key: "requestDate", header: "Request Date", render: (row) => formatDate(row.requestDate) },
          { key: "requested", header: "Requested Amount", render: (row) => formatBDT(row.requestedAmount) },
          { key: "approved", header: "Approved Amount", render: (row) => (row.approvedAmount ? formatBDT(row.approvedAmount) : "—") },
          {
            key: "status",
            header: "Status",
            render: (row) => <StatusBadge label={VARIATION_STATUS_META[row.status].label} tone={VARIATION_STATUS_META[row.status].tone} />,
          },
          {
            key: "action",
            header: "Action",
            render: (row) => (
              <Link href={`/cms/variations/${row.id}`}>
                <IconButton aria-label="View Details">
                  <Eye className="h-4 w-4" />
                </IconButton>
              </Link>
            ),
          },
        ]}
      />
    </section>
  );
}
