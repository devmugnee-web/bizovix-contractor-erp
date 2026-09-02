"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Printer } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorPanel } from "@/components/shared/error-panel";
import { LoadingPanel } from "@/components/shared/loading-panel";
import { PageHeader } from "@/components/shared/page-header";
import { TablePagination } from "@/components/shared/table-pagination";
import { useTrialBalanceQuery } from "@/hooks/use-app-query";
import { useSessionContext } from "@/hooks/use-session-context";
import { useTransientScrollbar } from "@/hooks/use-transient-scrollbar";
import { downloadCsv } from "@/lib/download";
import { formatCurrency } from "@/lib/format";

export function TrialBalanceScreen() {
  const { mode, session } = useSessionContext();
  const query = useTrialBalanceQuery(mode, session?.workspaceId ?? "");
  const tableScrollRef = useTransientScrollbar<HTMLDivElement>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    const exportHandler = () => {
      if (!query.data?.length) {
        return;
      }

      downloadCsv(
        "trial-balance.csv",
        query.data.map((row) => ({
          Ledger: row.ledger,
          Group: row.group,
          Debit: row.debit,
          Credit: row.credit,
        })),
      );
      toast.success("Trial Balance exported");
    };

    window.addEventListener("erp-export-request", exportHandler as EventListener);
    return () => window.removeEventListener("erp-export-request", exportHandler as EventListener);
  }, [query.data]);

  const pagedRows = useMemo(() => {
    const allRows = query.data ?? [];
    return allRows.slice((page - 1) * pageSize, page * pageSize);
  }, [page, pageSize, query.data]);
  const totalPages = Math.max(1, Math.ceil((query.data?.length ?? 0) / pageSize));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  if (!session || query.isLoading) {
    return <LoadingPanel lines={6} />;
  }

  if (query.error || !query.data) {
    return (
      <ErrorPanel
        title="Trial Balance unavailable"
        description="The report preview could not be loaded in the current mode."
        onRetry={() => query.refetch()}
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Trial Balance"
        description="A credible report preview for demos, sales walkthroughs, and accountant checks."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => {
                if (!query.data?.length) {
                  return;
                }

                downloadCsv(
                  "trial-balance.csv",
                  query.data.map((row) => ({
                    Ledger: row.ledger,
                    Group: row.group,
                    Debit: row.debit,
                    Credit: row.credit,
                  })),
                );
              }}
            >
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              Print
            </Button>
          </>
        }
      />
      <Card>
        <CardContent className="overflow-hidden px-0 pt-5 sm:px-5">
          <div ref={tableScrollRef} className="transient-scrollbar overflow-x-auto px-4 sm:px-0">
            <table className="data-table min-w-[640px] text-sm sm:min-w-full">
              <thead className="bg-canvas">
                <tr>
                  <th className="text-left">Ledger</th>
                  <th className="text-left">Group</th>
                  <th className="text-left">Debit (BDT)</th>
                  <th className="text-left">Credit (BDT)</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((row) => (
                  <tr key={row.id}>
                    <td className="min-w-[180px] font-medium">{row.ledger}</td>
                    <td className="min-w-[140px]">{row.group}</td>
                    <td className="min-w-[160px] tabular-nums">{formatCurrency(row.debit)}</td>
                    <td className="min-w-[160px] tabular-nums">{formatCurrency(row.credit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination
            className="mt-4 px-4 pb-0 sm:px-0"
            page={page}
            pageSize={pageSize}
            totalItems={query.data.length}
            pageSizeOptions={[25, 50, 100, 250]}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
