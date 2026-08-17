"use client";

import Link from "next/link";
import { Eye, Plus } from "lucide-react";
import { useTimeExtensions } from "@bizovix/api-client";
import { DataTable, IconButton, PrimaryButton, StatusBadge } from "@bizovix/ui";
import { formatDate } from "@bizovix/utils";
import type { TimeExtensionRecord } from "@bizovix/types";
import { EOT_STATUS_META } from "@/lib/time-extensions";

export function TimeExtensionsPanel({ workId }: { workId: string }) {
  const eots = useTimeExtensions(workId);

  return (
    <section className="rounded-lg border border-biz-border bg-biz-surface shadow-card">
      <div className="flex items-center justify-between border-b border-biz-border px-4 py-3">
        <h3 className="text-[15px] font-semibold text-biz-text">Time Extensions</h3>
        <Link href={`/cms/time-extensions/create?cmsWorkId=${workId}`}>
          <PrimaryButton>
            <Plus className="h-4 w-4" />
            Add Time Extension
          </PrimaryButton>
        </Link>
      </div>
      <DataTable<TimeExtensionRecord>
        isLoading={eots.isLoading}
        data={eots.data ?? []}
        rowKey={(row) => row.id}
        emptyMessage="No time extension requests yet."
        columns={[
          {
            key: "eotNo",
            header: "EOT No.",
            render: (row) => (
              <Link href={`/cms/time-extensions/${row.id}`} className="font-medium text-biz-blue hover:underline">
                {row.eotNo}
              </Link>
            ),
          },
          { key: "requestDate", header: "Request Date", render: (row) => formatDate(row.requestDate) },
          { key: "requestedDays", header: "Requested Days", render: (row) => `${row.requestedDays} days` },
          { key: "previous", header: "Previous Completion", render: (row) => formatDate(row.previousCompletionDate) },
          { key: "revised", header: "Revised Completion", render: (row) => (row.revisedCompletionDate ? formatDate(row.revisedCompletionDate) : "—") },
          {
            key: "status",
            header: "Status",
            render: (row) => <StatusBadge label={EOT_STATUS_META[row.status].label} tone={EOT_STATUS_META[row.status].tone} />,
          },
          {
            key: "action",
            header: "Action",
            render: (row) => (
              <Link href={`/cms/time-extensions/${row.id}`}>
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
