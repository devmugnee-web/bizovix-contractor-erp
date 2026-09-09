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
  useCreateExpenseHead,
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
import { PrimaryButton, SecondaryButton, SelectInput, TextInput } from "@bizovix/ui";
import { SuccessPopup } from "@/components/layout/SuccessPopup";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

const PAGE_SIZE = 5;
const MAX_BATCH_EXPENSES = 50;
const CUSTOM_EXPENSE_HEAD_ID = "__custom_expense_head__";
type ExpenseDraftInput = Omit<ProjectExpenseFormValues, "amount"> & {
  amount: number | "";
  customExpenseHeadName?: string;
};
interface ProjectExpenseBatchFormInput {
  expenses: ExpenseDraftInput[];
}
interface ProjectExpenseBatchFormValues {
  expenses: Array<ProjectExpenseFormValues & { customExpenseHeadName?: string }>;
}
const projectExpenseEntrySchema = projectExpenseSchema
  .extend({
    customExpenseHeadName: z
      .string()
      .trim()
      .max(100, "Custom expense head is too long")
      .optional(),
  })
  .superRefine((expense, context) => {
    if (
      expense.expenseHeadId === CUSTOM_EXPENSE_HEAD_ID &&
      !expense.customExpenseHeadName?.trim()
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customExpenseHeadName"],
        message: "Custom expense head is required",
      });
    }
  });
const projectExpenseBatchSchema = z.object({
  expenses: z.array(projectExpenseEntrySchema).min(1).max(MAX_BATCH_EXPENSES),
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
    customExpenseHeadName: defaults.customExpenseHeadName ?? "",
  };
}

