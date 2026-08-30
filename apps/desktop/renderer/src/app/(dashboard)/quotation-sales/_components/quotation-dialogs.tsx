"use client";

import * as React from "react";
import { CalendarDays, CheckCircle2, Clock3, FileText, X } from "lucide-react";
import {
  useCreateSalesQuotation,
  useCreateSalesQuotationFollowUp,
  useSalesQuotation,
  useSalesQuotationFollowUps,
  useSalesQuotationOptions,
  useSaveSalesQuotationResult,
  useUpdateSalesQuotation,
} from "@bizovix/api-client";
import type {
  SalesQuotationExport,
  SalesQuotationListRecord,
  SalesQuotationRecord,
} from "@bizovix/types";
import { cn } from "@bizovix/ui";

const FIELD =
  "h-9 w-full rounded-[5px] border border-[#dbe3ef] bg-white px-3 text-[11px] text-[#10244c] outline-none focus:border-[#1769e8] focus:ring-2 focus:ring-[#1769e8]/10 disabled:bg-[#f5f7fa]";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function dateAfter(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatMoney(value: string | number | null | undefined) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount)
    ? amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "0.00";
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function DialogShell({
  open,
  title,
  onClose,
  children,
  wide = false,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const first = dialog?.querySelector<HTMLElement>(
      "input, select, textarea, button:not([disabled]), [href]",
    );
    first?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          "input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href]",
        ),
      );
      if (!focusable.length) return;
      const firstItem = focusable[0]!;
      const lastItem = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previous?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-[#071b49]/40 p-3 sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "max-h-[92vh] w-full overflow-y-auto rounded-[9px] border border-[#dbe3ef] bg-white shadow-2xl",
          wide ? "max-w-3xl" : "max-w-xl",
        )}
      >
        <div className="sticky top-0 z-10 flex h-12 items-center justify-between border-b border-[#e3e9f2] bg-white px-4">
          <h2 id={titleId} className="text-[14px] font-bold text-[#10244c]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[#61718b] hover:bg-[#f2f5f9]"
            aria-label={`Close ${title}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[10px] font-semibold text-[#33496f]">
        {label}
        {required && <span className="ml-0.5 text-[#e64a55]">*</span>}
      </span>
      {children}
    </label>
  );
}

interface QuotationFormState {
  customerId: string;
  workName: string;
  quotationDate: string;
  validUntil: string;
  currency: string;
  salesPersonId: string;
}

type SalesQuotationFormInitial = SalesQuotationRecord | SalesQuotationListRecord;

function formState(record?: SalesQuotationFormInitial | null): QuotationFormState {
  return {
    customerId: record?.customer.id ?? "",
    workName: record?.workName ?? "",
    quotationDate: record?.quotationDate?.slice(0, 10) ?? today(),
    validUntil: record?.validUntil?.slice(0, 10) ?? dateAfter(30),
    currency: record?.currency ?? "BDT",
    salesPersonId: record?.salesPerson?.id ?? "",
  };
}

export function QuotationFormDialog({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial?: SalesQuotationFormInitial | null;
  onClose: () => void;
  onSaved: (record: SalesQuotationRecord, mode: "create" | "edit") => void;
}) {
  const options = useSalesQuotationOptions();
  const createQuotation = useCreateSalesQuotation();
  const updateQuotation = useUpdateSalesQuotation();
  const [form, setForm] = React.useState<QuotationFormState>(() => formState(initial));
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    // This local draft intentionally resets when the dialog is opened for a different quotation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm(formState(initial));
    setError(null);
  }, [initial, open]);

  const pending = createQuotation.isPending || updateQuotation.isPending;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!form.customerId || !form.workName.trim() || !form.quotationDate || !form.validUntil) {
      setError("Customer, project/work name, quotation date and valid-until date are required.");
      return;
    }
    if (form.validUntil < form.quotationDate) {
      setError("Valid Until must be on or after the quotation date.");
      return;
    }

    try {
      if (initial) {
        const record = await updateQuotation.mutateAsync({
          id: initial.id,
          body: {
            customerId: form.customerId,
            workName: form.workName.trim(),
            quotationDate: form.quotationDate,
            validUntil: form.validUntil,
            currency: form.currency,
            salesPersonId: form.salesPersonId || null,
            expectedVersion: initial.version,
          },
        });
        onSaved(record, "edit");
      } else {
        const record = await createQuotation.mutateAsync({
          customerId: form.customerId,
          workName: form.workName.trim(),
          quotationDate: form.quotationDate,
          validUntil: form.validUntil,
          currency: form.currency,
          salesPersonId: form.salesPersonId || undefined,
        });
        onSaved(record, "create");
      }
    } catch (cause) {
      setError(
        errorMessage(
          cause,
          initial ? "Could not update this quotation." : "Could not create this quotation.",
        ),
      );
    }
  }

  return (
    <DialogShell
      open={open}
      title={initial ? `Edit ${initial.quotationNo}` : "New Quotation"}
      onClose={onClose}
    >
      <form onSubmit={submit} className="p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Customer" required>
            <select
              value={form.customerId}
              onChange={(event) =>
                setForm((current) => ({ ...current, customerId: event.target.value }))
              }
              className={FIELD}
              disabled={pending || options.isLoading}
            >
              <option value="">
                {options.isLoading ? "Loading customers..." : "Select customer"}
              </option>
              {(options.data?.customers ?? []).map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Project / Work Name" required>
            <input
              list="sales-quotation-work-names"
              value={form.workName}
              onChange={(event) =>
                setForm((current) => ({ ...current, workName: event.target.value }))
              }
              className={FIELD}
              placeholder="Enter project or work name"
              disabled={pending}
            />
            <datalist id="sales-quotation-work-names">
              {[...(options.data?.projectNames ?? []), ...(options.data?.workNames ?? [])]
                .filter((value, index, all) => all.indexOf(value) === index)
                .map((value) => (
                  <option key={value} value={value} />
                ))}
            </datalist>
          </Field>
          <Field label="Quotation Date" required>
            <input
              type="date"
              value={form.quotationDate}
              onChange={(event) =>
                setForm((current) => ({ ...current, quotationDate: event.target.value }))
              }
              className={FIELD}
              disabled={pending}
            />
          </Field>
          <Field label="Valid Until" required>
            <input
              type="date"
              min={form.quotationDate}
              value={form.validUntil}
              onChange={(event) =>
                setForm((current) => ({ ...current, validUntil: event.target.value }))
              }
              className={FIELD}
              disabled={pending}
            />
          </Field>
          <Field label="Currency">
            <select
              value={form.currency}
              onChange={(event) =>
                setForm((current) => ({ ...current, currency: event.target.value }))
              }
              className={FIELD}
              disabled={pending}
            >
              <option value="BDT">BDT</option>
            </select>
          </Field>
          <Field label="Sales Person">
            <select
              value={form.salesPersonId}
              onChange={(event) =>
                setForm((current) => ({ ...current, salesPersonId: event.target.value }))
              }
              className={FIELD}
              disabled={pending || options.isLoading}
            >
              <option value="">Unassigned</option>
              {(options.data?.salesPeople ?? []).map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {options.isError && (
          <div className="mt-3 flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[10px] text-red-700">
            <span>Could not load customer and salesperson options.</span>
            <button
              type="button"
              onClick={() => options.refetch()}
              className="font-semibold underline"
            >
              Retry
            </button>
          </div>
        )}
        {error && (
          <p
            role="alert"
            className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[10px] text-red-700"
          >
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="h-9 rounded-[5px] border border-[#dbe3ef] bg-white px-4 text-[10px] font-semibold text-[#33496f] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending || options.isError}
            className="h-9 rounded-[5px] bg-[#0867e8] px-5 text-[10px] font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Saving..." : initial ? "Save Changes" : "Create Quotation"}
          </button>
        </div>
      </form>
    </DialogShell>
  );
}

export function QuotationDetailDialog({
  open,
  quotationId,
  onClose,
}: {
  open: boolean;
  quotationId?: string;
  onClose: () => void;
}) {
  const detail = useSalesQuotation(open ? quotationId : undefined);
  const followUpQuery = useSalesQuotationFollowUps(open ? quotationId : undefined, {
    page: 1,
    limit: 5,
  });
  const followUps = {
    ...followUpQuery,
    data: followUpQuery.data ? { items: followUpQuery.data } : undefined,
  };
  const record = detail.data;

  return (
    <DialogShell
      open={open}
      title={record?.quotationNo ?? "Quotation Details"}
      onClose={onClose}
      wide
    >
      <div className="p-4">
        {detail.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {Array.from({ length: 9 }, (_, index) => (
              <div key={index} className="h-14 animate-pulse rounded-md bg-[#f1f4f8]" />
            ))}
          </div>
        ) : detail.isError || !record ? (
          <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-3 py-3 text-[11px] text-red-700">
            <span>Could not load quotation details.</span>
            <button
              type="button"
              onClick={() => detail.refetch()}
              className="font-semibold underline"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                ["Customer", record.customer.name],
                ["Project / Work Name", record.workName],
                ["Status", record.status],
                ["Quotation Date", formatDate(record.quotationDate)],
                ["Valid Until", formatDate(record.validUntil)],
                ["Sales Person", record.salesPerson?.name ?? "Unassigned"],
                ["Currency", record.currency],
                ["Quotation Value", `${formatMoney(record.grandTotal)} ${record.currency}`],
                ["Decision", record.decision],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-[6px] border border-[#e2e8f1] bg-[#fafcff] px-3 py-2.5"
                >
                  <span className="block text-[8px] font-semibold uppercase tracking-wide text-[#6a7b95]">
                    {label}
                  </span>
                  <strong className="mt-1 block text-[10px] text-[#10244c]">{value}</strong>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <section className="rounded-[6px] border border-[#e2e8f1]">
                <h3 className="flex h-9 items-center gap-2 border-b border-[#e8edf4] px-3 text-[10px] font-bold text-[#10244c]">
                  <FileText className="h-3.5 w-3.5 text-[#0867e8]" /> Costing
                </h3>
                <div className="space-y-2 p-3 text-[9px] text-[#435a7c]">
                  <div className="flex justify-between">
                    <span>Items</span>
                    <strong className="text-[#10244c]">{record.items.length}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Overheads</span>
                    <strong className="text-[#10244c]">{record.overheads.length}</strong>
                  </div>
                  <div className="flex justify-between border-t border-[#e8edf4] pt-2">
                    <span>Grand Total</span>
                    <strong className="text-[#0867e8]">{formatMoney(record.grandTotal)}</strong>
                  </div>
                </div>
              </section>
              <section className="rounded-[6px] border border-[#e2e8f1]">
                <h3 className="flex h-9 items-center gap-2 border-b border-[#e8edf4] px-3 text-[10px] font-bold text-[#10244c]">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#28a85d]" /> Result
                </h3>
                <div className="space-y-2 p-3 text-[9px] text-[#435a7c]">
                  {record.decision === "PENDING" ? (
                    <p>No final decision has been recorded.</p>
                  ) : (
                    <>
                      <div className="flex justify-between">
                        <span>Decision</span>
                        <strong className="text-[#10244c]">{record.decision}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Decision Date</span>
                        <strong className="text-[#10244c]">
                          {formatDate(record.decisionDate)}
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Decision By</span>
                        <strong className="text-[#10244c]">{record.decisionBy?.name ?? "—"}</strong>
                      </div>
                      {record.decision === "ACCEPTED" ? (
                        <div className="flex justify-between">
                          <span>Accepted Amount</span>
                          <strong className="text-[#28a85d]">
                            {formatMoney(record.acceptedAmount)}
                          </strong>
                        </div>
                      ) : (
                        <p className="rounded bg-red-50 px-2 py-1.5 text-red-700">
                          {record.rejectionReason}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </section>
            </div>

            <section className="mt-3 rounded-[6px] border border-[#e2e8f1]">
              <h3 className="flex h-9 items-center gap-2 border-b border-[#e8edf4] px-3 text-[10px] font-bold text-[#10244c]">
                <Clock3 className="h-3.5 w-3.5 text-[#e69422]" /> Recent Follow-ups
              </h3>
              <div className="divide-y divide-[#edf1f6] px-3">
                {followUps.isLoading ? (
                  <p className="py-4 text-[9px] text-[#687893]">Loading follow-ups...</p>
                ) : followUps.isError ? (
                  <div className="flex items-center justify-between py-3 text-[9px] text-red-700">
                    <span>Could not load follow-ups.</span>
                    <button
                      type="button"
                      onClick={() => followUps.refetch()}
                      className="font-semibold underline"
                    >
                      Retry
                    </button>
                  </div>
                ) : !followUps.data?.items.length ? (
                  <p className="py-4 text-[9px] text-[#687893]">No follow-ups recorded.</p>
                ) : (
                  followUps.data.items.map((item) => (
                    <div
                      key={item.id}
                      className="grid grid-cols-[95px_1fr_110px] gap-2 py-2 text-[8.5px]"
                    >
                      <span className="text-[#52627d]">{formatDate(item.followedUpAt)}</span>
                      <span className="truncate text-[#20385e]" title={item.notes ?? ""}>
                        {item.notes || "—"}
                      </span>
                      <span className="text-right text-[#e69422]">
                        Next: {formatDate(item.nextFollowUpAt)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>
          </>
        )}
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-[5px] bg-[#0867e8] px-5 text-[10px] font-semibold text-white"
          >
            Close
          </button>
        </div>
      </div>
    </DialogShell>
  );
}

export function QuotationDecisionDialog({
  open,
  quotation,
  onClose,
  onSaved,
}: {
  open: boolean;
  quotation?: SalesQuotationListRecord;
  onClose: () => void;
  onSaved: (record: SalesQuotationRecord) => void;
}) {
  const saveResult = useSaveSalesQuotationResult();
  const [decision, setDecision] = React.useState<"ACCEPTED" | "REJECTED">("ACCEPTED");
  const [decisionDate, setDecisionDate] = React.useState(today());
  const [acceptedAmount, setAcceptedAmount] = React.useState("");
  const [customerOrderNo, setCustomerOrderNo] = React.useState("");
  const [rejectionReason, setRejectionReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    // Opening the decision dialog starts a fresh, unsaved decision draft.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDecision("ACCEPTED");
    setDecisionDate(today());
    setAcceptedAmount(quotation?.grandTotal ?? "");
    setCustomerOrderNo("");
    setRejectionReason("");
    setError(null);
  }, [open, quotation]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!quotation) return;
    setError(null);
    if (quotation.status !== "SENT") {
      setError("Only a sent quotation can receive a final decision.");
      return;
    }
    if (!decisionDate) {
      setError("Decision date is required.");
      return;
    }
    if (
      decision === "ACCEPTED" &&
      (!acceptedAmount ||
        Number(acceptedAmount) <= 0 ||
        Number(acceptedAmount) > Number(quotation.grandTotal))
    ) {
      setError(
        `Accepted amount must be greater than zero and no more than ${formatMoney(quotation.grandTotal)}.`,
      );
      return;
    }
    if (decision === "ACCEPTED" && !customerOrderNo.trim()) {
      setError("Customer PO / WO number is required.");
      return;
    }
    if (decision === "REJECTED" && !rejectionReason.trim()) {
      setError("Rejection reason is required.");
      return;
    }
    try {
      const record = await saveResult.mutateAsync({
        id: quotation.id,
        body:
          decision === "ACCEPTED"
            ? {
                decision,
                decisionDate,
                acceptedAmount,
                customerPoWoNo: customerOrderNo.trim(),
                expectedVersion: quotation.version,
              }
            : {
                decision,
                decisionDate,
                rejectionReason: rejectionReason.trim(),
                expectedVersion: quotation.version,
              },
      });
      onSaved(record);
    } catch (cause) {
      setError(errorMessage(cause, "Could not record this quotation decision."));
    }
  }

  return (
    <DialogShell
      open={open}
      title={quotation ? `Record Result — ${quotation.quotationNo}` : "Record Result"}
      onClose={onClose}
    >
      <form onSubmit={submit} className="p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Decision" required>
            <select
              value={decision}
              onChange={(event) => setDecision(event.target.value as "ACCEPTED" | "REJECTED")}
              className={FIELD}
              disabled={saveResult.isPending}
            >
              <option value="ACCEPTED">Accepted</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </Field>
          <Field label="Decision Date" required>
            <input
              type="date"
              value={decisionDate}
              onChange={(event) => setDecisionDate(event.target.value)}
              className={FIELD}
              disabled={saveResult.isPending}
            />
          </Field>
          {decision === "ACCEPTED" ? (
            <>
              <Field label="Accepted Amount (BDT)" required>
                <input
                  type="number"
                  min="0.01"
                  max={quotation?.grandTotal}
                  step="0.01"
                  value={acceptedAmount}
                  onChange={(event) => setAcceptedAmount(event.target.value)}
                  className={FIELD}
                  disabled={saveResult.isPending}
                />
              </Field>
              <Field label="Customer PO / WO No." required>
                <input
                  required
                  value={customerOrderNo}
                  onChange={(event) => setCustomerOrderNo(event.target.value)}
                  className={FIELD}
                  disabled={saveResult.isPending}
                />
              </Field>
            </>
          ) : (
            <div className="sm:col-span-2">
              <Field label="Rejection Reason" required>
                <textarea
                  value={rejectionReason}
                  onChange={(event) => setRejectionReason(event.target.value)}
                  className="min-h-20 w-full rounded-[5px] border border-[#dbe3ef] px-3 py-2 text-[11px] text-[#10244c] outline-none focus:border-[#1769e8]"
                  disabled={saveResult.isPending}
                />
              </Field>
            </div>
          )}
        </div>
        {error && (
          <p
            role="alert"
            className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[10px] text-red-700"
          >
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saveResult.isPending}
            className="h-9 rounded-[5px] border border-[#dbe3ef] px-4 text-[10px] font-semibold text-[#33496f]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saveResult.isPending}
            className="h-9 rounded-[5px] bg-[#0867e8] px-5 text-[10px] font-semibold text-white disabled:opacity-50"
          >
            {saveResult.isPending ? "Saving..." : "Save Result"}
          </button>
        </div>
      </form>
    </DialogShell>
  );
}

export function QuotationFollowUpDialog({
  open,
  quotation,
  onClose,
  onSaved,
}: {
  open: boolean;
  quotation?: SalesQuotationListRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const followUpQuery = useSalesQuotationFollowUps(open ? quotation?.id : undefined, {
    page: 1,
    limit: 10,
  });
  const followUps = {
    ...followUpQuery,
    data: followUpQuery.data ? { items: followUpQuery.data } : undefined,
  };
  const createFollowUp = useCreateSalesQuotationFollowUp();
  const [followedUpAt, setFollowedUpAt] = React.useState(today());
  const [nextFollowUpAt, setNextFollowUpAt] = React.useState("");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    // Opening the follow-up dialog starts a fresh, unsaved follow-up draft.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFollowedUpAt(today());
    setNextFollowUpAt("");
    setNote("");
    setError(null);
  }, [open]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!quotation) return;
    if (quotation.status !== "SENT") {
      setError("Follow-ups can only be recorded for sent quotations.");
      return;
    }
    if (!followedUpAt || !note.trim()) {
      setError("Follow-up date and note are required.");
      return;
    }
    if (nextFollowUpAt && nextFollowUpAt < followedUpAt) {
      setError("Next follow-up cannot be before the current follow-up.");
      return;
    }
    try {
      await createFollowUp.mutateAsync({
        id: quotation.id,
        body: {
          followedUpAt,
          nextFollowUpAt: nextFollowUpAt || undefined,
          notes: note.trim(),
          expectedVersion: quotation.version,
        },
      });
      setNote("");
      setNextFollowUpAt("");
      setError(null);
      onSaved();
    } catch (cause) {
      setError(errorMessage(cause, "Could not save this follow-up."));
    }
  }

  return (
    <DialogShell
      open={open}
      title={quotation ? `Follow-ups — ${quotation.quotationNo}` : "Quotation Follow-ups"}
      onClose={onClose}
      wide
    >
      <div className="grid gap-4 p-4 md:grid-cols-[1fr_1.15fr]">
        <form onSubmit={submit} className="rounded-[7px] border border-[#e2e8f1] p-3">
          <h3 className="mb-3 text-[11px] font-bold text-[#10244c]">Add Follow-up</h3>
          <div className="space-y-3">
            <Field label="Followed Up At" required>
              <input
                type="date"
                value={followedUpAt}
                onChange={(event) => setFollowedUpAt(event.target.value)}
                className={FIELD}
                disabled={createFollowUp.isPending}
              />
            </Field>
            <Field label="Next Follow-up">
              <input
                type="date"
                min={followedUpAt}
                value={nextFollowUpAt}
                onChange={(event) => setNextFollowUpAt(event.target.value)}
                className={FIELD}
                disabled={createFollowUp.isPending}
              />
            </Field>
            <Field label="Note" required>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="min-h-24 w-full rounded-[5px] border border-[#dbe3ef] px-3 py-2 text-[11px] outline-none focus:border-[#1769e8]"
                disabled={createFollowUp.isPending}
              />
            </Field>
          </div>
          {error && (
            <p
              role="alert"
              className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[10px] text-red-700"
            >
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={createFollowUp.isPending || quotation?.status !== "SENT"}
            className="mt-4 h-9 w-full rounded-[5px] bg-[#0867e8] text-[10px] font-semibold text-white disabled:opacity-50"
          >
            {createFollowUp.isPending ? "Saving..." : "Save Follow-up"}
          </button>
        </form>

        <section className="overflow-hidden rounded-[7px] border border-[#e2e8f1]">
          <h3 className="flex h-10 items-center gap-2 border-b border-[#e8edf4] px-3 text-[11px] font-bold text-[#10244c]">
            <CalendarDays className="h-4 w-4 text-[#0867e8]" /> Follow-up History
          </h3>
          <div className="max-h-[350px] divide-y divide-[#edf1f6] overflow-y-auto px-3">
            {followUps.isLoading ? (
              <p className="py-6 text-center text-[10px] text-[#687893]">Loading follow-ups...</p>
            ) : followUps.isError ? (
              <div className="flex items-center justify-between py-4 text-[10px] text-red-700">
                <span>Could not load follow-ups.</span>
                <button
                  type="button"
                  onClick={() => followUps.refetch()}
                  className="font-semibold underline"
                >
                  Retry
                </button>
              </div>
            ) : !followUps.data?.items.length ? (
              <p className="py-6 text-center text-[10px] text-[#687893]">
                No follow-ups recorded yet.
              </p>
            ) : (
              followUps.data.items.map((item) => (
                <article key={item.id} className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <strong className="text-[9.5px] text-[#10244c]">
                      {formatDate(item.followedUpAt)}
                    </strong>
                    <span className="text-[8.5px] font-semibold text-[#e69422]">
                      Next: {formatDate(item.nextFollowUpAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-[9px] leading-4 text-[#435a7c]">{item.notes || "—"}</p>
                  <p className="mt-1 text-[8px] text-[#7a879b]">By {item.createdBy.name}</p>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
      <div className="border-t border-[#e8edf4] px-4 py-3 text-right">
        <button
          type="button"
          onClick={onClose}
          className="h-9 rounded-[5px] border border-[#dbe3ef] bg-white px-5 text-[10px] font-semibold text-[#33496f]"
        >
          Close
        </button>
      </div>
    </DialogShell>
  );
}

export function downloadSalesQuotationExport(file: SalesQuotationExport) {
  const url = URL.createObjectURL(new Blob([file.content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = file.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
