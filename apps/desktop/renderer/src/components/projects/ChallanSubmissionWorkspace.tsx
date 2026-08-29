"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Award,
  Ban,
  Check,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  CloudUpload,
  Download,
  Eye,
  FileCheck2,
  FileText,
  Pencil,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  ApiError,
  downloadDocument as downloadStoredDocument,
  useAddDocumentVersion,
  useApproveChallanSubmission,
  useCancelChallanSubmission,
  useChallanNumberPreview,
  useChallanSubmission,
  useCmsWorks,
  useContracts,
  useCreateChallanSubmission,
  useCreateDocument,
  useProjectBoq,
  useRejectChallanSubmission,
  useReleaseChallanPayment,
  useStartReviewChallanSubmission,
  useSubmitChallanSubmission,
  useUpdateChallanSubmission,
} from "@bizovix/api-client";
import type {
  ChallanSubmissionRecord,
  ChallanSubmissionStatus,
  SaveChallanSubmissionInput,
} from "@bizovix/types";
import { cn } from "@bizovix/ui";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

type WorkflowStage = "Draft" | "Submitted" | "Under Review" | "Approved" | "Payment Released";

interface ChallanItem {
  id: string;
  code: string;
  description: string;
  unit: string;
  quantity: number;
  rate: number;
}

interface ChallanDocument {
  id: string;
  documentType: string;
  name: string;
  required: boolean;
  fileName: string | null;
  fileObject?: File;
  storedDocumentId?: string;
}

interface ChallanFormState {
  challanNo: string;
  challanDate: string;
  description: string;
  challanType: string;
  challanMonth: string;
  fromDate: string;
  toDate: string;
  receivedBy: string;
  receivedAt: string;
  submittedTo: string;
  paymentFrom: string;
  remarks: string;
}

const DOCUMENT_SLOTS = [
  {
    id: "doc-1",
    documentType: "DELIVERY_CHALLAN",
    name: "Delivery Challan / Gate Pass",
    required: true,
  },
  { id: "doc-2", documentType: "SUPPLIER_INVOICE", name: "Supplier Invoice", required: true },
  { id: "doc-3", documentType: "WORK_ORDER_BOQ", name: "Work Order / BOQ", required: true },
  {
    id: "doc-4",
    documentType: "MATERIAL_SPECIFICATION",
    name: "Material Specification",
    required: false,
  },
  { id: "doc-5", documentType: "SITE_RECEIVING_NOTE", name: "Site Receiving Note", required: true },
  {
    id: "doc-6",
    documentType: "OTHER_SUPPORTING_DOCUMENTS",
    name: "Other Supporting Documents",
    required: false,
  },
] as const;

function inputDate(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function monthValue(value: string | Date) {
  return inputDate(value).slice(0, 7);
}

function initialForm(record?: ChallanSubmissionRecord): ChallanFormState {
  const today = new Date();
  const firstDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const lastDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
  return {
    challanNo: record?.challanNo ?? "",
    challanDate: inputDate(record?.challanDate ?? today),
    description: record?.description ?? "",
    challanType: record?.challanType ?? "Material Delivery",
    challanMonth: monthValue(record?.challanMonth ?? today),
    fromDate: inputDate(record?.periodFrom ?? firstDay),
    toDate: inputDate(record?.periodTo ?? lastDay),
    receivedBy: record?.receivedBy ?? "Project Engineer",
    receivedAt: record?.receivedAt ?? "Project Site",
    submittedTo: record?.submittedTo ?? "Project Engineer",
    paymentFrom: record?.paymentFrom ?? "Own Fund",
    remarks: record?.remarks ?? "",
  };
}

function initialItems(record?: ChallanSubmissionRecord): ChallanItem[] {
  return (record?.items ?? []).map((item) => ({
    id: item.id,
    code: item.itemCode ?? "",
    description: item.description,
    unit: item.unit,
    quantity: Number(item.quantity),
    rate: Number(item.rate),
  }));
}

function initialDocuments(record?: ChallanSubmissionRecord): ChallanDocument[] {
  return DOCUMENT_SLOTS.map((slot) => {
    const stored = record?.documents.find(
      (document) => document.documentType === slot.documentType,
    );
    return { ...slot, fileName: stored?.fileName ?? null, storedDocumentId: stored?.id };
  });
}

const WORKFLOW_STAGES: WorkflowStage[] = [
  "Draft",
  "Submitted",
  "Under Review",
  "Approved",
  "Payment Released",
];
const STATUS_STAGE: Partial<Record<ChallanSubmissionStatus, WorkflowStage>> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under Review",
  APPROVED: "Approved",
  PAYMENT_RELEASED: "Payment Released",
};
const STAGE_STATUS: Record<WorkflowStage, ChallanSubmissionStatus> = {
  Draft: "DRAFT",
  Submitted: "SUBMITTED",
  "Under Review": "UNDER_REVIEW",
  Approved: "APPROVED",
  "Payment Released": "PAYMENT_RELEASED",
};
const CONTROL_CLASS =
  "h-[35px] w-full rounded-[5px] border border-[#d9e2ef] bg-white px-3 text-[10.5px] font-medium text-[#10244c] outline-none transition focus:border-[#1769e8] focus:ring-2 focus:ring-[#1769e8]/10";

function formatAmount(value: number) {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "blue" | "green" | "purple" | "orange" | "teal";
}) {
  const tones = {
    blue: "bg-[#e8f2ff] text-[#0b67e8]",
    green: "bg-[#e8f8ed] text-[#35ad62]",
    purple: "bg-[#f0e9ff] text-[#754be2]",
    orange: "bg-[#fff2df] text-[#f59b1b]",
    teal: "bg-[#e4f9f5] text-[#14aa95]",
  };

  return (
    <div className="flex h-[78px] min-w-0 items-center rounded-[7px] border border-[#dde6f1] bg-white px-3 shadow-[0_1px_2px_rgba(15,34,70,0.025)]">
      <span
        className={cn(
          "flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full",
          tones[tone],
        )}
      >
        <Icon className="h-[20px] w-[20px]" />
      </span>
      <span className="ml-3 min-w-0">
        <span className="block truncate text-[9.5px] font-medium text-[#556887]">{label}</span>
        <span
          className={cn(
            "mt-1 block truncate font-bold leading-tight text-[#071b49]",
            value.length > 22 ? "text-[12px]" : "text-[14px]",
          )}
          title={value}
        >
          {value}
        </span>
      </span>
    </div>
  );
}

