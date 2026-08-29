"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm, useWatch, type Resolver } from "react-hook-form";
import { z } from "zod";
import {
  ArrowLeft,
  BriefcaseBusiness,
  Download,
  Filter,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import {
  useBankAccounts,
  useCmsWorks,
  useCmsWork,
  useCreateProjectExpensesBatch,
  useDeleteProjectExpense,
  useExpenseHeads,
  useExpensePeople,
  useExportProjectExpenses,
  useMe,
  useProjectExpenses,
  useUpdateProjectExpense,
} from "@bizovix/api-client";
import type { CmsWork, ProjectExpense, ProjectExpenseQuery, SaveProjectExpenseInput } from "@bizovix/types";
import { projectExpenseSchema, type ProjectExpenseFormValues } from "@bizovix/validation";
import { FormField, PrimaryButton, SecondaryButton, SelectInput, TextInput } from "@bizovix/ui";
import { SuccessPopup } from "@/components/layout/SuccessPopup";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

const PAGE_SIZE = 5;
const MAX_BATCH_EXPENSES = 50;
type ExpenseDraftInput = Omit<ProjectExpenseFormValues, "amount"> & { amount: number | "" };
interface ProjectExpenseBatchFormInput {
  expenses: ExpenseDraftInput[];
}
interface ProjectExpenseBatchFormValues {
  expenses: ProjectExpenseFormValues[];
}
const projectExpenseBatchSchema = z.object({
  expenses: z.array(projectExpenseSchema).min(1).max(MAX_BATCH_EXPENSES),
});
const projectExpenseBatchResolver = zodResolver(projectExpenseBatchSchema) as unknown as Resolver<
  ProjectExpenseBatchFormInput,
  unknown,
  ProjectExpenseBatchFormValues
>;

interface ExpenseCompletion {
  count: number;
  projectHref: string;
  projectName: string;
}

function money(value: string) {
  return Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function localDateInput(value = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getProjectReturnPath(value: string | null, workId: string) {
  if (!workId) return null;
  const expectedPath = `/cms/ongoing-works/${workId}`;
  return value === expectedPath ? expectedPath : null;
}

function createExpenseDraft(defaults: Partial<ExpenseDraftInput> = {}): ExpenseDraftInput {
  return {
    expenseDate: defaults.expenseDate ?? localDateInput(),
    expenseHeadId: defaults.expenseHeadId ?? "",
    amount: "",
    expenseById: defaults.expenseById ?? "",
    paidFromAccountId: defaults.paidFromAccountId ?? "",
    description: "",
  };
}

function downloadCsv(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function ProjectExpensePageContent() {
  useSetBreadcrumb([{ label: "Expenses" }, { label: "Project Expense" }, { label: "Add New Expense" }]);

  const router = useRouter();
  const searchParams = useSearchParams();
  const me = useMe();
  const [projectSearch, setProjectSearch] = React.useState("");
  const deferredProjectSearch = React.useDeferredValue(projectSearch.trim());
  const [selectingProject, setSelectingProject] = React.useState(false);
  const [selectedProject, setSelectedProject] = React.useState<CmsWork | null>(null);
  const linkedWorkId = searchParams.get("workId")?.trim() ?? "";
  const isLinkedProject = Boolean(linkedWorkId);
  const returnTo = getProjectReturnPath(searchParams.get("returnTo"), linkedWorkId);
  const backHref = returnTo ?? "/expenses";
  const linkedWork = useCmsWork(linkedWorkId || undefined);
  const projects = useCmsWorks({ status: "ONGOING", search: deferredProjectSearch || undefined, page: 1, limit: 20 });
  const linkedProjectIsOngoing = linkedWork.data?.status === "ONGOING";
  const activeProject = isLinkedProject
    ? linkedProjectIsOngoing
      ? linkedWork.data ?? null
      : null
    : selectedProject;

  const heads = useExpenseHeads();
  const people = useExpensePeople();
  const accounts = useBankAccounts();
  const activeAccounts = React.useMemo(() => (accounts.data ?? []).filter((account) => account.isActive), [accounts.data]);
  const [page, setPage] = React.useState(1);
  const [listSearch, setListSearch] = React.useState("");
  const deferredListSearch = React.useDeferredValue(listSearch.trim());
  const [filterOpen, setFilterOpen] = React.useState(false);
  const [filters, setFilters] = React.useState({ expenseHeadId: "", expenseById: "", paidFromAccountId: "", fromDate: "", toDate: "" });
  const query: ProjectExpenseQuery = {
    workId: activeProject?.id ?? "",
    page,
    limit: PAGE_SIZE,
    search: deferredListSearch || undefined,
    expenseHeadId: filters.expenseHeadId || undefined,
    expenseById: filters.expenseById || undefined,
    paidFromAccountId: filters.paidFromAccountId || undefined,
    fromDate: filters.fromDate || undefined,
    toDate: filters.toDate || undefined,
  };
  const expenses = useProjectExpenses(query);
  const createExpensesBatch = useCreateProjectExpensesBatch();
  const updateExpense = useUpdateProjectExpense();
  const deleteExpense = useDeleteProjectExpense();
  const exportExpenses = useExportProjectExpenses();
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState("");
  const [completion, setCompletion] = React.useState<ExpenseCompletion | null>(null);
  const submittingRef = React.useRef(false);

  const form = useForm<ProjectExpenseBatchFormInput, unknown, ProjectExpenseBatchFormValues>({
    resolver: projectExpenseBatchResolver,
    defaultValues: { expenses: [createExpenseDraft()] },
  });
  const expenseFields = useFieldArray({ control: form.control, name: "expenses" });
  const watchedExpenses = useWatch({ control: form.control, name: "expenses" });
  const batchTotal = watchedExpenses.reduce((total, expense) => total + (Number(expense.amount) || 0), 0);
  const defaultsSet = React.useRef(false);

  React.useEffect(() => {
    if (defaultsSet.current || !heads.data?.length || !activeAccounts.length || people.isLoading) return;
    defaultsSet.current = true;
    form.reset({ expenses: [createExpenseDraft({
      expenseHeadId: heads.data[0]!.id,
      expenseById: people.data?.[0]?.id ?? "",
      paidFromAccountId: activeAccounts[0]!.id,
    })] });
  }, [activeAccounts, form, heads.data, people.data, people.isLoading]);

  const permissions = me.data?.permissions ?? [];
  const canCreate = permissions.includes("project_expense.create");
  const canUpdate = permissions.includes("project_expense.update");
  const canDelete = permissions.includes("project_expense.delete");
  const canExport = permissions.includes("project_expense.export");
  const rows = expenses.data?.items ?? [];
  const meta = expenses.data?.meta ?? { page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 };

  function resetExpenseForm() {
    setEditingId(null);
    form.reset({ expenses: [createExpenseDraft({
      expenseHeadId: heads.data?.[0]?.id ?? "",
      expenseById: people.data?.[0]?.id ?? "",
      paidFromAccountId: activeAccounts[0]?.id ?? "",
    })] });
  }

  function addAnotherExpense() {
    if (editingId || expenseFields.fields.length >= MAX_BATCH_EXPENSES) return;
    const previous = form.getValues(`expenses.${expenseFields.fields.length - 1}`);
    expenseFields.append(createExpenseDraft({
      expenseDate: previous?.expenseDate,
      expenseHeadId: previous?.expenseHeadId,
      expenseById: previous?.expenseById,
      paidFromAccountId: previous?.paidFromAccountId,
    }));
    const nextIndex = expenseFields.fields.length;
    window.requestAnimationFrame(() => form.setFocus(`expenses.${nextIndex}.amount`));
  }

  function selectProject(project: CmsWork) {
    if (form.formState.isDirty && !window.confirm("Change project and discard unsaved expense changes?")) return;
    setSelectedProject(project);
    setProjectSearch("");
    setSelectingProject(false);
    setPage(1);
    setListSearch("");
    resetExpenseForm();
  }

  async function onSubmit(values: ProjectExpenseBatchFormValues) {
    if (!activeProject || submittingRef.current) return;
    const payloads: SaveProjectExpenseInput[] = values.expenses.map((expense) => ({
      ...expense,
      workId: activeProject.id,
      amount: Number(expense.amount),
      description: expense.description || undefined,
    }));
    submittingRef.current = true;
    try {
      if (editingId) {
        await updateExpense.mutateAsync({ id: editingId, payload: payloads[0]! });
        setNotice("Expense updated successfully.");
        window.setTimeout(() => setNotice(""), 2500);
        resetExpenseForm();
        return;
      }

      await createExpensesBatch.mutateAsync({ expenses: payloads });
      setPage(1);
      const previous = values.expenses.at(-1);
      form.reset({ expenses: [createExpenseDraft({
        expenseDate: previous?.expenseDate,
        expenseHeadId: previous?.expenseHeadId,
        expenseById: previous?.expenseById,
        paidFromAccountId: previous?.paidFromAccountId,
      })] });
      setCompletion({
        count: payloads.length,
        projectHref: returnTo ?? `/cms/ongoing-works/${activeProject.id}`,
        projectName: activeProject.workName,
      });
    } catch {
      setNotice("");
    } finally {
      submittingRef.current = false;
    }
  }

  function continueAddingExpense() {
    setCompletion(null);
    window.requestAnimationFrame(() => form.setFocus("expenses.0.amount"));
  }

  function returnToProject() {
    if (!completion) return;
    const projectHref = completion.projectHref;
    setCompletion(null);
    router.replace(projectHref);
  }

  function editExpense(expense: ProjectExpense) {
    if (form.formState.isDirty && !window.confirm("Discard the unsaved expense batch and edit this expense?")) return;
    setEditingId(expense.id);
    form.reset({ expenses: [{
      expenseDate: new Date(expense.expenseDate).toISOString().slice(0, 10),
      expenseHeadId: expense.expenseHead.id,
      amount: Number(expense.amount),
      expenseById: expense.expenseBy.id,
      paidFromAccountId: expense.paidFromAccount.id,
      description: expense.description ?? "",
    }] });
    document.getElementById("expense-details")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function removeExpense(id: string) {
    if (!window.confirm("Delete this project expense? This cannot be undone.")) return;
    try {
      await deleteExpense.mutateAsync(id);
      setNotice("Expense deleted successfully.");
      window.setTimeout(() => setNotice(""), 2500);
    } catch {
      setNotice("");
    }
  }

  function exportList() {
    if (!activeProject) return;
    exportExpenses.mutate({ ...query, page: undefined, limit: undefined }, { onSuccess: ({ filename, content }) => downloadCsv(filename, content) });
  }

  return (
    <div className="flex flex-col gap-4">
      <SuccessPopup
        open={completion !== null}
        title={completion?.count === 1 ? "Expense Saved" : "Expenses Saved"}
        message={`${completion?.count ?? 0} expense${completion?.count === 1 ? "" : "s"} saved successfully for ${completion?.projectName ?? "the selected project"}.`}
        onClose={continueAddingExpense}
        primaryLabel="Back to Project"
        onPrimary={returnToProject}
        secondaryLabel="Add More Expenses"
        onSecondary={continueAddingExpense}
        dismissOnBackdrop={false}
        dismissOnEscape={false}
      />
      {notice && <div className="fixed right-5 top-16 z-50 rounded-md bg-biz-success px-4 py-2 text-[12px] font-semibold text-white shadow-lg">{notice}</div>}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-page-title text-biz-text">Add Project Expense</h1><p className="mt-1 text-[13px] text-biz-muted">Enter expense information against an ongoing project / work</p></div>
        <Link href={backHref}><SecondaryButton className="h-10"><ArrowLeft className="h-4 w-4" /> {returnTo ? "Back to Project" : "Back to List"}</SecondaryButton></Link>
      </div>

      <section className="rounded-lg border border-biz-border bg-white p-4 shadow-card">
        <h2 className="text-[14px] font-bold text-biz-text">{isLinkedProject ? "1. Selected Ongoing Project" : "1. Search & Select Ongoing Project"}</h2>
        {!isLinkedProject && <div className="relative mt-3 flex gap-3">
          <div className="relative flex-1"><TextInput icon={Search} value={projectSearch} onFocus={() => setSelectingProject(true)} onChange={(event) => { setProjectSearch(event.target.value); setSelectingProject(true); }} placeholder="Search by Project Name or Organization..." />
            {selectingProject && <div className="absolute left-0 right-0 top-12 z-30 max-h-56 overflow-y-auto rounded-md border border-biz-border bg-white p-1 shadow-lg">{projects.isLoading ? <p className="p-3 text-[12px] text-biz-muted">Searching projects...</p> : (projects.data?.items ?? []).length ? projects.data!.items.map((project) => <button key={project.id} type="button" onClick={() => selectProject(project)} className="block w-full rounded-sm px-3 py-2 text-left hover:bg-biz-bg"><span className="block text-[12px] font-semibold text-biz-text">{project.workName}</span><span className="text-[11px] text-biz-muted">{project.organizationMaster.shortName} · {project.workCategory}</span></button>) : <p className="p-3 text-[12px] text-biz-muted">No ongoing projects found.</p>}</div>}
          </div>
          <SecondaryButton onClick={() => { setProjectSearch(""); setSelectingProject(true); }} className="h-11 px-5"><RotateCcw className="h-4 w-4" /> Clear</SecondaryButton>
        </div>}
        {isLinkedProject && linkedWork.isLoading ? <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50/50 px-4 py-6 text-center text-[12px] text-biz-muted">Loading the selected project...</div>
          : isLinkedProject && linkedWork.isError ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-biz-danger"><span>Could not load the selected ongoing project.</span><button type="button" className="font-semibold underline" onClick={() => linkedWork.refetch()}>Retry</button></div>
          : isLinkedProject && linkedWork.data && !linkedProjectIsOngoing ? <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] text-amber-800">Expenses can only be added to an ongoing project.</div>
          : activeProject ? <div className="mt-4 flex flex-col gap-4 rounded-lg border border-blue-200 bg-blue-50/60 p-4 sm:flex-row sm:items-center">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-biz-blue"><BriefcaseBusiness className="h-7 w-7" /></div>
          <div className="min-w-0 flex-1"><p className="text-[11px] font-medium text-biz-muted">Selected Project</p><h3 className="mt-0.5 truncate text-[18px] font-bold text-biz-blue">{activeProject.workName}</h3><div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-biz-muted"><span>Organization: <strong className="text-biz-text">{activeProject.organizationMaster.shortName}</strong></span><span>Work Category: <strong className="text-biz-text">{activeProject.workCategory}</strong></span><span>Work Value: <strong className="text-biz-text">BDT {money(activeProject.contractValue)}</strong></span></div></div>
          {!isLinkedProject && <button type="button" onClick={() => { if (!form.formState.isDirty || window.confirm("Discard unsaved expense changes?")) { setSelectingProject(true); setSelectedProject(null); setProjectSearch(""); } }} className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-sm border border-biz-blue bg-white px-3 text-[12px] font-semibold text-biz-blue"><Pencil className="h-3.5 w-3.5" /> Change Project</button>}
        </div> : <div className="mt-4 rounded-md border border-dashed border-biz-border px-4 py-8 text-center text-[12px] text-biz-muted">Search and select an ongoing project.</div>}
      </section>

      <section id="expense-details" className="scroll-mt-4 rounded-lg border border-biz-border bg-white p-4 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[14px] font-bold text-biz-text">2. {editingId ? "Edit Expense" : "Expense Batch"}</h2>
            <p className="mt-1 text-[11px] text-biz-muted">
              {editingId ? "Update this expense and save the changes." : "Add each expense as a separate row. Nothing is posted until you save the full batch."}
            </p>
          </div>
          {!editingId && <span className="rounded-full bg-blue-50 px-3 py-1 text-[11px] font-semibold text-biz-blue">{expenseFields.fields.length} Expense{expenseFields.fields.length === 1 ? "" : "s"}</span>}
        </div>
        <form onSubmit={(event) => { void form.handleSubmit(onSubmit)(event); }} className="mt-4">
          <fieldset disabled={!activeProject || (!editingId && !canCreate) || (!!editingId && !canUpdate)} className="space-y-3">
            {expenseFields.fields.map((field, index) => {
              const errors = form.formState.errors.expenses?.[index];
              return <div key={field.id} className="rounded-lg border border-biz-border bg-biz-bg/25 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-[11px] font-bold text-biz-blue">{index + 1}</span>
                    <div><p className="text-[12px] font-bold text-biz-text">Expense {index + 1}</p><p className="text-[10px] text-biz-muted">Separate project expense record</p></div>
                  </div>
                  {!editingId && expenseFields.fields.length > 1 && <button type="button" aria-label={`Remove expense ${index + 1}`} title="Remove expense" onClick={() => expenseFields.remove(index)} className="flex h-8 items-center gap-1.5 rounded-sm border border-red-200 bg-white px-2.5 text-[11px] font-semibold text-biz-danger hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /> Remove</button>}
                </div>
                <div className="grid grid-cols-1 gap-x-4 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
                  <FormField label="Expense Date" required error={errors?.expenseDate?.message}><TextInput type="date" {...form.register(`expenses.${index}.expenseDate`)} /></FormField>
                  <FormField label="Expense For / Expense Head" required error={errors?.expenseHeadId?.message}><SelectInput placeholder="Select expense head" options={(heads.data ?? []).map((item) => ({ label: item.name, value: item.id }))} {...form.register(`expenses.${index}.expenseHeadId`)} /></FormField>
                  <FormField label="Amount (BDT)" required error={errors?.amount?.message}><TextInput type="number" step="0.01" min="0.01" placeholder="85,000.00" {...form.register(`expenses.${index}.amount`)} /></FormField>
                  <FormField label="Expense By / Through" required error={errors?.expenseById?.message}><SelectInput placeholder="Select person" options={(people.data ?? []).map((item) => ({ label: item.name, value: item.id }))} {...form.register(`expenses.${index}.expenseById`)} /></FormField>
                  <FormField label="Paid From" required error={errors?.paidFromAccountId?.message}><SelectInput placeholder="Select account" options={activeAccounts.map((item) => ({ label: `${item.accountName}${item.accountNumber ? ` (${item.accountNumber})` : ""}`, value: item.id }))} {...form.register(`expenses.${index}.paidFromAccountId`)} /></FormField>
                  <FormField label="Description / Remarks" error={errors?.description?.message}><TextInput placeholder="LED Module purchase for main screen" {...form.register(`expenses.${index}.description`)} /></FormField>
                </div>
              </div>;
            })}
          </fieldset>
          {!editingId && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50/50 p-3">
            <SecondaryButton type="button" onClick={addAnotherExpense} disabled={!activeProject || !canCreate || expenseFields.fields.length >= MAX_BATCH_EXPENSES}><Plus className="h-4 w-4" /> Add Another Expense</SecondaryButton>
            <div className="flex min-w-[280px] overflow-hidden rounded-md border border-blue-100 bg-white text-center">
              <div className="flex-1 border-r border-blue-100 px-4 py-2"><p className="text-[10px] font-medium text-biz-muted">Total Expenses</p><p className="mt-0.5 text-[15px] font-bold text-biz-blue">{expenseFields.fields.length}</p></div>
              <div className="flex-[1.4] px-4 py-2"><p className="text-[10px] font-medium text-biz-muted">Batch Total (BDT)</p><p className="mt-0.5 text-[15px] font-bold text-biz-success">{batchTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p></div>
            </div>
          </div>}
          {(createExpensesBatch.isError || updateExpense.isError) && <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-biz-danger">No expense was saved. Please check the highlighted fields and try again.</p>}
          <div className="mt-5 flex flex-wrap justify-end gap-3 border-t border-biz-border pt-4">
            <SecondaryButton type="button" onClick={resetExpenseForm}>{editingId ? "Cancel Edit" : "Reset Batch"}</SecondaryButton>
            {editingId ? <PrimaryButton type="submit" disabled={!activeProject || updateExpense.isPending || !canUpdate}><Save className="h-4 w-4" /> {updateExpense.isPending ? "Saving..." : "Update Expense"}</PrimaryButton> : <>
              <PrimaryButton type="submit" disabled={!activeProject || createExpensesBatch.isPending || !canCreate}><Save className="h-4 w-4" /> {createExpensesBatch.isPending ? "Saving Batch..." : `Save All Expenses (${expenseFields.fields.length})`}</PrimaryButton>
            </>}
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-biz-border bg-white shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-biz-border p-4"><div><h2 className="text-[14px] font-bold text-biz-text">Project Expense List</h2><p className="mt-0.5 text-[11px] text-biz-muted">All expenses for the selected project</p></div><div className="relative flex flex-wrap items-center gap-2"><TextInput icon={Search} value={listSearch} onChange={(event) => { setListSearch(event.target.value); setPage(1); }} placeholder="Search in list..." className="h-9 w-48" /><SecondaryButton size="sm" onClick={() => setFilterOpen((value) => !value)}><Filter className="h-4 w-4" /> Filter</SecondaryButton>{canExport && <SecondaryButton size="sm" onClick={exportList} disabled={!activeProject || exportExpenses.isPending}><Download className="h-4 w-4" /> {exportExpenses.isPending ? "Exporting..." : "Export"}</SecondaryButton>}
          {filterOpen && <div className="absolute right-0 top-11 z-30 grid w-[520px] max-w-[calc(100vw-3rem)] grid-cols-2 gap-3 rounded-md border border-biz-border bg-white p-4 shadow-lg"><SelectInput placeholder="All expense heads" value={filters.expenseHeadId} onChange={(e) => { setFilters((f) => ({ ...f, expenseHeadId: e.target.value })); setPage(1); }} options={(heads.data ?? []).map((item) => ({ label: item.name, value: item.id }))} /><SelectInput placeholder="All people" value={filters.expenseById} onChange={(e) => { setFilters((f) => ({ ...f, expenseById: e.target.value })); setPage(1); }} options={(people.data ?? []).map((item) => ({ label: item.name, value: item.id }))} /><SelectInput placeholder="All accounts" value={filters.paidFromAccountId} onChange={(e) => { setFilters((f) => ({ ...f, paidFromAccountId: e.target.value })); setPage(1); }} options={(accounts.data ?? []).map((item) => ({ label: item.accountName, value: item.id }))} /><div className="grid grid-cols-2 gap-2"><TextInput type="date" value={filters.fromDate} onChange={(e) => setFilters((f) => ({ ...f, fromDate: e.target.value }))} /><TextInput type="date" min={filters.fromDate} value={filters.toDate} onChange={(e) => setFilters((f) => ({ ...f, toDate: e.target.value }))} /></div><button type="button" className="col-span-2 h-9 rounded-sm border border-biz-border text-[12px] font-semibold text-biz-text" onClick={() => { setFilters({ expenseHeadId: "", expenseById: "", paidFromAccountId: "", fromDate: "", toDate: "" }); setFilterOpen(false); setPage(1); }}>Clear Filters</button></div>}
        </div></div>
        {(expenses.isError || deleteExpense.isError || exportExpenses.isError) && <div className="mx-4 mt-3 flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-biz-danger"><span>Could not load or update project expenses.</span><button type="button" className="font-semibold underline" onClick={() => expenses.refetch()}>Retry</button></div>}
        <div className="overflow-x-auto"><table className="w-full min-w-[1120px] border-collapse text-left"><thead className="bg-[#f4f7fb] text-[11px] font-semibold text-biz-text"><tr className="border-b border-biz-border"><th className="w-12 px-4 py-2.5">SL</th><th className="w-28 px-4 py-2.5">Expense Date</th><th className="w-40 px-4 py-2.5">Expense For / Head</th><th className="w-32 px-4 py-2.5 text-right">Amount (BDT)</th><th className="w-40 px-4 py-2.5">Expense By / Through</th><th className="w-36 px-4 py-2.5">Paid From</th><th className="px-4 py-2.5">Description</th><th className="w-24 px-4 py-2.5 text-center">Action</th></tr></thead><tbody className="text-[11px] text-biz-text">{expenses.isLoading ? Array.from({ length: 5 }).map((_, index) => <tr key={index}><td colSpan={8} className="px-4 py-2.5"><div className="h-5 animate-pulse bg-slate-100" /></td></tr>) : rows.length === 0 ? <tr><td colSpan={8} className="px-4 py-10 text-center text-[12px] text-biz-muted">No project expenses found.</td></tr> : rows.map((expense, index) => <tr key={expense.id} className="border-b border-biz-border last:border-0 hover:bg-biz-bg/60"><td className="px-4 py-2.5 text-biz-muted">{(meta.page - 1) * meta.limit + index + 1}</td><td className="px-4 py-2.5">{shortDate(expense.expenseDate)}</td><td className="px-4 py-2.5 font-medium">{expense.expenseHead.name}</td><td className="px-4 py-2.5 text-right tabular-nums">{money(expense.amount)}</td><td className="px-4 py-2.5">{expense.expenseBy.name}</td><td className="px-4 py-2.5">{expense.paidFromAccount.accountName}</td><td className="px-4 py-2.5">{expense.description || "--"}</td><td className="px-4 py-2 text-center"><div className="inline-flex gap-1.5">{canUpdate && <button type="button" aria-label="Edit expense" title="Edit" onClick={() => editExpense(expense)} className="flex h-7 w-7 items-center justify-center rounded-sm border border-blue-200 bg-blue-50 text-biz-blue"><Pencil className="h-3.5 w-3.5" /></button>}{canDelete && <button type="button" aria-label="Delete expense" title="Delete" onClick={() => removeExpense(expense.id)} disabled={deleteExpense.isPending} className="flex h-7 w-7 items-center justify-center rounded-sm border border-red-200 bg-red-50 text-biz-danger"><Trash2 className="h-3.5 w-3.5" /></button>}</div></td></tr>)}</tbody></table></div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-biz-border px-4 py-3 text-[11px] text-biz-muted"><span>Showing {meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1} to {Math.min(meta.page * meta.limit, meta.total)} of {meta.total} entries</span><div className="flex gap-1"><button type="button" disabled={meta.page <= 1} onClick={() => setPage(1)} className="h-8 min-w-8 rounded-sm border border-biz-border disabled:text-slate-300">&lt;&lt;</button><button type="button" disabled={meta.page <= 1} onClick={() => setPage(meta.page - 1)} className="h-8 min-w-8 rounded-sm border border-biz-border disabled:text-slate-300">&lt;</button>{Array.from({ length: meta.totalPages }, (_, index) => index + 1).map((number) => <button key={number} type="button" onClick={() => setPage(number)} className={`h-8 min-w-8 rounded-sm border px-2 font-semibold ${number === meta.page ? "border-biz-blue bg-biz-blue text-white" : "border-biz-border bg-white text-biz-text"}`}>{number}</button>)}<button type="button" disabled={meta.page >= meta.totalPages} onClick={() => setPage(meta.page + 1)} className="h-8 min-w-8 rounded-sm border border-biz-border disabled:text-slate-300">&gt;</button><button type="button" disabled={meta.page >= meta.totalPages} onClick={() => setPage(meta.totalPages)} className="h-8 min-w-8 rounded-sm border border-biz-border disabled:text-slate-300">&gt;&gt;</button></div></div>
      </section>
    </div>
  );
}

export default function ProjectExpensePage() {
  return (
    <React.Suspense fallback={<div className="rounded-lg border border-biz-border bg-white p-8 text-center text-[12px] text-biz-muted shadow-card">Loading project expense...</div>}>
      <ProjectExpensePageContent />
    </React.Suspense>
  );
}
