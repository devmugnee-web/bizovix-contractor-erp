"use client";

import Link from "next/link";
import { Download, FileText } from "lucide-react";
import { useDocuments } from "@bizovix/api-client";
import type { DocumentQuery } from "@bizovix/types";
import { SecondaryButton } from "@bizovix/ui";
import { formatDate } from "@bizovix/utils";
import { documentService } from "@/services/document-service";

interface LinkedDocumentsCardProps {
  /** Exactly one procurement FK filter — the Documents module owns storage and upload; this
   * card only surfaces what is already linked to this record. */
  filter: Pick<
    DocumentQuery,
    | "purchaseRequisitionId"
    | "rfqId"
    | "supplierQuotationId"
    | "comparativeStatementId"
    | "purchaseOrderId"
    | "goodsReceiptNoteId"
    | "supplierBillId"
    | "supplierPaymentId"
  >;
}

export function LinkedDocumentsCard({ filter }: LinkedDocumentsCardProps) {
  const documents = useDocuments({ ...filter, limit: 50 });
  const items = documents.data?.items ?? [];

  return (
    <section className="rounded-lg border border-biz-border bg-biz-surface shadow-card">
      <div className="flex items-center justify-between border-b border-biz-border px-4 py-3">
        <h3 className="text-[15px] font-semibold text-biz-text">Linked Documents</h3>
        <Link href="/documents" className="text-[12px] font-medium text-biz-blue hover:underline">
          Open Documents
        </Link>
      </div>
      {documents.isLoading ? (
        <p className="px-4 py-6 text-center text-[13px] text-biz-muted">Loading documents...</p>
      ) : items.length === 0 ? (
        <p className="px-4 py-6 text-center text-[13px] text-biz-muted">
          No documents linked to this record yet. Upload and link them from the Documents module.
        </p>
      ) : (
        <ul className="divide-y divide-biz-border">
          {items.map((document) => (
            <li key={document.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <FileText className="h-4 w-4 shrink-0 text-biz-muted" />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-biz-text">{document.name}</p>
                  <p className="text-[11px] text-biz-muted">
                    {document.category ?? "Uncategorised"} · v{document.currentVersion} · {formatDate(document.createdAt)}
                  </p>
                </div>
              </div>
              {document.fileName && (
                <SecondaryButton size="sm" onClick={() => void documentService.download(document.id, undefined, document.fileName ?? "document")}>
                  <Download className="h-4 w-4" />
                  Download
                </SecondaryButton>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