function FieldLabel({
  children,
  required = false,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <span className="mb-[7px] block text-[9.5px] font-semibold text-[#22385f]">
      {children} {required && <span className="text-[#e23845]">*</span>}
    </span>
  );
}

function IconButton({
  label,
  tone = "default",
  onClick,
  children,
}: {
  label: string;
  tone?: "default" | "danger";
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center rounded-[4px] border bg-white transition",
        tone === "danger"
          ? "border-[#f1d8dc] text-[#ef4656] hover:bg-[#fff2f3]"
          : "border-[#d9e2ef] text-[#24446e] hover:border-[#78a8e9] hover:bg-[#f4f8ff]",
      )}
    >
      {children}
    </button>
  );
}

export function ChallanSubmissionWorkspace({ challanId }: { challanId?: string }) {
  useSetBreadcrumb([
    { label: "Projects", href: "/cms/ongoing-works" },
    { label: "Project Documentation", href: "/cms/documentation" },
    { label: "Challan Submission" },
  ]);

  const challan = useChallanSubmission(challanId);
  if (challanId && challan.isLoading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center text-sm text-[#60718e]">
        Loading challan...
      </div>
    );
  }
  if (challanId && challan.isError) {
    return (
      <div className="m-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {challan.error instanceof ApiError ? challan.error.message : "Unable to load this challan."}
      </div>
    );
  }

  return <ChallanSubmissionEditor key={challan.data?.id ?? "new"} initialRecord={challan.data} />;
}