function compactExpenseFieldClass(hasError: boolean) {
  return `h-9 min-w-0 w-full text-[11px] ${
    hasError
      ? "!border-red-400 !bg-red-50/70 ring-1 ring-inset ring-red-200 focus:!border-red-500 xl:!border"
      : "xl:!rounded-none xl:!border-0 xl:!bg-transparent xl:shadow-none xl:focus:!bg-white xl:focus:!ring-2 xl:focus:!ring-inset xl:focus:!ring-blue-200"
  }`;
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
  const createExpenseHead = useCreateExpenseHead();
  const people = useExpensePeople();
  const accounts = useBankAccounts();
  const activeAccounts = React.useMemo(() => (accounts.data ?? []).filter((account) => account.isActive), [accounts.data]);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(PAGE_SIZE);
  const [listSearch, setListSearch] = React.useState("");
  const deferredListSearch = React.useDeferredValue(listSearch.trim());
  const [filterOpen, setFilterOpen] = React.useState(false);
  const [filters, setFilters] = React.useState({ expenseHeadId: "", expenseById: "", paidFromAccountId: "", fromDate: "", toDate: "" });
  const query: ProjectExpenseQuery = {
    workId: activeProject?.id ?? "",
    page,
    limit: pageSize,
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
  const meta = expenses.data?.meta ?? { page: 1, limit: pageSize, total: 0, totalPages: 1 };
  const invalidExpenseRows = expenseFields.fields.flatMap((_, index) =>
    form.formState.errors.expenses?.[index] ? [index + 1] : [],
  );

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
    submittingRef.current = true;
    try {
      const resolvedCustomHeads = new Map<string, string>();
      const payloads: SaveProjectExpenseInput[] = [];
      for (const expense of values.expenses) {
        let expenseHeadId = expense.expenseHeadId;
        if (expenseHeadId === CUSTOM_EXPENSE_HEAD_ID) {
          const customName = expense.customExpenseHeadName?.trim() ?? "";
          const customKey = customName.toLowerCase();
          const existingHead = (heads.data ?? []).find(
            (head) => head.name.trim().toLowerCase() === customKey,
          );
          expenseHeadId = existingHead?.id ?? resolvedCustomHeads.get(customKey) ?? "";
          if (!expenseHeadId) {
            const createdHead = await createExpenseHead.mutateAsync({ name: customName });
            expenseHeadId = createdHead.id;
            resolvedCustomHeads.set(customKey, createdHead.id);
          }
        }
        payloads.push({
          workId: activeProject.id,
          expenseDate: expense.expenseDate,
          expenseHeadId,
          amount: Number(expense.amount),
          expenseById: expense.expenseById,
          paidFromAccountId: expense.paidFromAccountId,
          description: expense.description || undefined,
        });
      }

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
      const previousPayload = payloads.at(-1);
      form.reset({ expenses: [createExpenseDraft({
        expenseDate: previous?.expenseDate,
        expenseHeadId: previousPayload?.expenseHeadId,
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

  React.useEffect(() => {
    if (!completion) return;
    const savedCount = completion.count;
    setNotice(`${savedCount} expense${savedCount === 1 ? "" : "s"} saved successfully.`);
    continueAddingExpense();
    window.requestAnimationFrame(() => {
      const listHeading = Array.from(document.querySelectorAll("h2")).find((heading) => heading.textContent?.includes("Project Expense List"));
      listHeading?.closest("section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    window.setTimeout(() => setNotice(""), 2500);
    // Run only when a completed save batch is received.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completion]);

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
        open={false}
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-page-title text-biz-text">Add Project Expense</h1><p className="mt-0.5 text-[12px] text-biz-muted">Enter expense information against an ongoing project / work</p></div>
        <Link href={backHref}><SecondaryButton className="h-9"><ArrowLeft className="h-4 w-4" /> {returnTo ? "Back to Project" : "Back to List"}</SecondaryButton></Link>
      </div>

      <section className="rounded-lg border border-blue-100 bg-gradient-to-r from-white to-blue-50/40 px-4 py-3 shadow-sm">
        {!isLinkedProject && <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-biz-blue">1</span>
          <h2 className="text-[13px] font-bold text-biz-text">Search & Select Ongoing Project</h2>
        </div>}
        {!isLinkedProject && <div className="relative mt-3 flex gap-3">
          <div className="relative flex-1"><TextInput icon={Search} value={projectSearch} onFocus={() => setSelectingProject(true)} onChange={(event) => { setProjectSearch(event.target.value); setSelectingProject(true); }} placeholder="Search by Project Name or Organization..." />
            {selectingProject && <div className="absolute left-0 right-0 top-12 z-30 max-h-56 overflow-y-auto rounded-md border border-biz-border bg-white p-1 shadow-lg">{projects.isLoading ? <p className="p-3 text-[12px] text-biz-muted">Searching projects...</p> : (projects.data?.items ?? []).length ? projects.data!.items.map((project) => <button key={project.id} type="button" onClick={() => selectProject(project)} className="block w-full rounded-sm px-3 py-2 text-left hover:bg-biz-bg"><span className="block text-[12px] font-semibold text-biz-text">{project.workName}</span><span className="text-[11px] text-biz-muted">{project.organizationMaster.shortName} · {project.workCategory}</span></button>) : <p className="p-3 text-[12px] text-biz-muted">No ongoing projects found.</p>}</div>}
          </div>
          <SecondaryButton onClick={() => { setProjectSearch(""); setSelectingProject(true); }} className="h-11 px-5"><RotateCcw className="h-4 w-4" /> Clear</SecondaryButton>
        </div>}
        {isLinkedProject && linkedWork.isLoading ? <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50/50 px-4 py-6 text-center text-[12px] text-biz-muted">Loading the selected project...</div>
          : isLinkedProject && linkedWork.isError ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-biz-danger"><span>Could not load the selected ongoing project.</span><button type="button" className="font-semibold underline" onClick={() => linkedWork.refetch()}>Retry</button></div>
          : isLinkedProject && linkedWork.data && !linkedProjectIsOngoing ? <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] text-amber-800">Expenses can only be added to an ongoing project.</div>
          : activeProject ? <div className={`${isLinkedProject ? "" : "mt-2.5 border-t border-blue-100 pt-3"} flex flex-col gap-3 sm:flex-row sm:items-center`}>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-blue-100 text-biz-blue"><BriefcaseBusiness className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1"><h3 className="whitespace-normal break-words text-[15px] font-bold leading-5 text-biz-blue">{activeProject.workName}</h3><div className="mt-1.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-[10px] text-biz-muted"><span className="rounded-full border border-blue-200 bg-blue-50/70 px-2 py-0.5 text-biz-blue">Tender ID: <strong>{activeProject.tenderNumber ?? "--"}</strong></span><span>Organization: <strong className="text-biz-text">{activeProject.organizationMaster.shortName}</strong></span><span>Work Category: <strong className="text-biz-text">{activeProject.workCategory}</strong></span><span>Work Value: <strong className="text-biz-text">BDT {money(activeProject.contractValue)}</strong></span></div></div>
          {!isLinkedProject && <button type="button" onClick={() => { if (!form.formState.isDirty || window.confirm("Discard unsaved expense changes?")) { setSelectingProject(true); setSelectedProject(null); setProjectSearch(""); } }} className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-sm border border-biz-blue bg-white px-3 text-[12px] font-semibold text-biz-blue"><Pencil className="h-3.5 w-3.5" /> Change Project</button>}
        </div> : <div className="mt-4 rounded-md border border-dashed border-biz-border px-4 py-8 text-center text-[12px] text-biz-muted">Search and select an ongoing project.</div>}
      </section>

      <section id="expense-details" className="scroll-mt-4 rounded-lg border border-biz-border border-t-2 border-t-biz-blue bg-white p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[14px] font-bold text-biz-text">2. {editingId ? "Edit Expense" : "Expense Entry Sheet"}</h2>
            <p className="mt-1 text-[11px] text-biz-muted">
              {editingId ? "Update this expense and save the changes." : "Enter one expense per row. Use Tab to move across cells and save the full sheet together."}
            </p>
          </div>
          {!editingId && (
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-[10px] font-bold text-biz-blue">
                {expenseFields.fields.length} ROW{expenseFields.fields.length === 1 ? "" : "S"}
              </span>
              <button
                type="button"
                onClick={addAnotherExpense}
                disabled={!activeProject || !canCreate || expenseFields.fields.length >= MAX_BATCH_EXPENSES}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-biz-blue px-4 text-[11px] font-bold text-white shadow-[0_7px_18px_rgba(20,99,255,0.24)] transition hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-[0_9px_22px_rgba(20,99,255,0.3)] disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-blue-300 disabled:shadow-none"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20"><Plus className="h-3.5 w-3.5" /></span>
                Add Expense Row
              </button>
            </div>
          )}
        </div>
        <form onSubmit={(event) => { void form.handleSubmit(onSubmit)(event); }} className="mt-4">
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="hidden grid-cols-[38px_minmax(112px,0.82fr)_minmax(140px,1.2fr)_minmax(145px,1.15fr)_minmax(100px,0.72fr)_minmax(130px,1fr)_minmax(140px,1.05fr)_42px] items-stretch gap-0 border-b border-blue-100 bg-gradient-to-r from-slate-50 to-blue-50/70 p-0 text-[10px] font-bold text-slate-600 [&>span]:flex [&>span]:items-center [&>span]:border-r [&>span]:border-slate-200 [&>span]:px-2 [&>span]:py-2.5 [&>span:last-child]:justify-center [&>span:last-child]:border-r-0 xl:grid">
              <span className="text-center">SL</span>
              <span>Expense Date <span className="text-biz-danger">*</span></span>
              <span>Description / Remarks</span>
              <span>Expense For / Head <span className="text-biz-danger">*</span></span>
              <span>Amount (BDT) <span className="text-biz-danger">*</span></span>
              <span>Expense By / Through <span className="text-biz-danger">*</span></span>
              <span>Paid From <span className="text-biz-danger">*</span></span>
              <span className="text-center">Action</span>
            </div>
            <fieldset disabled={!activeProject || (!editingId && !canCreate) || (!!editingId && !canUpdate)} className="divide-y divide-biz-border">
              {expenseFields.fields.map((field, index) => {
                const errors = form.formState.errors.expenses?.[index];
                const rowHasError = Boolean(errors);
                const customHeadSelected = watchedExpenses[index]?.expenseHeadId === CUSTOM_EXPENSE_HEAD_ID;
                const headError = customHeadSelected
                  ? errors?.customExpenseHeadName
                  : errors?.expenseHeadId;
                return (
                  <div
                    key={field.id}
                    className={`grid grid-cols-1 gap-3 px-3 py-3 transition-colors sm:grid-cols-2 xl:grid-cols-[38px_minmax(112px,0.82fr)_minmax(140px,1.2fr)_minmax(145px,1.15fr)_minmax(100px,0.72fr)_minmax(130px,1fr)_minmax(140px,1.05fr)_42px] xl:items-stretch xl:gap-0 xl:px-0 xl:py-0 ${
                      rowHasError
                        ? "bg-red-50/30 shadow-[inset_3px_0_0_#ef4444]"
                        : "bg-white hover:bg-slate-50/70 focus-within:bg-blue-50/30 focus-within:shadow-[inset_3px_0_0_#1463ff]"
                    }`}
                  >
                    <div className="col-span-full flex items-center gap-2 xl:col-span-1 xl:justify-center xl:border-r xl:border-biz-border">
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${rowHasError ? "bg-red-100 text-biz-danger" : "bg-blue-100 text-biz-blue"}`}>{index + 1}</span>
                      <span className="text-[11px] font-semibold text-biz-text xl:hidden">Expense {index + 1}</span>
                    </div>

                    <div className="min-w-0 xl:flex xl:items-center xl:border-r xl:border-biz-border xl:px-1 xl:py-1.5">
                      <p className="mb-1 text-[10px] font-semibold text-biz-muted xl:sr-only">Expense Date <span className="text-biz-danger">*</span></p>
                      <TextInput
                        type="date"
                        aria-label={`Expense ${index + 1} date`}
                        aria-invalid={Boolean(errors?.expenseDate)}
                        title={errors?.expenseDate?.message}
                        className={compactExpenseFieldClass(Boolean(errors?.expenseDate))}
                        {...form.register(`expenses.${index}.expenseDate`)}
                      />
                    </div>

                    <div className="min-w-0 xl:flex xl:items-center xl:border-r xl:border-biz-border xl:px-1 xl:py-1.5">
                      <p className="mb-1 text-[10px] font-semibold text-biz-muted xl:sr-only">Description / Remarks</p>
                      <TextInput
                        aria-label={`Expense ${index + 1} description`}
                        aria-invalid={Boolean(errors?.description)}
                        title={errors?.description?.message}
                        className={compactExpenseFieldClass(Boolean(errors?.description))}
                        placeholder="Expense details"
                        onKeyDown={(event) => {
                          if (
                            event.key === "Enter" &&
                            !editingId &&
                            index === expenseFields.fields.length - 1 &&
                            expenseFields.fields.length < MAX_BATCH_EXPENSES
                          ) {
                            event.preventDefault();
                            addAnotherExpense();
                          }
                        }}
                        {...form.register(`expenses.${index}.description`)}
                      />
                    </div>

                    <div className="min-w-0 xl:flex xl:items-center xl:border-r xl:border-biz-border xl:px-1 xl:py-1.5">
                      <p className="mb-1 text-[10px] font-semibold text-biz-muted xl:sr-only">Expense For / Head <span className="text-biz-danger">*</span></p>
                      {customHeadSelected ? (
                        <div className="flex min-w-0 flex-1 items-center gap-1">
                          <TextInput
                            aria-label={`Expense ${index + 1} custom head`}
                            aria-invalid={Boolean(errors?.customExpenseHeadName)}
                            title={errors?.customExpenseHeadName?.message}
                            className={compactExpenseFieldClass(Boolean(errors?.customExpenseHeadName))}
                            placeholder="Type custom head"
                            maxLength={100}
                            {...form.register(`expenses.${index}.customExpenseHeadName`)}
                          />
                          <button
                            type="button"
                            aria-label="Choose a saved expense head"
                            title="Back to saved expense heads"
                            onClick={() => {
                              form.setValue(`expenses.${index}.expenseHeadId`, heads.data?.[0]?.id ?? "", { shouldDirty: true, shouldValidate: true });
                              form.setValue(`expenses.${index}.customExpenseHeadName`, "", { shouldDirty: true });
                            }}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-blue-200 bg-blue-50 text-biz-blue hover:bg-blue-100"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <SelectInput
                          aria-label={`Expense ${index + 1} head`}
                          aria-invalid={Boolean(headError)}
                          title={headError?.message}
                          className={compactExpenseFieldClass(Boolean(headError))}
                          placeholder="Select expense head"
                          options={[
                            ...(heads.data ?? []).map((item) => ({ label: item.name, value: item.id })),
                            { label: "+ Custom expense head", value: CUSTOM_EXPENSE_HEAD_ID },
                          ]}
                          {...form.register(`expenses.${index}.expenseHeadId`)}
                          onChange={(event) => {
                            form.setValue(`expenses.${index}.expenseHeadId`, event.target.value, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
                            if (event.target.value === CUSTOM_EXPENSE_HEAD_ID) {
                              window.requestAnimationFrame(() => form.setFocus(`expenses.${index}.customExpenseHeadName`));
                            }
                          }}
                        />
                      )}
                    </div>

                    <div className="min-w-0 xl:flex xl:items-center xl:border-r xl:border-biz-border xl:px-1 xl:py-1.5">
                      <p className="mb-1 text-[10px] font-semibold text-biz-muted xl:sr-only">Amount (BDT) <span className="text-biz-danger">*</span></p>
                      <TextInput
                        type="number"
                        step="0.01"
                        min="0.01"
                        aria-label={`Expense ${index + 1} amount`}
                        aria-invalid={Boolean(errors?.amount)}
                        title={errors?.amount?.message}
                        className={compactExpenseFieldClass(Boolean(errors?.amount))}
                        placeholder="85,000.00"
                        {...form.register(`expenses.${index}.amount`)}
                      />
                    </div>

                    <div className="min-w-0 xl:flex xl:items-center xl:border-r xl:border-biz-border xl:px-1 xl:py-1.5">
                      <p className="mb-1 text-[10px] font-semibold text-biz-muted xl:sr-only">Expense By / Through <span className="text-biz-danger">*</span></p>
                      <SelectInput
                        aria-label={`Expense ${index + 1} person`}
                        aria-invalid={Boolean(errors?.expenseById)}
                        title={errors?.expenseById?.message}
                        className={compactExpenseFieldClass(Boolean(errors?.expenseById))}
                        placeholder="Select person"
                        options={(people.data ?? []).map((item) => ({ label: item.name, value: item.id }))}
                        {...form.register(`expenses.${index}.expenseById`)}
                      />
                    </div>

                    <div className="min-w-0 xl:flex xl:items-center xl:border-r xl:border-biz-border xl:px-1 xl:py-1.5">
                      <p className="mb-1 text-[10px] font-semibold text-biz-muted xl:sr-only">Paid From <span className="text-biz-danger">*</span></p>
                      <SelectInput
                        aria-label={`Expense ${index + 1} paid from account`}
                        aria-invalid={Boolean(errors?.paidFromAccountId)}
                        title={errors?.paidFromAccountId?.message}
                        className={compactExpenseFieldClass(Boolean(errors?.paidFromAccountId))}
                        placeholder="Select account"
                        options={activeAccounts.map((item) => ({ label: `${item.accountName}${item.accountNumber ? ` (${item.accountNumber})` : ""}`, value: item.id }))}
                        {...form.register(`expenses.${index}.paidFromAccountId`)}
                      />
                    </div>

                    <div className="col-span-full flex justify-end xl:col-span-1 xl:items-center xl:justify-center">
                      {!editingId && expenseFields.fields.length > 1 ? (
                        <button
                          type="button"
                          aria-label={`Remove expense ${index + 1}`}
                          title="Remove expense"
                          onClick={() => expenseFields.remove(index)}
                          className="flex h-8 w-8 items-center justify-center rounded-sm border border-red-200 bg-white text-biz-danger hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <span className="hidden text-biz-muted xl:inline">--</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </fieldset>
            {!editingId && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-blue-100 bg-gradient-to-r from-slate-50 to-blue-50/60 px-3 py-2.5">
                <div className="flex items-center gap-2 text-[10px] text-biz-muted">
                  <span className="hidden rounded border border-slate-200 bg-white px-1.5 py-0.5 font-semibold text-slate-500 md:inline">TAB</span>
                  <span>Move across cells</span>
                  <span className="text-slate-300">|</span>
                  <span className="hidden md:inline">Press Enter in the last Description cell to add a row</span>
                </div>
                <div className="flex items-center gap-4 text-[11px]">
                  <span className="text-biz-muted"><strong className="text-biz-blue">{expenseFields.fields.length}</strong> expense{expenseFields.fields.length === 1 ? "" : "s"}</span>
                  <span className="h-5 w-px bg-blue-100" />
                  <span className="text-biz-muted">Batch Total <strong className="ml-2 rounded-md bg-emerald-50 px-2.5 py-1 tabular-nums text-biz-success">BDT {batchTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                </div>
              </div>
            )}
          </div>
          {invalidExpenseRows.length > 0 && (
            <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-medium text-biz-danger">
              Complete the highlighted required fields in expense row{invalidExpenseRows.length === 1 ? "" : "s"}: {invalidExpenseRows.join(", ")}.
            </p>
          )}
          {(createExpenseHead.isError || createExpensesBatch.isError || updateExpense.isError) && <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-biz-danger">No expense was saved. Please check the highlighted fields and try again.</p>}
          <div className="mt-5 flex flex-wrap justify-end gap-3 border-t border-biz-border pt-4">
            <SecondaryButton type="button" onClick={resetExpenseForm}>{editingId ? "Cancel Edit" : "Reset Batch"}</SecondaryButton>
            {editingId ? <PrimaryButton type="submit" disabled={!activeProject || createExpenseHead.isPending || updateExpense.isPending || !canUpdate}><Save className="h-4 w-4" /> {createExpenseHead.isPending || updateExpense.isPending ? "Saving..." : "Update Expense"}</PrimaryButton> : <>
              <PrimaryButton type="submit" disabled={!activeProject || createExpenseHead.isPending || createExpensesBatch.isPending || !canCreate}><Save className="h-4 w-4" /> {createExpenseHead.isPending || createExpensesBatch.isPending ? "Saving Batch..." : `Save All Expenses (${expenseFields.fields.length})`}</PrimaryButton>
            </>}
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-biz-border bg-white shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-100 bg-gradient-to-r from-white to-blue-50/50 p-4"><div><h2 className="flex items-center gap-2 text-[14px] font-bold text-biz-text">Project Expense List <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-biz-blue">{meta.total}</span></h2><p className="mt-0.5 text-[11px] text-biz-muted">All expenses for the selected project</p></div><div className="relative flex flex-wrap items-center gap-2"><TextInput icon={Search} value={listSearch} onChange={(event) => { setListSearch(event.target.value); setPage(1); }} placeholder="Search expenses..." className="h-9 w-48 lg:w-60" /><SecondaryButton size="sm" onClick={() => setFilterOpen((value) => !value)}><Filter className="h-4 w-4" /> Filter</SecondaryButton>{canExport && <SecondaryButton size="sm" onClick={exportList} disabled={!activeProject || exportExpenses.isPending}><Download className="h-4 w-4" /> {exportExpenses.isPending ? "Exporting..." : "Export"}</SecondaryButton>}
          {filterOpen && <div className="absolute right-0 top-11 z-30 grid w-[520px] max-w-[calc(100vw-3rem)] grid-cols-2 gap-3 rounded-md border border-biz-border bg-white p-4 shadow-lg"><SelectInput placeholder="All expense heads" value={filters.expenseHeadId} onChange={(e) => { setFilters((f) => ({ ...f, expenseHeadId: e.target.value })); setPage(1); }} options={(heads.data ?? []).map((item) => ({ label: item.name, value: item.id }))} /><SelectInput placeholder="All people" value={filters.expenseById} onChange={(e) => { setFilters((f) => ({ ...f, expenseById: e.target.value })); setPage(1); }} options={(people.data ?? []).map((item) => ({ label: item.name, value: item.id }))} /><SelectInput placeholder="All accounts" value={filters.paidFromAccountId} onChange={(e) => { setFilters((f) => ({ ...f, paidFromAccountId: e.target.value })); setPage(1); }} options={(accounts.data ?? []).map((item) => ({ label: item.accountName, value: item.id }))} /><div className="grid grid-cols-2 gap-2"><TextInput type="date" value={filters.fromDate} onChange={(e) => setFilters((f) => ({ ...f, fromDate: e.target.value }))} /><TextInput type="date" min={filters.fromDate} value={filters.toDate} onChange={(e) => setFilters((f) => ({ ...f, toDate: e.target.value }))} /></div><button type="button" className="col-span-2 h-9 rounded-sm border border-biz-border text-[12px] font-semibold text-biz-text" onClick={() => { setFilters({ expenseHeadId: "", expenseById: "", paidFromAccountId: "", fromDate: "", toDate: "" }); setFilterOpen(false); setPage(1); }}>Clear Filters</button></div>}
        </div></div>
        {(expenses.isError || deleteExpense.isError || exportExpenses.isError) && <div className="mx-4 mt-3 flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-biz-danger"><span>Could not load or update project expenses.</span><button type="button" className="font-semibold underline" onClick={() => expenses.refetch()}>Retry</button></div>}
        <div className="hidden w-full xl:block">
          <table className="w-full table-fixed border-collapse text-left">
            <colgroup><col className="w-[5%]" /><col className="w-[11%]" /><col className="w-[15%]" /><col className="w-[12%]" /><col className="w-[15%]" /><col className="w-[14%]" /><col className="w-[20%]" /><col className="w-[8%]" /></colgroup>
            <thead className="bg-gradient-to-r from-slate-50 to-blue-50/60 text-[10px] font-bold uppercase tracking-[0.02em] text-slate-600">
              <tr className="border-b border-biz-border"><th className="px-2.5 py-2.5 text-center">SL</th><th className="px-2.5 py-2.5">Expense Date</th><th className="px-2.5 py-2.5">Expense For / Head</th><th className="px-2.5 py-2.5 text-right">Amount (BDT)</th><th className="px-2.5 py-2.5">Expense By / Through</th><th className="px-2.5 py-2.5">Paid From</th><th className="px-2.5 py-2.5">Description</th><th className="px-2 py-2.5 text-center">Action</th></tr>
            </thead>
            <tbody className="text-[11px] text-biz-text">
              {expenses.isLoading ? Array.from({ length: 5 }).map((_, index) => <tr key={index}><td colSpan={8} className="px-3 py-2.5"><div className="h-5 animate-pulse rounded bg-slate-100" /></td></tr>) : rows.length === 0 ? <tr><td colSpan={8} className="px-4 py-10 text-center text-[12px] text-biz-muted">No project expenses found.</td></tr> : rows.map((expense, index) => (
                <tr key={expense.id} className="border-b border-biz-border last:border-0 odd:bg-white even:bg-slate-50/35 hover:bg-blue-50/45">
                  <td className="px-2 py-3 text-center text-biz-muted">{(meta.page - 1) * meta.limit + index + 1}</td>
                  <td className="whitespace-nowrap px-2.5 py-3">{shortDate(expense.expenseDate)}</td>
                  <td className="overflow-hidden px-2.5 py-3 font-semibold"><p className="truncate" title={expense.expenseHead.name}>{expense.expenseHead.name}</p></td>
                  <td className="whitespace-nowrap px-2.5 py-3 text-right font-semibold tabular-nums">{money(expense.amount)}</td>
                  <td className="overflow-hidden px-2.5 py-3"><p className="truncate" title={expense.expenseBy.name}>{expense.expenseBy.name}</p></td>
                  <td className="overflow-hidden px-2.5 py-3"><p className="truncate" title={expense.paidFromAccount.accountName}>{expense.paidFromAccount.accountName}</p></td>
                  <td className="overflow-hidden px-2.5 py-3"><p className="truncate text-biz-muted" title={expense.description ?? ""}>{expense.description || "--"}</p></td>
                  <td className="px-1.5 py-2 text-center"><div className="inline-flex gap-1">{canUpdate && <button type="button" aria-label="Edit expense" title="Edit" onClick={() => editExpense(expense)} className="flex h-7 w-7 items-center justify-center rounded-sm border border-blue-200 bg-blue-50 text-biz-blue hover:bg-blue-100"><Pencil className="h-3.5 w-3.5" /></button>}{canDelete && <button type="button" aria-label="Delete expense" title="Delete" onClick={() => removeExpense(expense.id)} disabled={deleteExpense.isPending} className="flex h-7 w-7 items-center justify-center rounded-sm border border-red-200 bg-red-50 text-biz-danger hover:bg-red-100"><Trash2 className="h-3.5 w-3.5" /></button>}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="divide-y divide-biz-border xl:hidden">
          {expenses.isLoading ? Array.from({ length: 3 }).map((_, index) => <div key={index} className="p-3"><div className="h-20 animate-pulse rounded bg-slate-100" /></div>) : rows.length === 0 ? <div className="px-4 py-10 text-center text-[12px] text-biz-muted">No project expenses found.</div> : rows.map((expense, index) => (
            <article key={expense.id} className="p-3 hover:bg-blue-50/30">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[10px] font-semibold text-biz-muted">#{(meta.page - 1) * meta.limit + index + 1} | {shortDate(expense.expenseDate)}</p><h3 className="mt-1 truncate text-[12px] font-bold text-biz-text" title={expense.expenseHead.name}>{expense.expenseHead.name}</h3></div><strong className="shrink-0 text-[12px] tabular-nums text-biz-blue">BDT {money(expense.amount)}</strong></div>
              <div className="mt-2 grid grid-cols-2 gap-2 rounded-md bg-slate-50 p-2 text-[10px]"><div className="min-w-0"><p className="text-biz-muted">Expense By</p><p className="mt-0.5 truncate font-semibold text-biz-text" title={expense.expenseBy.name}>{expense.expenseBy.name}</p></div><div className="min-w-0"><p className="text-biz-muted">Paid From</p><p className="mt-0.5 truncate font-semibold text-biz-text" title={expense.paidFromAccount.accountName}>{expense.paidFromAccount.accountName}</p></div></div>
              <div className="mt-2 flex items-end justify-between gap-3"><p className="line-clamp-2 min-w-0 text-[10px] text-biz-muted">{expense.description || "No description"}</p><div className="inline-flex shrink-0 gap-1">{canUpdate && <button type="button" aria-label="Edit expense" title="Edit" onClick={() => editExpense(expense)} className="flex h-7 w-7 items-center justify-center rounded-sm border border-blue-200 bg-blue-50 text-biz-blue"><Pencil className="h-3.5 w-3.5" /></button>}{canDelete && <button type="button" aria-label="Delete expense" title="Delete" onClick={() => removeExpense(expense.id)} disabled={deleteExpense.isPending} className="flex h-7 w-7 items-center justify-center rounded-sm border border-red-200 bg-red-50 text-biz-danger"><Trash2 className="h-3.5 w-3.5" /></button>}</div></div>
            </article>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-biz-border bg-slate-50/50 px-4 py-3 text-[11px] text-biz-muted">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 font-medium text-biz-text">
              Show
              <select
                aria-label="Rows per page"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
                className="h-8 rounded-sm border border-biz-border bg-white px-2 text-[11px] font-semibold text-biz-text outline-none focus:border-biz-blue focus:ring-2 focus:ring-blue-100"
              >
                {[5, 10, 20, 50].map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
              rows
            </label>
            <span>Showing {meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1} to {Math.min(meta.page * meta.limit, meta.total)} of {meta.total} entries</span>
          </div>
          {meta.totalPages > 1 && <div className="flex gap-1"><button type="button" disabled={meta.page <= 1} onClick={() => setPage(1)} className="h-8 min-w-8 rounded-sm border border-biz-border bg-white disabled:text-slate-300">&lt;&lt;</button><button type="button" disabled={meta.page <= 1} onClick={() => setPage(meta.page - 1)} className="h-8 min-w-8 rounded-sm border border-biz-border bg-white disabled:text-slate-300">&lt;</button>{Array.from({ length: meta.totalPages }, (_, index) => index + 1).map((number) => <button key={number} type="button" onClick={() => setPage(number)} className={`h-8 min-w-8 rounded-sm border px-2 font-semibold ${number === meta.page ? "border-biz-blue bg-biz-blue text-white" : "border-biz-border bg-white text-biz-text"}`}>{number}</button>)}<button type="button" disabled={meta.page >= meta.totalPages} onClick={() => setPage(meta.page + 1)} className="h-8 min-w-8 rounded-sm border border-biz-border bg-white disabled:text-slate-300">&gt;</button><button type="button" disabled={meta.page >= meta.totalPages} onClick={() => setPage(meta.totalPages)} className="h-8 min-w-8 rounded-sm border border-biz-border bg-white disabled:text-slate-300">&gt;&gt;</button></div>}
        </div>
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
