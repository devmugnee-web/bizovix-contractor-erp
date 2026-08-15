"use client";

import * as React from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { ArrowLeft, Download, Filter, Pencil, Save, Search, Trash2, UploadCloud, X } from "lucide-react";
import { useBankAccounts, useCreateGeneralExpense, useDeleteGeneralExpense, useExpenseHeads, useExpensePeople, useExportGeneralExpenses, useGeneralExpenses, useMe, useUpdateGeneralExpense, useUploadGeneralExpenseAttachments } from "@bizovix/api-client";
import type { GeneralExpense, GeneralExpenseQuery, SaveGeneralExpenseInput } from "@bizovix/types";
import { generalExpenseSchema, type GeneralExpenseFormValues } from "@bizovix/validation";
import { FormField, PrimaryButton, SecondaryButton, SelectInput, TextInput, cn } from "@bizovix/ui";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

const PAGE_SIZE = 5;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_FILE_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

function money(value: string | number) {
  return Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function downloadCsv(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function visiblePages(current: number, total: number): Array<number | "ellipsis"> {
  if (total <= 5) return Array.from({ length: total }, (_, index) => index + 1);
  const pages = new Set([1, total, current - 1, current, current + 1].filter((page) => page > 0 && page <= total));
  const result: Array<number | "ellipsis"> = [];
  [...pages].sort((a, b) => a - b).forEach((page, index, all) => {
    if (index > 0 && page - all[index - 1]! > 1) result.push("ellipsis");
    result.push(page);
  });
  return result;
}

export default function GeneralExpensePage() {
  useSetBreadcrumb([{ label: "Expenses" }, { label: "General Expense" }, { label: "Add New Expense" }]);

  const me = useMe();
  const heads = useExpenseHeads();
  const people = useExpensePeople();
  const accounts = useBankAccounts();
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const deferredSearch = React.useDeferredValue(search.trim());
  const [filterOpen, setFilterOpen] = React.useState(false);
  const [filters, setFilters] = React.useState({ expenseHeadId: "", expenseById: "", paidFromAccountId: "", fromDate: "", toDate: "" });
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [files, setFiles] = React.useState<File[]>([]);
  const [dragging, setDragging] = React.useState(false);
  const [notice, setNotice] = React.useState<{ tone: "success" | "error"; text: string } | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const query: GeneralExpenseQuery = { page, limit: PAGE_SIZE, search: deferredSearch || undefined, expenseHeadId: filters.expenseHeadId || undefined, expenseById: filters.expenseById || undefined, paidFromAccountId: filters.paidFromAccountId || undefined, fromDate: filters.fromDate || undefined, toDate: filters.toDate || undefined };
  const expenses = useGeneralExpenses(query);
  const createExpense = useCreateGeneralExpense();
  const updateExpense = useUpdateGeneralExpense();
  const deleteExpense = useDeleteGeneralExpense();
  const uploadAttachments = useUploadGeneralExpenseAttachments();
  const exportExpenses = useExportGeneralExpenses();
  const form = useForm<GeneralExpenseFormValues>({ resolver: zodResolver(generalExpenseSchema), defaultValues: { expenseDate: "2026-08-15", expenseHeadId: "", amount: 5500, expenseById: "", paidFromAccountId: "", description: "Stationery and office supplies" } });
  const defaultsSet = React.useRef(false);

  React.useEffect(() => {
    if (defaultsSet.current || !heads.data?.length || !people.data?.length || !accounts.data?.length) return;
    defaultsSet.current = true;
    form.reset({ expenseDate: "2026-08-15", expenseHeadId: heads.data.find((item) => item.name === "Office Supplies")?.id ?? heads.data[0]!.id, amount: 5500, expenseById: people.data.find((item) => item.name.includes("Shajib"))?.id ?? people.data[0]!.id, paidFromAccountId: accounts.data.find((item) => item.accountName.includes("Islami Bank"))?.id ?? accounts.data[0]!.id, description: "Stationery and office supplies" });
  }, [accounts.data, form, heads.data, people.data]);

  const permissions = me.data?.permissions ?? [];
  const canCreate = permissions.includes("project_expense.create");
  const canUpdate = permissions.includes("project_expense.update");
  const canDelete = permissions.includes("project_expense.delete");
  const canExport = permissions.includes("project_expense.export");
  const rows = expenses.data?.items ?? [];
  const meta = expenses.data?.meta ?? { page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 };
  const saving = createExpense.isPending || updateExpense.isPending || uploadAttachments.isPending;

  function showNotice(tone: "success" | "error", text: string) {
    setNotice({ tone, text });
    window.setTimeout(() => setNotice(null), 3000);
  }

  function resetForm() {
    setEditingId(null);
    setFiles([]);
    form.reset({ expenseDate: "2026-08-15", expenseHeadId: heads.data?.find((item) => item.name === "Office Supplies")?.id ?? heads.data?.[0]?.id ?? "", amount: 5500, expenseById: people.data?.find((item) => item.name.includes("Shajib"))?.id ?? people.data?.[0]?.id ?? "", paidFromAccountId: accounts.data?.find((item) => item.accountName.includes("Islami Bank"))?.id ?? accounts.data?.[0]?.id ?? "", description: "Stationery and office supplies" });
  }

  function acceptFiles(selected: File[]) {
    const invalid = selected.find((file) => !ALLOWED_FILE_TYPES.has(file.type) || file.size > MAX_FILE_SIZE);
    if (invalid) return showNotice("error", `${invalid.name}: use PDF, JPG or PNG files up to 5MB.`);
    setFiles((current) => [...current, ...selected].slice(0, 10));
  }

  async function onSubmit(values: GeneralExpenseFormValues) {
    const payload: SaveGeneralExpenseInput = { ...values, amount: Number(values.amount), description: values.description || undefined };
    try {
      const saved = editingId ? await updateExpense.mutateAsync({ id: editingId, payload }) : await createExpense.mutateAsync(payload);
      if (files.length) await uploadAttachments.mutateAsync({ id: saved.id, files });
      showNotice("success", editingId ? "General expense updated successfully." : "General expense saved successfully.");
      resetForm();
    } catch { showNotice("error", "Could not save the expense. Please check the information and try again."); }
  }

  function editRow(expense: GeneralExpense) {
    setEditingId(expense.id);
    setFiles([]);
    form.reset({ expenseDate: new Date(expense.expenseDate).toISOString().slice(0, 10), expenseHeadId: expense.expenseHead.id, amount: Number(expense.amount), expenseById: expense.expenseBy.id, paidFromAccountId: expense.paidFromAccount.id, description: expense.description ?? "" });
    document.getElementById("general-expense-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function removeRow(id: string) {
    if (!window.confirm("Delete this general expense? This cannot be undone.")) return;
    try { await deleteExpense.mutateAsync(id); showNotice("success", "General expense deleted successfully."); }
    catch { showNotice("error", "Could not delete the general expense."); }
  }

  async function exportList() {
    try { const exported = await exportExpenses.mutateAsync({ ...query, page: undefined, limit: undefined }); downloadCsv(exported.filename, exported.content); }
    catch { showNotice("error", "Could not export the expense list."); }
  }

  return <div className="flex flex-col gap-3">
    {notice && <div className={cn("fixed right-5 top-16 z-50 rounded-md px-4 py-2 text-[12px] font-semibold text-white shadow-lg", notice.tone === "success" ? "bg-biz-success" : "bg-biz-danger")}>{notice.text}</div>}
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-page-title text-biz-text">Add General Expense</h1><p className="mt-0.5 text-[13px] font-medium text-biz-muted">Enter general expense information</p></div><Link href="/expenses"><SecondaryButton className="h-10"><ArrowLeft className="h-4 w-4" /> Back to List</SecondaryButton></Link></div>

    <section id="general-expense-form" className="scroll-mt-4 rounded-lg border border-biz-border bg-white p-4 shadow-card">
      <h2 className="text-[14px] font-bold text-biz-text">1. Expense Information</h2>
      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-4"><fieldset disabled={(!editingId && !canCreate) || (!!editingId && !canUpdate)} className="grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-3">
        <FormField label="Expense Date" required error={form.formState.errors.expenseDate?.message}><TextInput type="date" {...form.register("expenseDate")} /></FormField>
        <FormField label="Expense Head / Category" required error={form.formState.errors.expenseHeadId?.message}><SelectInput placeholder="Select expense head" options={(heads.data ?? []).map((item) => ({ label: item.name, value: item.id }))} {...form.register("expenseHeadId")} /></FormField>
        <FormField label="Amount (BDT)" required error={form.formState.errors.amount?.message}><TextInput type="number" min="0.01" step="0.01" placeholder="5,500.00" {...form.register("amount")} /></FormField>
        <FormField label="Expense By / Through" required error={form.formState.errors.expenseById?.message}><SelectInput placeholder="Select person" options={(people.data ?? []).map((item) => ({ label: item.name, value: item.id }))} {...form.register("expenseById")} /></FormField>
        <FormField label="Paid From" required error={form.formState.errors.paidFromAccountId?.message}><SelectInput placeholder="Select account" options={(accounts.data ?? []).map((item) => ({ label: `${item.accountName}${item.accountNumber ? ` (${item.accountNumber})` : ""}`, value: item.id }))} {...form.register("paidFromAccountId")} /></FormField>
        <FormField label="Description / Remarks" error={form.formState.errors.description?.message}><TextInput placeholder="Stationery and office supplies" {...form.register("description")} /></FormField>
      </fieldset><div className="mt-5 flex justify-end gap-3"><SecondaryButton type="button" onClick={resetForm}>Reset</SecondaryButton><PrimaryButton type="submit" disabled={saving || (!editingId && !canCreate) || (!!editingId && !canUpdate)} className="min-w-36"><Save className="h-4 w-4" /> {saving ? "Saving..." : editingId ? "Update Expense" : "Save Expense"}</PrimaryButton></div></form>
    </section>

    <section className="rounded-lg border border-biz-border bg-white p-4 shadow-card"><h2 className="text-[14px] font-bold text-biz-text">2. Attachments (Optional)</h2><p className="mt-0.5 text-[11px] font-medium text-biz-muted">Upload related documents (bills, vouchers, receipts, etc.)</p>
      <input ref={fileInput} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(event) => { acceptFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
      <button type="button" onClick={() => fileInput.current?.click()} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); acceptFiles(Array.from(event.dataTransfer.files)); }} className={cn("mt-3 flex min-h-28 w-full flex-col items-center justify-center rounded-md border border-dashed px-4 py-3 transition-colors", dragging ? "border-biz-blue bg-biz-blue-soft" : "border-blue-300 bg-[#fbfdff] hover:bg-biz-blue-soft/40")}><UploadCloud className="h-9 w-9 text-biz-blue" /><span className="mt-1 text-[13px] font-semibold text-biz-text">Drag &amp; drop files here, or <span className="text-biz-blue">click to browse</span></span><span className="mt-1 text-[11px] font-medium text-biz-muted">Supported formats: PDF, JPG, PNG (Max 5MB)</span></button>
      {files.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{files.map((file, index) => <span key={`${file.name}-${index}`} className="inline-flex items-center gap-2 rounded-md bg-biz-bg px-2.5 py-1.5 text-[11px] font-medium text-biz-text">{file.name}<button type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X className="h-3.5 w-3.5 text-biz-muted" /></button></span>)}</div>}
    </section>

    <section className="rounded-lg border border-biz-border bg-white shadow-card"><div className="relative flex flex-wrap items-center justify-between gap-3 p-4"><div><h2 className="text-[14px] font-bold text-biz-text">3. General Expense List</h2><p className="mt-0.5 text-[11px] font-medium text-biz-muted">All general expenses</p></div><div className="relative flex flex-wrap items-center gap-2"><TextInput icon={Search} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search in list..." className="h-9 w-56" /><SecondaryButton size="sm" onClick={() => setFilterOpen((open) => !open)}><Filter className="h-4 w-4" /> Filter</SecondaryButton>{canExport && <SecondaryButton size="sm" onClick={exportList} disabled={exportExpenses.isPending}><Download className="h-4 w-4" /> {exportExpenses.isPending ? "Exporting..." : "Export"}</SecondaryButton>}
      {filterOpen && <div className="absolute right-0 top-11 z-30 grid w-[540px] max-w-[calc(100vw-3rem)] grid-cols-2 gap-3 rounded-md border border-biz-border bg-white p-4 shadow-lg"><SelectInput placeholder="All expense heads" value={filters.expenseHeadId} onChange={(event) => { setFilters((value) => ({ ...value, expenseHeadId: event.target.value })); setPage(1); }} options={(heads.data ?? []).map((item) => ({ label: item.name, value: item.id }))} /><SelectInput placeholder="All people" value={filters.expenseById} onChange={(event) => { setFilters((value) => ({ ...value, expenseById: event.target.value })); setPage(1); }} options={(people.data ?? []).map((item) => ({ label: item.name, value: item.id }))} /><SelectInput placeholder="All accounts" value={filters.paidFromAccountId} onChange={(event) => { setFilters((value) => ({ ...value, paidFromAccountId: event.target.value })); setPage(1); }} options={(accounts.data ?? []).map((item) => ({ label: item.accountName, value: item.id }))} /><div className="grid grid-cols-2 gap-2"><TextInput type="date" value={filters.fromDate} onChange={(event) => setFilters((value) => ({ ...value, fromDate: event.target.value }))} /><TextInput type="date" min={filters.fromDate} value={filters.toDate} onChange={(event) => setFilters((value) => ({ ...value, toDate: event.target.value }))} /></div><button type="button" className="col-span-2 h-9 rounded-md border border-biz-border text-[12px] font-semibold text-biz-text" onClick={() => { setFilters({ expenseHeadId: "", expenseById: "", paidFromAccountId: "", fromDate: "", toDate: "" }); setFilterOpen(false); setPage(1); }}>Clear Filters</button></div>}
    </div></div>
      {expenses.isError && <div className="mx-4 mb-3 flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-biz-danger"><span>Could not load general expenses.</span><button type="button" className="font-semibold underline" onClick={() => expenses.refetch()}>Retry</button></div>}
      <div className="overflow-x-auto px-4"><table className="w-full min-w-[1080px] border-collapse text-left"><thead className="bg-[#f4f7fb] text-[11px] font-semibold text-biz-text"><tr><th className="w-12 px-3 py-2.5">SL</th><th className="w-28 px-3 py-2.5">Expense Date</th><th className="w-44 px-3 py-2.5">Expense Head / Category</th><th className="w-32 px-3 py-2.5 text-right">Amount (BDT)</th><th className="w-44 px-3 py-2.5">Expense By / Through</th><th className="w-40 px-3 py-2.5">Paid From</th><th className="px-3 py-2.5">Description / Remarks</th><th className="w-24 px-3 py-2.5 text-center">Action</th></tr></thead><tbody className="text-[11px] text-biz-text">
        {expenses.isLoading ? Array.from({ length: 5 }).map((_, index) => <tr key={index}><td colSpan={8} className="px-3 py-2"><div className="h-6 animate-pulse rounded bg-slate-100" /></td></tr>) : rows.length === 0 ? <tr><td colSpan={8} className="px-3 py-10 text-center text-[12px] text-biz-muted">No general expenses found.</td></tr> : rows.map((expense, index) => <tr key={expense.id} className="border-b border-biz-border last:border-0 hover:bg-biz-bg/60"><td className="px-3 py-2.5 text-biz-muted">{(meta.page - 1) * meta.limit + index + 1}</td><td className="px-3 py-2.5">{shortDate(expense.expenseDate)}</td><td className="px-3 py-2.5 font-semibold">{expense.expenseHead.name}</td><td className="px-3 py-2.5 text-right font-semibold tabular-nums">{money(expense.amount)}</td><td className="px-3 py-2.5">{expense.expenseBy.name}</td><td className="px-3 py-2.5">{expense.paidFromAccount.accountName}</td><td className="max-w-64 truncate px-3 py-2.5">{expense.description || "--"}</td><td className="px-3 py-2 text-center"><div className="inline-flex gap-1.5">{canUpdate && <button type="button" aria-label="Edit expense" title="Edit" onClick={() => editRow(expense)} className="flex h-7 w-7 items-center justify-center rounded-md border border-blue-200 bg-blue-50 text-biz-blue"><Pencil className="h-3.5 w-3.5" /></button>}{canDelete && <button type="button" aria-label="Delete expense" title="Delete" onClick={() => removeRow(expense.id)} disabled={deleteExpense.isPending} className="flex h-7 w-7 items-center justify-center rounded-md border border-red-200 bg-red-50 text-biz-danger"><Trash2 className="h-3.5 w-3.5" /></button>}</div></td></tr>)}
      </tbody></table></div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 text-[11px] font-medium text-biz-muted"><span>Showing {meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1} to {Math.min(meta.page * meta.limit, meta.total)} of {meta.total} entries</span><div className="flex gap-1.5"><button type="button" disabled={meta.page <= 1} onClick={() => setPage(1)} className="h-8 min-w-8 rounded-md border border-biz-border bg-white disabled:text-slate-300">&lt;&lt;</button><button type="button" disabled={meta.page <= 1} onClick={() => setPage(meta.page - 1)} className="h-8 min-w-8 rounded-md border border-biz-border bg-white disabled:text-slate-300">&lt;</button>{visiblePages(meta.page, meta.totalPages).map((item, index) => item === "ellipsis" ? <span key={`ellipsis-${index}`} className="flex h-8 min-w-8 items-center justify-center">...</span> : <button key={item} type="button" onClick={() => setPage(item)} className={cn("h-8 min-w-8 rounded-md border px-2 font-semibold", item === meta.page ? "border-biz-blue bg-biz-blue text-white" : "border-biz-border bg-white text-biz-text")}>{item}</button>)}<button type="button" disabled={meta.page >= meta.totalPages} onClick={() => setPage(meta.page + 1)} className="h-8 min-w-8 rounded-md border border-biz-border bg-white disabled:text-slate-300">&gt;</button><button type="button" disabled={meta.page >= meta.totalPages} onClick={() => setPage(meta.totalPages)} className="h-8 min-w-8 rounded-md border border-biz-border bg-white disabled:text-slate-300">&gt;&gt;</button></div></div>
    </section>
  </div>;
}