function ChallanSubmissionEditor({ initialRecord }: { initialRecord?: ChallanSubmissionRecord }) {
  const router = useRouter();

  const cmsProjects = useCmsWorks({ limit: 100 });
  const projectOptions = React.useMemo(
    () => cmsProjects.data?.items ?? [],
    [cmsProjects.data?.items],
  );
  const [selectedProjectChoice, setSelectedProjectChoice] = React.useState(
    initialRecord?.cmsWorkId ?? "",
  );
  const selectedProjectId = selectedProjectChoice || projectOptions[0]?.id || "";
  const contracts = useContracts({ cmsWorkId: selectedProjectId || undefined, limit: 100 });
  const contractOptions = React.useMemo(
    () =>
      (contracts.data?.items ?? []).filter(
        (contract) =>
          contract.cmsWorkId === selectedProjectId &&
          (contract.status !== "CANCELLED" || contract.id === initialRecord?.contractId),
      ),
    [contracts.data?.items, initialRecord?.contractId, selectedProjectId],
  );
  const [selectedContractChoice, setSelectedContractChoice] = React.useState(
    initialRecord?.contractId ?? "",
  );
  const selectedContractId = selectedContractChoice;
  const projectBoq = useProjectBoq(selectedProjectId || undefined);
  const numberPreview = useChallanNumberPreview();
  const createChallan = useCreateChallanSubmission();
  const updateChallan = useUpdateChallanSubmission();
  const submitChallan = useSubmitChallanSubmission();
  const startReviewChallan = useStartReviewChallanSubmission();
  const approveChallan = useApproveChallanSubmission();
  const rejectChallan = useRejectChallanSubmission();
  const releaseChallanPayment = useReleaseChallanPayment();
  const cancelChallan = useCancelChallanSubmission();
  const createDocument = useCreateDocument();
  const addDocumentVersion = useAddDocumentVersion();

  const [savedRecord, setSavedRecord] = React.useState<ChallanSubmissionRecord | null>(
    initialRecord ?? null,
  );
  const [form, setForm] = React.useState<ChallanFormState>(() => initialForm(initialRecord));
  const [items, setItems] = React.useState<ChallanItem[]>(() => initialItems(initialRecord));
  const [documents, setDocuments] = React.useState<ChallanDocument[]>(() =>
    initialDocuments(initialRecord),
  );
  const [editingItemId, setEditingItemId] = React.useState<string | null>(null);
  const [operationError, setOperationError] = React.useState<string | null>(null);
  const [operationMessage, setOperationMessage] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const record = savedRecord ?? initialRecord ?? null;
  const selectedContract =
    contractOptions.find((contract) => contract.id === selectedContractId) ??
    (record?.contractId === selectedContractId ? record.contract : null);
  const selectedProject =
    projectOptions.find((project) => project.id === selectedProjectId) ?? record?.cmsWork ?? null;
  const totalAmount = React.useMemo(
    () => items.reduce((total, item) => total + item.quantity * item.rate, 0),
    [items],
  );
  const statusStage = record ? STATUS_STAGE[record.status] : "Draft";
  const historyStageIndex = (record?.statusHistory ?? []).reduce((highest, history) => {
    const stage = STATUS_STAGE[history.toStatus];
    return stage ? Math.max(highest, WORKFLOW_STAGES.indexOf(stage)) : highest;
  }, 0);
  const currentStageIndex = Math.max(
    WORKFLOW_STAGES.indexOf(statusStage ?? "Draft"),
    historyStageIndex,
  );
  const workflowStage = WORKFLOW_STAGES[currentStageIndex] ?? "Draft";
  const isEditable = !record || record.status === "DRAFT" || record.status === "REJECTED";
  const isBusy =
    createChallan.isPending ||
    updateChallan.isPending ||
    submitChallan.isPending ||
    startReviewChallan.isPending ||
    approveChallan.isPending ||
    rejectChallan.isPending ||
    releaseChallanPayment.isPending ||
    cancelChallan.isPending ||
    createDocument.isPending ||
    addDocumentVersion.isPending;
  const challanNumber =
    record?.challanNo ?? numberPreview.data?.challanNo ?? "Auto-generated on save";

  function updateForm<Key extends keyof ChallanFormState>(key: Key, value: ChallanFormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateItem(id: string, key: keyof Omit<ChallanItem, "id">, value: string) {
    setItems((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              [key]: key === "quantity" || key === "rate" ? Number(value) || 0 : value,
            }
          : item,
      ),
    );
  }

  function addItem() {
    const id = `item-${Date.now()}`;
    setItems((current) => [
      ...current,
      { id, code: "", description: "", unit: "pcs", quantity: 1, rate: 0 },
    ]);
    setEditingItemId(id);
  }

  function deleteItem(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
    setEditingItemId((current) => (current === id ? null : current));
  }

  function importProjectBoq() {
    const boqItems = projectBoq.data ?? [];
    if (!boqItems.length) {
      setOperationError("No BOQ items are available for the selected project.");
      return;
    }
    setItems(
      boqItems.map((item) => ({
        id: `boq-${item.id}`,
        code: item.itemCode ?? "",
        description: item.description,
        unit: item.unit,
        quantity: 0,
        rate: Number(item.unitRate),
      })),
    );
    setEditingItemId(null);
    setOperationError(null);
  }

  function clearItems() {
    if (window.confirm("Remove all challan items?")) {
      setItems([]);
      setEditingItemId(null);
    }
  }

  function acceptFiles(files: File[]) {
    const accepted = files.filter(
      (file) =>
        file.size <= 10 * 1024 * 1024 &&
        ["application/pdf", "image/jpeg", "image/png"].includes(file.type),
    );
    if (accepted.length !== files.length) {
      setOperationError("Only PDF, JPG or PNG files up to 10MB can be uploaded.");
    } else {
      setOperationError(null);
    }
    if (!accepted.length) return;
    setDocuments((current) => {
      const uploadOrder = [
        ...current.filter(
          (document) => document.required && !document.storedDocumentId && !document.fileObject,
        ),
        ...current.filter(
          (document) => !document.required && !document.storedDocumentId && !document.fileObject,
        ),
        ...current.filter(
          (document) => document.required && (document.storedDocumentId || document.fileObject),
        ),
        ...current.filter(
          (document) => !document.required && (document.storedDocumentId || document.fileObject),
        ),
      ];
      const fileByDocumentId = new Map(
        uploadOrder
          .slice(0, accepted.length)
          .map((document, index) => [document.id, accepted[index]!] as const),
      );
      return current.map((document) => {
        const file = fileByDocumentId.get(document.id);
        return file ? { ...document, fileName: file.name, fileObject: file } : document;
      });
    });
  }

  async function openStoredDocument(document: ChallanDocument, download: boolean) {
    let blob: Blob;
    let fileName = document.fileName ?? document.name;
    if (document.fileObject) {
      blob = document.fileObject;
      fileName = document.fileObject.name;
    } else if (document.storedDocumentId) {
      const stored = await downloadStoredDocument(document.storedDocumentId);
      blob = stored.blob;
      fileName = stored.fileName ?? fileName;
    } else {
      setOperationError(`Upload ${document.name} first.`);
      return;
    }
    const url = URL.createObjectURL(blob);
    if (download) {
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  function viewDocument(document: ChallanDocument) {
    void openStoredDocument(document, false).catch((error: unknown) => {
      setOperationError(
        error instanceof ApiError ? error.message : "Unable to open this document.",
      );
    });
  }

  function downloadDocument(document: ChallanDocument) {
    void openStoredDocument(document, true).catch((error: unknown) => {
      setOperationError(
        error instanceof ApiError ? error.message : "Unable to download this document.",
      );
    });
  }

  function buildPayload(requireItems: boolean): SaveChallanSubmissionInput {
    if (!selectedProjectId) throw new Error("Select a project first.");
    if (!form.description.trim()) throw new Error("Description is required.");
    if (!form.challanDate || !form.challanMonth || !form.fromDate || !form.toDate)
      throw new Error("Complete all challan dates.");
    if (
      !form.receivedBy.trim() ||
      !form.receivedAt.trim() ||
      !form.submittedTo.trim() ||
      !form.paymentFrom.trim()
    ) {
      throw new Error("Complete all required receiving and submission fields.");
    }
    if (requireItems && !items.length)
      throw new Error("Add at least one challan item before submitting.");
    if (
      items.some(
        (item) =>
          !item.description.trim() ||
          !item.unit.trim() ||
          !Number.isFinite(item.quantity) ||
          !Number.isFinite(item.rate) ||
          item.quantity <= 0 ||
          item.rate <= 0,
      )
    ) {
      throw new Error("Each item needs a description, unit, quantity and rate greater than zero.");
    }
    return {
      cmsWorkId: selectedProjectId,
      ...(record
        ? { contractId: selectedContractId }
        : selectedContractId
          ? { contractId: selectedContractId }
          : {}),
      challanDate: new Date(`${form.challanDate}T00:00:00.000Z`).toISOString(),
      description: form.description.trim(),
      challanType: form.challanType,
      challanMonth: new Date(`${form.challanMonth}-01T00:00:00.000Z`).toISOString(),
      periodFrom: new Date(`${form.fromDate}T00:00:00.000Z`).toISOString(),
      periodTo: new Date(`${form.toDate}T00:00:00.000Z`).toISOString(),
      receivedBy: form.receivedBy.trim(),
      receivedAt: form.receivedAt.trim(),
      submittedTo: form.submittedTo.trim(),
      paymentFrom: form.paymentFrom.trim(),
      remarks: form.remarks.trim() || undefined,
      items: items.map((item, index) => ({
        itemCode: item.code.trim() || undefined,
        description: item.description.trim(),
        unit: item.unit.trim(),
        quantity: item.quantity,
        rate: item.rate,
        sortOrder: index,
      })),
    };
  }

  async function persistDraft(requireItems = false) {
    const payload = buildPayload(requireItems);
    const saved = record
      ? await updateChallan.mutateAsync({ id: record.id, payload })
      : await createChallan.mutateAsync(payload);
    setSavedRecord(saved);
    return saved;
  }

  async function uploadPendingDocuments(challan: ChallanSubmissionRecord) {
    const pending = documents.filter((document) => document.fileObject);
    for (const document of pending) {
      const uploaded = document.storedDocumentId
        ? await addDocumentVersion.mutateAsync({
            id: document.storedDocumentId,
            file: document.fileObject!,
            changeNote: "Updated from Challan Submission",
          })
        : await createDocument.mutateAsync({
            input: {
              name: document.name,
              category: "Project Documentation",
              documentType: document.documentType,
              relatedModule: "CHALLAN_SUBMISSION",
              relatedEntityId: challan.id,
              relatedEntityName: challan.challanNo,
              challanSubmissionId: challan.id,
              workId: challan.cmsWorkId,
              contractId: challan.contractId ?? undefined,
              referenceNumber: challan.challanNo,
            },
            file: document.fileObject,
          });
      setDocuments((current) =>
        current.map((entry) =>
          entry.id === document.id
            ? {
                ...entry,
                fileObject: undefined,
                fileName: uploaded.fileName,
                storedDocumentId: uploaded.id,
              }
            : entry,
        ),
      );
    }
  }

  function errorMessage(error: unknown) {
    return error instanceof ApiError
      ? error.message
      : error instanceof Error
        ? error.message
        : "The operation could not be completed.";
  }

  async function runWorkflowAction(
    action: () => Promise<ChallanSubmissionRecord>,
    successMessage: string,
  ) {
    setOperationError(null);
    setOperationMessage(null);
    try {
      const updated = await action();
      setSavedRecord(updated);
      setOperationMessage(successMessage);
    } catch (error) {
      setOperationError(errorMessage(error));
    }
  }

  async function saveDraft() {
    setOperationError(null);
    setOperationMessage(null);
    try {
      const saved = await persistDraft(false);
      await uploadPendingDocuments(saved);
      setOperationMessage("Challan draft saved successfully.");
      router.replace(`/cms/documentation/challan-submission?id=${encodeURIComponent(saved.id)}`);
    } catch (error) {
      setOperationError(errorMessage(error));
    }
  }

  async function submitForReview() {
    setOperationError(null);
    setOperationMessage(null);
    try {
      const saved = await persistDraft(true);
      await uploadPendingDocuments(saved);
      const submitted = await submitChallan.mutateAsync(saved.id);
      setSavedRecord(submitted);
      setOperationMessage("Challan submitted for review.");
      router.replace(
        `/cms/documentation/challan-submission?id=${encodeURIComponent(submitted.id)}`,
      );
    } catch (error) {
      setOperationError(errorMessage(error));
    }
  }

  async function startReview() {
    if (!record) return;
    await runWorkflowAction(
      () => startReviewChallan.mutateAsync(record.id),
      "Challan review started.",
    );
  }

  async function approve() {
    if (!record) return;
    const enteredAmount = window.prompt(
      "Approved amount (BDT)",
      String(record.approvedAmount ?? record.totalAmount),
    );
    if (enteredAmount === null) return;
    const approvedAmount = Number(enteredAmount.replaceAll(",", "").trim());
    if (!Number.isFinite(approvedAmount) || approvedAmount <= 0) {
      setOperationError("Enter a valid approved amount greater than zero.");
      setOperationMessage(null);
      return;
    }
    await runWorkflowAction(
      () => approveChallan.mutateAsync({ id: record.id, approvedAmount }),
      "Challan approved successfully.",
    );
  }

  async function reject() {
    if (!record) return;
    const enteredReason = window.prompt(
      "Reason for rejection (optional)",
      record.rejectionReason ?? "",
    );
    if (enteredReason === null) return;
    await runWorkflowAction(
      () => rejectChallan.mutateAsync({ id: record.id, reason: enteredReason.trim() || undefined }),
      "Challan returned as rejected.",
    );
  }

  async function releasePayment() {
    if (!record || !window.confirm("Confirm that payment has been released for this challan?"))
      return;
    await runWorkflowAction(
      () => releaseChallanPayment.mutateAsync(record.id),
      "Challan payment marked as released.",
    );
  }

  async function cancel() {
    if (!record) return;
    const enteredReason = window.prompt(
      "Reason for cancellation (optional)",
      record.cancellationReason ?? "",
    );
    if (enteredReason === null) return;
    await runWorkflowAction(
      () => cancelChallan.mutateAsync({ id: record.id, reason: enteredReason.trim() || undefined }),
      "Challan cancelled.",
    );
  }

  return (
    <div className="min-h-full bg-[#f8faff] px-2 pb-4 pt-2 text-[#0b1f4b] sm:px-3">
      <header className="flex min-h-[91px] flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="pt-1">
          <h1 className="text-[25px] font-bold leading-tight tracking-[-0.025em] text-[#071b49]">
            Challan Submission
          </h1>
          <p className="mt-1 text-[11.5px] text-[#40577f]">
            Create and manage challan submissions for project
          </p>
        </div>
        <div className="flex w-full flex-col items-stretch gap-2 sm:w-[520px] sm:items-end">
          <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="relative block h-[48px] w-full rounded-[6px] border border-[#dce4ef] bg-white px-4 pt-[7px] shadow-[0_1px_3px_rgba(20,39,74,0.03)]">
              <span className="block text-[9px] font-medium text-[#60718e]">Select Project</span>
              <select
                aria-label="Select Project"
                value={selectedProjectId}
                onChange={(event) => {
                  setSelectedProjectChoice(event.target.value);
                  setSelectedContractChoice("");
                }}
                disabled={!isEditable || cmsProjects.isLoading}
                className="absolute inset-0 h-full w-full appearance-none bg-transparent px-4 pb-1 pt-[18px] text-[11.5px] font-bold text-[#10244c] outline-none"
              >
                {!projectOptions.length && <option value="">No projects found</option>}
                {projectOptions.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.workName}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#071b49]" />
            </label>
            <label className="relative block h-[48px] w-full rounded-[6px] border border-[#dce4ef] bg-white px-4 pt-[7px] shadow-[0_1px_3px_rgba(20,39,74,0.03)]">
              <span className="block text-[9px] font-medium text-[#60718e]">
                Contract / Work Order (optional)
              </span>
              <select
                aria-label="Contract or Work Order"
                value={selectedContractChoice}
                onChange={(event) => setSelectedContractChoice(event.target.value)}
                disabled={!isEditable || !selectedProjectId || contracts.isFetching}
                className="absolute inset-0 h-full w-full appearance-none bg-transparent px-4 pb-1 pt-[18px] text-[11px] font-bold text-[#10244c] outline-none"
              >
                <option value="">No contract / work order</option>
                {record?.contractId &&
                  record.contract &&
                  selectedProjectId === record.cmsWorkId &&
                  !contractOptions.some((contract) => contract.id === record.contractId) && (
                    <option value={record.contractId}>{record.contract.contractNo}</option>
                  )}
                {contractOptions.map((contract) => (
                  <option key={contract.id} value={contract.id}>
                    {contract.contractNo}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#071b49]" />
            </label>
          </div>
          <Link
            href="/cms/documentation"
            className="inline-flex h-[34px] w-full items-center justify-center gap-2 whitespace-nowrap rounded-[5px] border border-[#d7e0ec] bg-white px-4 text-[10px] font-semibold text-[#075ed7] hover:border-[#0b63e5] hover:bg-[#f5f9ff] sm:w-[220px]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Challan Submissions
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <SummaryCard
          label="TID"
          value={selectedContract?.tender?.egpTenderId ?? "Not linked"}
          icon={FileText}
          tone="blue"
        />
        <SummaryCard
          label="Project"
          value={selectedProject?.workName ?? "Select a project"}
          icon={ClipboardCheck}
          tone="green"
        />
        <SummaryCard
          label="Work Description"
          value={form.description || selectedContract?.scopeOfWork || "Not entered"}
          icon={FileCheck2}
          tone="purple"
        />
        <SummaryCard
          label="Contract Amount (BDT)"
          value={formatAmount(
            Number(selectedContract?.currentContractValue ?? selectedProject?.contractValue ?? 0),
          )}
          icon={Award}
          tone="orange"
        />
        <SummaryCard
          label="Approved Amount (BDT)"
          value={formatAmount(Number(record?.approvedAmount ?? 0))}
          icon={ShieldCheck}
          tone="teal"
        />
      </section>

      {(operationError || operationMessage) && (
        <div
          role="status"
          className={cn(
            "mt-3 rounded-[6px] border px-3 py-2 text-[10.5px] font-medium",
            operationError
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700",
          )}
        >
          {operationError ?? operationMessage}
        </div>
      )}

      <div className="mt-3 grid grid-cols-1 items-start gap-3 xl:grid-cols-[minmax(0,1.65fr)_minmax(360px,1fr)]">
        <div className="min-w-0 space-y-3">
          <section className="rounded-[7px] border border-[#dde6f1] bg-white p-4 shadow-[0_1px_2px_rgba(15,34,70,0.025)]">
            <h2 className="text-[13.5px] font-bold text-[#0c214c]">Challan Information</h2>
            <fieldset
              disabled={!isEditable}
              className="mt-4 grid grid-cols-1 gap-x-4 gap-y-[18px] disabled:opacity-80 sm:grid-cols-2 lg:grid-cols-4"
            >
              <label>
                <FieldLabel required>Challan No</FieldLabel>
                <input
                  value={challanNumber}
                  readOnly
                  className={cn(CONTROL_CLASS, "bg-[#f9fbfe]")}
                />
              </label>
              <label>
                <FieldLabel required>Challan Date</FieldLabel>
                <span className="relative block">
                  <input
                    type="date"
                    value={form.challanDate}
                    onChange={(event) => updateForm("challanDate", event.target.value)}
                    className={cn(CONTROL_CLASS, "pr-3")}
                  />
                </span>
              </label>
              <label>
                <FieldLabel required>Description</FieldLabel>
                <input
                  value={form.description}
                  onChange={(event) => updateForm("description", event.target.value)}
                  className={CONTROL_CLASS}
                />
              </label>
              <label>
                <FieldLabel required>Challan Type</FieldLabel>
                <span className="relative block">
                  <select
                    value={form.challanType}
                    onChange={(event) => updateForm("challanType", event.target.value)}
                    className={cn(CONTROL_CLASS, "appearance-none pr-8")}
                  >
                    <option>Material Delivery</option>
                    <option>Service Delivery</option>
                    <option>Work Progress</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
                </span>
              </label>

              <label>
                <FieldLabel required>Challan For Month</FieldLabel>
                <span className="relative block">
                  <input
                    type="month"
                    value={form.challanMonth}
                    onChange={(event) => updateForm("challanMonth", event.target.value)}
                    className={cn(CONTROL_CLASS, "pr-3")}
                  />
                </span>
              </label>
              <label>
                <FieldLabel required>From Date</FieldLabel>
                <span className="relative block">
                  <input
                    type="date"
                    value={form.fromDate}
                    onChange={(event) => updateForm("fromDate", event.target.value)}
                    className={cn(CONTROL_CLASS, "pr-3")}
                  />
                </span>
              </label>
              <label>
                <FieldLabel required>To Date</FieldLabel>
                <span className="relative block">
                  <input
                    type="date"
                    value={form.toDate}
                    onChange={(event) => updateForm("toDate", event.target.value)}
                    className={cn(CONTROL_CLASS, "pr-3")}
                  />
                </span>
              </label>
              <label>
                <FieldLabel required>Challan Amount (BDT)</FieldLabel>
                <input
                  value={formatAmount(totalAmount)}
                  readOnly
                  className={cn(CONTROL_CLASS, "bg-[#f9fbfe] tabular-nums")}
                />
              </label>

              <label>
                <FieldLabel required>Received By</FieldLabel>
                <span className="relative block">
                  <select
                    value={form.receivedBy}
                    onChange={(event) => updateForm("receivedBy", event.target.value)}
                    className={cn(CONTROL_CLASS, "appearance-none pr-8")}
                  >
                    <option>Project Engineer</option>
                    <option>Project Manager</option>
                    <option>Site Engineer</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
                </span>
              </label>
              <label>
                <FieldLabel required>Received At</FieldLabel>
                <input
                  value={form.receivedAt}
                  onChange={(event) => updateForm("receivedAt", event.target.value)}
                  className={CONTROL_CLASS}
                />
              </label>
              <label>
                <FieldLabel required>Submitted To</FieldLabel>
                <span className="relative block">
                  <select
                    value={form.submittedTo}
                    onChange={(event) => updateForm("submittedTo", event.target.value)}
                    className={cn(CONTROL_CLASS, "appearance-none pr-8")}
                  >
                    <option>Project Engineer</option>
                    <option>Project Manager</option>
                    <option>Consultant</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
                </span>
              </label>
              <label>
                <FieldLabel required>Payment From</FieldLabel>
                <span className="relative block">
                  <select
                    value={form.paymentFrom}
                    onChange={(event) => updateForm("paymentFrom", event.target.value)}
                    className={cn(CONTROL_CLASS, "appearance-none pr-8")}
                  >
                    <option>Own Fund</option>
                    <option>Bank Finance</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
                </span>
              </label>

              <label className="sm:col-span-2 lg:col-span-4">
                <FieldLabel>Remarks</FieldLabel>
                <textarea
                  value={form.remarks}
                  onChange={(event) => updateForm("remarks", event.target.value)}
                  className="min-h-[48px] w-full resize-y rounded-[5px] border border-[#d9e2ef] bg-white px-3 py-2 text-[10.5px] font-medium text-[#10244c] outline-none focus:border-[#1769e8] focus:ring-2 focus:ring-[#1769e8]/10"
                />
              </label>
            </fieldset>
          </section>

          <section className="overflow-hidden rounded-[7px] border border-[#dde6f1] bg-white shadow-[0_1px_2px_rgba(15,34,70,0.025)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e1e8f2] px-4 py-3">
              <div>
                <h2 className="text-[13.5px] font-bold text-[#0c214c]">Challan Items</h2>
                <p className="mt-0.5 text-[9.5px] text-[#5c6f8f]">
                  Add challan items from delivery challan or create new items
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={addItem}
                  disabled={!isEditable}
                  className="inline-flex h-[34px] items-center gap-2 rounded-[5px] border border-[#b9cce7] bg-white px-4 text-[10.5px] font-semibold text-[#075ed7] hover:bg-[#f5f9ff] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Item
                </button>
                <button
                  type="button"
                  onClick={importProjectBoq}
                  disabled={!isEditable || projectBoq.isLoading}
                  className="inline-flex h-[34px] items-center gap-2 rounded-[5px] border border-[#b9cce7] bg-white px-4 text-[10.5px] font-semibold text-[#075ed7] hover:bg-[#f5f9ff] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ClipboardCheck className="h-3.5 w-3.5" /> Import from BOQ
                </button>
                <button
                  type="button"
                  onClick={clearItems}
                  disabled={!isEditable}
                  aria-label="Delete all challan items"
                  title="Delete all challan items"
                  className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-[5px] border border-[#f0d7db] bg-white text-[#ef4656] hover:bg-[#fff2f3] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left text-[9.5px] text-[#10244c]">
                <thead className="bg-[#fbfcfe] text-[9px] font-semibold text-[#24395f]">
                  <tr className="h-[35px] border-b border-[#e1e8f2]">
                    <th className="w-[42px] px-4">SL</th>
                    <th className="px-2">Item Code</th>
                    <th className="px-2">Item Description</th>
                    <th className="px-2">Unit</th>
                    <th className="px-2 text-right">Challan Qty</th>
                    <th className="px-2 text-right">Rate (BDT)</th>
                    <th className="px-2 text-right">Amount (BDT)</th>
                    <th className="w-[72px] px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => {
                    const editing = editingItemId === item.id;
                    const inputClass =
                      "h-7 w-full rounded border border-[#cdd9e9] px-2 text-[9.5px] outline-none focus:border-[#1769e8]";
                    return (
                      <tr
                        key={item.id}
                        className="h-[44px] border-b border-[#e6ebf3] last:border-b-0"
                      >
                        <td className="px-4">{index + 1}</td>
                        <td className="px-2">
                          {editing ? (
                            <input
                              value={item.code}
                              onChange={(event) => updateItem(item.id, "code", event.target.value)}
                              className={inputClass}
                            />
                          ) : (
                            item.code
                          )}
                        </td>
                        <td className="px-2">
                          {editing ? (
                            <input
                              value={item.description}
                              onChange={(event) =>
                                updateItem(item.id, "description", event.target.value)
                              }
                              className={inputClass}
                            />
                          ) : (
                            item.description
                          )}
                        </td>
                        <td className="px-2">
                          {editing ? (
                            <input
                              value={item.unit}
                              onChange={(event) => updateItem(item.id, "unit", event.target.value)}
                              className={inputClass}
                            />
                          ) : (
                            item.unit
                          )}
                        </td>
                        <td className="px-2 text-right tabular-nums">
                          {editing ? (
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.quantity}
                              onChange={(event) =>
                                updateItem(item.id, "quantity", event.target.value)
                              }
                              className={cn(inputClass, "text-right")}
                            />
                          ) : (
                            formatAmount(item.quantity)
                          )}
                        </td>
                        <td className="px-2 text-right tabular-nums">
                          {editing ? (
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={item.rate}
                              onChange={(event) => updateItem(item.id, "rate", event.target.value)}
                              className={cn(inputClass, "text-right")}
                            />
                          ) : (
                            formatAmount(item.rate)
                          )}
                        </td>
                        <td className="px-2 text-right font-medium tabular-nums">
                          {formatAmount(item.quantity * item.rate)}
                        </td>
                        <td className="px-3">
                          <div className="flex justify-center gap-1.5">
                            {isEditable ? (
                              <>
                                <IconButton
                                  label={editing ? "Finish editing item" : "Edit item"}
                                  onClick={() => setEditingItemId(editing ? null : item.id)}
                                >
                                  {editing ? (
                                    <Check className="h-3.5 w-3.5" />
                                  ) : (
                                    <Pencil className="h-3.5 w-3.5" />
                                  )}
                                </IconButton>
                                <IconButton
                                  label="Delete item"
                                  tone="danger"
                                  onClick={() => deleteItem(item.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </IconButton>
                              </>
                            ) : (
                              <span className="text-[#8a98ad]">—</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!items.length && (
                    <tr>
                      <td colSpan={8} className="h-[54px] px-4 text-center text-[#71819a]">
                        No challan items added.
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="h-[42px] border-t border-[#dce5f0] bg-[#fcfdff] font-bold text-[#0c214c]">
                    <td colSpan={6} className="px-3 text-right">
                      Total Amount (BDT)
                    </td>
                    <td className="px-2 text-right tabular-nums">{formatAmount(totalAmount)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-2.5 pb-1">
            {isEditable ? (
              <>
                <button
                  type="button"
                  onClick={() => void saveDraft()}
                  disabled={isBusy}
                  className="inline-flex h-[36px] items-center gap-2 rounded-[5px] border border-[#b8cae4] bg-white px-5 text-[10.5px] font-semibold text-[#075ed7] hover:bg-[#f5f9ff] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Save className="h-3.5 w-3.5" />{" "}
                  {createChallan.isPending || updateChallan.isPending
                    ? "Saving..."
                    : "Save as Draft"}
                </button>
                <button
                  type="button"
                  onClick={() => void submitForReview()}
                  disabled={isBusy}
                  className="inline-flex h-[36px] items-center gap-2 rounded-[5px] bg-[#0765e9] px-5 text-[10.5px] font-semibold text-white shadow-[0_3px_8px_rgba(7,101,233,0.22)] hover:bg-[#0458ce] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <FileCheck2 className="h-3.5 w-3.5" />{" "}
                  {submitChallan.isPending ? "Submitting..." : "Submit for Review"}
                </button>
                {record && (
                  <button
                    type="button"
                    onClick={() => void cancel()}
                    disabled={isBusy}
                    className="inline-flex h-[36px] items-center gap-2 rounded-[5px] border border-[#f0cbd0] bg-white px-4 text-[10.5px] font-semibold text-[#d83a49] hover:bg-[#fff5f6] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Trash2 className="h-3.5 w-3.5" />{" "}
                    {cancelChallan.isPending ? "Cancelling..." : "Cancel Challan"}
                  </button>
                )}
              </>
            ) : record?.status === "SUBMITTED" ? (
              <>
                <button
                  type="button"
                  onClick={() => void startReview()}
                  disabled={isBusy}
                  className="inline-flex h-[36px] items-center gap-2 rounded-[5px] bg-[#0765e9] px-5 text-[10.5px] font-semibold text-white shadow-[0_3px_8px_rgba(7,101,233,0.22)] hover:bg-[#0458ce] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <ClipboardCheck className="h-3.5 w-3.5" />{" "}
                  {startReviewChallan.isPending ? "Starting..." : "Start Review"}
                </button>
                <button
                  type="button"
                  onClick={() => void reject()}
                  disabled={isBusy}
                  className="inline-flex h-[36px] items-center gap-2 rounded-[5px] border border-[#f0cbd0] bg-white px-4 text-[10.5px] font-semibold text-[#d83a49] hover:bg-[#fff5f6] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Ban className="h-3.5 w-3.5" />{" "}
                  {rejectChallan.isPending ? "Rejecting..." : "Reject"}
                </button>
                <button
                  type="button"
                  onClick={() => void cancel()}
                  disabled={isBusy}
                  className="inline-flex h-[36px] items-center gap-2 rounded-[5px] border border-[#d5dfec] bg-white px-4 text-[10.5px] font-semibold text-[#536783] hover:bg-[#f7f9fc] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Trash2 className="h-3.5 w-3.5" />{" "}
                  {cancelChallan.isPending ? "Cancelling..." : "Cancel Challan"}
                </button>
              </>
            ) : record?.status === "UNDER_REVIEW" ? (
              <>
                <button
                  type="button"
                  onClick={() => void approve()}
                  disabled={isBusy}
                  className="inline-flex h-[36px] items-center gap-2 rounded-[5px] bg-[#18a957] px-5 text-[10.5px] font-semibold text-white shadow-[0_3px_8px_rgba(24,169,87,0.2)] hover:bg-[#138e49] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Check className="h-3.5 w-3.5" />{" "}
                  {approveChallan.isPending ? "Approving..." : "Approve"}
                </button>
                <button
                  type="button"
                  onClick={() => void reject()}
                  disabled={isBusy}
                  className="inline-flex h-[36px] items-center gap-2 rounded-[5px] border border-[#f0cbd0] bg-white px-4 text-[10.5px] font-semibold text-[#d83a49] hover:bg-[#fff5f6] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Ban className="h-3.5 w-3.5" />{" "}
                  {rejectChallan.isPending ? "Rejecting..." : "Reject"}
                </button>
                <button
                  type="button"
                  onClick={() => void cancel()}
                  disabled={isBusy}
                  className="inline-flex h-[36px] items-center gap-2 rounded-[5px] border border-[#d5dfec] bg-white px-4 text-[10.5px] font-semibold text-[#536783] hover:bg-[#f7f9fc] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Trash2 className="h-3.5 w-3.5" />{" "}
                  {cancelChallan.isPending ? "Cancelling..." : "Cancel Challan"}
                </button>
              </>
            ) : record?.status === "APPROVED" ? (
              <button
                type="button"
                onClick={() => void releasePayment()}
                disabled={isBusy}
                className="inline-flex h-[36px] items-center gap-2 rounded-[5px] bg-[#079c8a] px-5 text-[10.5px] font-semibold text-white shadow-[0_3px_8px_rgba(7,156,138,0.2)] hover:bg-[#078273] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <CircleDollarSign className="h-3.5 w-3.5" />{" "}
                {releaseChallanPayment.isPending ? "Releasing..." : "Release Payment"}
              </button>
            ) : (
              <p className="text-[10.5px] font-medium text-[#536783]">
                This challan is read-only while its status is {record?.status.replaceAll("_", " ")}.
              </p>
            )}
          </div>
        </div>

        <div className="min-w-0 space-y-3">
          <section className="overflow-hidden rounded-[7px] border border-[#dde6f1] bg-white shadow-[0_1px_2px_rgba(15,34,70,0.025)]">
            <div className="px-4 pb-2 pt-4">
              <h2 className="text-[13.5px] font-bold text-[#0c214c]">Upload Documents</h2>
              <p className="mt-0.5 text-[9.5px] text-[#5c6f8f]">Upload all required documents</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[430px] border-collapse text-left text-[8.8px] text-[#10244c]">
                <thead className="bg-[#fafbfd] text-[8.3px] font-semibold text-[#24395f]">
                  <tr className="h-[31px] border-y border-[#e4eaf2]">
                    <th className="px-4">Document Name</th>
                    <th className="px-2">Required</th>
                    <th className="px-2">File</th>
                    <th className="w-[68px] px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((document) => (
                    <tr
                      key={document.id}
                      className="h-[31px] border-b border-[#e8edf4] last:border-b-0"
                    >
                      <td className="px-4 font-medium">{document.name}</td>
                      <td
                        className={cn(
                          "px-2",
                          document.required ? "font-semibold text-[#218b4c]" : "text-[#62738f]",
                        )}
                      >
                        {document.required ? "Yes" : "No"}
                      </td>
                      <td
                        className={cn(
                          "max-w-[118px] truncate px-2 font-medium",
                          document.fileName ? "text-[#0864dc]" : "text-[#8a98ad]",
                        )}
                        title={document.fileName ?? "Not uploaded"}
                      >
                        {document.fileName ?? "Not uploaded"}
                      </td>
                      <td className="px-3">
                        <div className="flex justify-center gap-1.5">
                          <IconButton
                            label={`View ${document.name}`}
                            onClick={() => viewDocument(document)}
                          >
                            <Eye className="h-3 w-3" />
                          </IconButton>
                          <IconButton
                            label={`Download ${document.name}`}
                            onClick={() => downloadDocument(document)}
                          >
                            <Download className="h-3 w-3" />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-3">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                className="hidden"
                disabled={!isEditable}
                onChange={(event) => acceptFiles(Array.from(event.target.files ?? []))}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={!isEditable}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  acceptFiles(Array.from(event.dataTransfer.files));
                }}
                className="flex h-[61px] w-full flex-col items-center justify-center rounded-[5px] border border-dashed border-[#b9c9df] bg-[#fbfcff] text-center hover:border-[#6f9fdf] hover:bg-[#f6f9ff] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="flex items-center gap-1.5 text-[9.5px] font-semibold text-[#172b55]">
                  <CloudUpload className="h-4 w-4" /> Drag &amp; drop files here or{" "}
                  <span className="text-[#0864dc]">Browse</span>
                </span>
                <span className="mt-1 text-[8.5px] text-[#667793]">
                  Max file size: 10MB (PDF, JPG, PNG)
                </span>
              </button>
            </div>
          </section>

          <section className="rounded-[7px] border border-[#dde6f1] bg-white p-4 shadow-[0_1px_2px_rgba(15,34,70,0.025)]">
            <h2 className="text-[13.5px] font-bold text-[#0c214c]">Submission History</h2>
            <div className="relative mt-3 space-y-0.5 before:absolute before:bottom-[13px] before:left-[4px] before:top-[13px] before:w-px before:bg-[#d7e0ec]">
              {WORKFLOW_STAGES.map((stage, index) => {
                const active = index <= currentStageIndex;
                const status = STAGE_STATUS[stage];
                const history = record?.statusHistory.find((entry) => entry.toStatus === status);
                const label =
                  stage === "Submitted"
                    ? "Submitted for Review"
                    : stage === "Draft"
                      ? "Draft Saved"
                      : stage;
                const date = history ? formatDateTime(history.createdAt) : "-";
                return (
                  <div
                    key={label}
                    className="relative flex min-h-[28px] items-center justify-between gap-3 pl-6 text-[9.3px]"
                  >
                    <span
                      className={cn(
                        "absolute left-0 top-1/2 z-10 h-[9px] w-[9px] -translate-y-1/2 rounded-full border-2 border-white",
                        active ? "bg-[#0b67e8]" : "bg-[#aebacf]",
                      )}
                    />
                    <span
                      className={cn("font-medium", active ? "text-[#10244c]" : "text-[#667793]")}
                    >
                      {label}
                    </span>
                    <span className="shrink-0 text-[#536783]">{date}</span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="overflow-hidden rounded-[7px] border border-[#dde6f1] bg-white shadow-[0_1px_2px_rgba(15,34,70,0.025)]">
            <div className="p-4">
              <h2 className="text-[13.5px] font-bold text-[#0c214c]">Workflow Status</h2>
              <div className="mt-4 overflow-x-auto pb-1">
                <div className="relative flex min-w-[390px] items-start justify-between px-2 before:absolute before:left-[34px] before:right-[34px] before:top-[9px] before:h-px before:bg-[#cfd8e6]">
                  {WORKFLOW_STAGES.map((stage, index) => {
                    const completed = index <= currentStageIndex;
                    return (
                      <div
                        key={stage}
                        className="relative z-10 flex w-[68px] flex-col items-center text-center"
                      >
                        <span
                          className={cn(
                            "flex h-[19px] w-[19px] items-center justify-center rounded-full text-white",
                            completed ? "bg-[#0b67e8]" : "bg-[#aeb8ca]",
                          )}
                        >
                          {index < currentStageIndex ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            <span className="h-1.5 w-1.5 rounded-full bg-white" />
                          )}
                        </span>
                        <span
                          className={cn(
                            "mt-2 text-[8.5px] leading-tight",
                            completed ? "font-semibold text-[#135fca]" : "text-[#65748f]",
                          )}
                        >
                          {stage}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="border-t border-[#e1e8f2] px-4 py-3 text-[9.5px] font-semibold text-[#172b55]">
              Current Status:{" "}
              <span className="ml-1 text-[#0864dc]">
                {record?.status === "REJECTED" || record?.status === "CANCELLED"
                  ? record.status.charAt(0) + record.status.slice(1).toLowerCase()
                  : workflowStage === "Submitted"
                    ? "Submitted for Review"
                    : workflowStage}
              </span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
