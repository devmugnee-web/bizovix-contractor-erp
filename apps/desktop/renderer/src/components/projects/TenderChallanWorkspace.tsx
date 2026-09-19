"use client";

import * as React from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileBox,
  FilePenLine,
  PackageSearch,
  Search,
  UserRound,
} from "lucide-react";
import {
  downloadTenderChallanPdf,
  downloadTenderChallanWord,
  useCostedTendersForChallans,
  useTenderChallanReport,
} from "@bizovix/api-client";
import type { CostedTenderChallanSummary } from "@bizovix/types";
import { cn } from "@bizovix/ui";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { ChallanPdfActions } from "./ChallanPdfActions";

const PAGE_SIZE = 10;
const CONTROL =
  "mt-1 h-9 w-full min-w-0 rounded-md border border-biz-border bg-white px-3 text-[13px] outline-none focus:border-biz-blue focus:ring-2 focus:ring-biz-blue/15";

function deliveryAddress(value?: string | null) {
  return (value ?? "")
    .trim()
    .replace(/^(?:address\s*[:：]\s*)+/i, "")
    .trim();
}

function quantity(value: string) {
  const [whole = "", fraction] = value
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "")
    .split(".");
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (fraction ? `.${fraction}` : "");
}

function compactText(value?: string | null) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function TenderGoods({
  tender,
  onBack,
}: {
  tender: CostedTenderChallanSummary;
  onBack: () => void;
}) {
  const report = useTenderChallanReport(tender.id);
  const data = report.data;
  const [reference, setReference] = React.useState("");
  const [date, setDate] = React.useState("");
  const [deliveryOverride, setDeliveryOverride] = React.useState<string | null>(null);
  const paAddress = deliveryAddress(data?.pa.address);
  const deliveryPlace = deliveryAddress(deliveryOverride) || paAddress;

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-biz-border bg-white shadow-sm">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-biz-border bg-slate-50/70 px-3 py-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-semibold text-biz-blue hover:bg-biz-blue-soft"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All Tenders
        </button>
        <ChallanPdfActions
          disabled={report.isError || !data?.rows.length}
          preparePdf={() =>
            downloadTenderChallanPdf(tender.id, {
              reference: reference.trim() || undefined,
              date: date || undefined,
              deliveryPlace: deliveryOverride?.trim() || undefined,
            })
          }
          prepareWord={() =>
            downloadTenderChallanWord(tender.id, {
              reference: reference.trim() || undefined,
              date: date || undefined,
              deliveryPlace: deliveryOverride?.trim() || undefined,
            })
          }
        />
      </div>
      <div className="shrink-0 border-b border-biz-border bg-gradient-to-r from-biz-blue-soft/65 via-white to-white px-4 py-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-biz-blue/10 bg-white text-biz-blue shadow-sm">
            <FileBox className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="line-clamp-2 text-[15px] font-semibold leading-5 text-biz-navy">
                {compactText(data?.workName || tender.workName)}
              </h2>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold leading-[14px] text-emerald-700">
                <CheckCircle2 className="h-3 w-3" />
                Ready for Challan
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px] leading-4 text-biz-muted">
              <span className="rounded-md border border-biz-border bg-white px-2 py-1">
                Tender ID:{" "}
                <strong className="text-biz-text">
                  {data?.tenderNumber || tender.tenderNumber || "—"}
                </strong>
              </span>
              {data?.costingDate && (
                <span className="rounded-md border border-biz-border bg-white px-2 py-1">
                  Costing Date:{" "}
                  <strong className="text-biz-text">{data.costingDate.slice(0, 10)}</strong>
                </span>
              )}
              {!!data?.rows.length && (
                <span className="rounded-md border border-biz-border bg-white px-2 py-1">
                  <strong className="text-biz-text">{data.rows.length}</strong> Products
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
      {report.isLoading ? (
        <p className="flex flex-1 items-center justify-center p-8 text-[14px] text-biz-muted">
          Loading products…
        </p>
      ) : report.isError ? (
        <div
          role="alert"
          className="flex flex-1 flex-col items-center justify-center p-8 text-center text-[14px] text-biz-danger"
        >
          <p>{report.error.message || "Could not load this tender."}</p>
          <button
            type="button"
            onClick={() => void report.refetch()}
            className="mt-2 font-semibold underline"
          >
            Retry
          </button>
        </div>
      ) : data ? (
        <>
          <div className="grid shrink-0 grid-cols-1 border-b border-biz-border lg:grid-cols-[1.1fr_1fr]">
            <section
              aria-labelledby="challan-pa"
              className="border-b border-biz-border bg-white px-4 py-3 lg:border-b-0 lg:border-r"
            >
              <h3
                id="challan-pa"
                className="mb-2 flex items-center gap-2 text-[14px] font-semibold"
              >
                <UserRound className="h-4 w-4 text-biz-blue" />
                Procuring Entity Contact
              </h3>
              <dl className="grid grid-cols-2 gap-x-5 gap-y-2 text-[13px] leading-[18px]">
                {[
                  ["PA Name", data.pa.name],
                  ["Designation", data.pa.designation],
                  ["Phone Number", data.pa.phone],
                  ["Organization", data.organizationName],
                  ["Address", data.pa.address],
                ].map(([label, value]) => (
                  <div key={label} className={cn("min-w-0", label === "Address" && "col-span-2")}>
                    <dt className="text-[12px] leading-4 text-biz-muted">{label}</dt>
                    <dd
                      className="mt-0.5 line-clamp-2 break-words font-medium [overflow-wrap:anywhere]"
                      title={compactText(value)}
                    >
                      {compactText(value) || "—"}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
            <section aria-label="Challan document information" className="bg-slate-50/35 px-4 py-3">
              <h3 className="mb-2 flex items-center gap-2 text-[14px] font-semibold">
                <FilePenLine className="h-4 w-4 text-biz-blue" />
                Document Settings
              </h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="text-[12px] leading-4 text-biz-muted">
                  Reference
                  <input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    maxLength={120}
                    placeholder="Optional reference"
                    className={CONTROL}
                  />
                </label>
                <label className="text-[12px] leading-4 text-biz-muted">
                  Challan Date
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className={CONTROL}
                  />
                </label>
                <label className="text-[12px] leading-4 text-biz-muted sm:col-span-2">
                  Place of Delivery
                  <input
                    value={deliveryOverride ?? paAddress}
                    onChange={(e) => setDeliveryOverride(e.target.value)}
                    onBlur={() => setDeliveryOverride(deliveryAddress(deliveryOverride) || null)}
                    maxLength={1000}
                    placeholder="Delivery location"
                    className={CONTROL}
                  />
                </label>
              </div>
            </section>
          </div>
          <div className="flex shrink-0 items-center justify-between border-b border-biz-border bg-white px-4 py-2">
            <h3 className="flex items-center gap-2 text-[14px] font-semibold">
              <PackageSearch className="h-4 w-4 text-biz-blue" />
              Product Details
            </h3>
            <span className="text-[12px] font-medium text-biz-muted">
              Scroll to review all {data.rows.length} products
            </span>
          </div>
          {!data.rows.length ? (
            <p className="flex flex-1 items-center justify-center p-8 text-center text-[14px] text-biz-muted">
              No saved costing items are available for this tender.
            </p>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto">
              <table
                aria-label="Challan products"
                className="w-full table-fixed text-left text-[13px] leading-[18px]"
              >
                <colgroup>
                  <col className="w-[6%]" />
                  <col className="w-[39%]" />
                  <col className="w-[10%]" />
                  <col className="w-[15%]" />
                  <col className="w-[30%]" />
                </colgroup>
                <thead className="sticky top-0 z-10 bg-slate-50 text-[12px] text-biz-muted">
                  <tr>
                    {["SL", "Product Name", "Unit", "Quantity", "Place of Delivery"].map(
                      (title) => (
                        <th
                          key={title}
                          className="border-b border-biz-border px-3 py-2.5 font-semibold"
                        >
                          {title}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row, index) => {
                    const productName = compactText(row.productName);
                    const details = compactText(row.details);
                    const delivery = compactText(deliveryPlace);
                    const showDetails = details && !productName.includes(details);

                    return (
                      <tr
                        key={row.id}
                        className="border-b border-biz-border align-top even:bg-slate-50/45 last:border-0 hover:bg-biz-blue-soft/25"
                      >
                        <td className="px-3 py-2.5 text-biz-muted">{index + 1}</td>
                        <td className="break-words px-3 py-2.5" title={productName}>
                          <span className="line-clamp-2 font-medium leading-snug">
                            {productName}
                          </span>
                          {showDetails && (
                            <span
                              className="mt-0.5 block truncate text-[12px] text-biz-muted"
                              title={details}
                            >
                              {details}
                            </span>
                          )}
                        </td>
                        <td className="break-words px-3 py-2.5">{compactText(row.unit) || "—"}</td>
                        <td className="px-3 py-2.5 font-medium tabular-nums">
                          {quantity(row.quantity)}
                        </td>
                        <td className="break-words px-3 py-2.5" title={delivery}>
                          <span className="line-clamp-2 leading-snug">{delivery || "—"}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}

export function TenderChallanWorkspace() {
  useSetBreadcrumb([
    { label: "Projects", href: "/cms/ongoing-works" },
    { label: "Project Documentation", href: "/cms/documentation" },
    { label: "Challan Submission" },
  ]);
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<CostedTenderChallanSummary | null>(null);
  const deferredSearch = React.useDeferredValue(search.trim());
  const tenders = useCostedTendersForChallans({
    page,
    limit: PAGE_SIZE,
    search: deferredSearch || undefined,
  });
  const rows = tenders.data?.items ?? [];
  const total = tenders.data?.meta.total ?? 0;
  const totalPages = Math.max(1, tenders.data?.meta.totalPages ?? 1);
  const start = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const end = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="flex min-h-full flex-col gap-2.5 text-biz-text xl:h-full xl:min-h-0 xl:overflow-hidden">
      <header className="shrink-0">
        <h1 className="text-[22px] font-bold leading-7 tracking-[-0.02em] text-biz-navy">
          Challan Submission
        </h1>
        <p className="mt-0.5 text-[13px] leading-[18px] text-biz-muted">
          Select a costed tender, review its products and prepare the delivery challan.
        </p>
      </header>
      {selected ? (
        <TenderGoods key={selected.id} tender={selected} onBack={() => setSelected(null)} />
      ) : (
        <section className="flex min-h-[320px] flex-1 flex-col overflow-hidden rounded-xl border border-biz-border bg-white shadow-sm">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-biz-border px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-biz-blue-soft text-biz-blue">
                <FileBox className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-[14px] font-semibold">Costed Tenders</h2>
                <p className="text-[12px] leading-4 text-biz-muted">
                  Only completed tender costings are shown
                </p>
              </div>
              <span className="rounded-full bg-biz-blue-soft px-2 py-0.5 text-[12px] font-semibold text-biz-blue">
                {total}
              </span>
            </div>
            <label className="relative w-full sm:w-[330px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-biz-muted" />
              <input
                aria-label="Search costed tenders"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Tender ID / Work Name / PA Name"
                className="h-9 w-full rounded-md border border-biz-border pl-9 pr-3 text-[13px] outline-none focus:border-biz-blue focus:ring-2 focus:ring-biz-blue/15"
              />
            </label>
          </div>
          {tenders.isError ? (
            <div
              role="alert"
              className="flex flex-1 flex-col items-center justify-center p-8 text-center text-[14px] text-biz-danger"
            >
              <p>Could not load costed tenders.</p>
              <button
                type="button"
                className="mt-2 font-semibold underline"
                onClick={() => void tenders.refetch()}
              >
                Retry
              </button>
            </div>
          ) : tenders.isLoading ? (
            <p className="flex flex-1 items-center justify-center p-8 text-[14px] text-biz-muted">
              Loading tenders…
            </p>
          ) : !rows.length ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
              <PackageSearch className="h-7 w-7 text-biz-muted" />
              <p className="text-[14px] font-semibold">No completed tender costings found</p>
              <p className="text-[13px] text-biz-muted">
                {search
                  ? "Try a different Tender ID, work name or PA name."
                  : "Completed costing records will appear here."}
              </p>
            </div>
          ) : (
            <>
              <div className="hidden min-h-0 flex-1 overflow-auto md:block">
                <table
                  aria-label="Costed tenders"
                  className="w-full table-fixed text-left text-[13px] leading-[18px]"
                >
                  <colgroup>
                    <col className="w-[5%]" />
                    <col className="w-[12%]" />
                    <col className="w-[43%]" />
                    <col className="w-[25%]" />
                    <col className="w-[15%]" />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-slate-50 text-[12px] text-biz-muted">
                    <tr>
                      {["SL", "Tender ID", "Work Name", "PA Name", "Products"].map((title) => (
                        <th
                          key={title}
                          className="border-b border-biz-border px-3 py-2.5 font-semibold"
                        >
                          {title}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((tender, index) => (
                      <tr
                        key={tender.id}
                        data-costing-id={tender.id}
                        className="border-b border-biz-border align-middle last:border-0 hover:bg-biz-blue-soft/25"
                      >
                        <td className="px-3 py-2.5 text-biz-muted">{start + index}</td>
                        <td className="px-3 py-2.5">
                          <button
                            type="button"
                            onClick={() => setSelected(tender)}
                            className="font-semibold text-biz-blue hover:underline"
                          >
                            {tender.tenderNumber || "—"}
                          </button>
                        </td>
                        <td className="px-3 py-2.5">
                          <button
                            type="button"
                            onClick={() => setSelected(tender)}
                            title={tender.workName}
                            className="line-clamp-2 text-left font-medium leading-snug hover:text-biz-blue"
                          >
                            {tender.workName}
                          </button>
                        </td>
                        <td className="px-3 py-2.5 [overflow-wrap:anywhere]">
                          {tender.paName || "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          <button
                            type="button"
                            onClick={() => setSelected(tender)}
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-biz-blue/20 bg-biz-blue-soft/50 px-2.5 font-semibold text-biz-blue hover:bg-biz-blue-soft"
                          >
                            View {tender.itemCount}
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="min-h-0 flex-1 divide-y divide-biz-border overflow-auto md:hidden">
                {rows.map((tender, index) => (
                  <button
                    key={tender.id}
                    type="button"
                    onClick={() => setSelected(tender)}
                    className="flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-biz-blue-soft/25"
                  >
                    <span className="mt-0.5 text-[12px] text-biz-muted">{start + index}</span>
                    <span className="min-w-0 flex-1">
                      <span className="text-[13px] font-semibold text-biz-blue">
                        {tender.tenderNumber || "—"}
                      </span>
                      <span className="mt-0.5 line-clamp-2 text-[13px] font-medium leading-[18px]">
                        {tender.workName}
                      </span>
                      <span className="mt-1 block truncate text-[12px] text-biz-muted">
                        {tender.paName || "PA not set"}
                      </span>
                    </span>
                    <span className="mt-0.5 shrink-0 rounded-full bg-biz-blue-soft px-2 py-1 text-[11px] font-semibold text-biz-blue">
                      {tender.itemCount} items
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
          {total > 0 && (
            <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-t border-biz-border px-3 text-[12px] text-biz-muted">
              <span>
                Showing {start} to {end} of {total}
              </span>
              {totalPages > 1 && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label="Previous page"
                    disabled={page <= 1 || tenders.isFetching}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-biz-border disabled:opacity-35"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="min-w-14 text-center font-semibold text-biz-text">
                    {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    aria-label="Next page"
                    disabled={page >= totalPages || tenders.isFetching}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-biz-border disabled:opacity-35"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
