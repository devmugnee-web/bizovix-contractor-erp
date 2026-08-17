"use client";
import * as React from "react";
import Link from "next/link";
import {
  Archive,
  Download,
  Eye,
  FileClock,
  FileText,
  History,
  Plus,
  RefreshCcw,
  RotateCcw,
  Search,
  Upload,
  X,
} from "lucide-react";
import {
  Pagination,
  PrimaryButton,
  SecondaryButton,
  SelectInput,
  StatusBadge,
  TextInput,
  cn,
} from "@bizovix/ui";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_MODULES,
  EMPTY_FILTERS,
  daysRemaining,
  daysUntil,
  documentStatus,
  fileSize,
  searchDocument,
  type DocumentFilters,
  type DocumentStatus,
  type ErpDocument,
} from "@/lib/documents";
import { documentService } from "@/services/document-service";

type View = "center" | "tenders" | "projects" | "company" | "financial" | "expiring" | "archived";
const META: Record<View, { title: string; subtitle: string }> = {
  center: {
    title: "Documents",
    subtitle: "Manage all tender, project, company and financial documents from one place.",
  },
  tenders: {
    title: "Tender Documents",
    subtitle: "Manage documents related to tender purchase, submission and award processes.",
  },
  projects: {
    title: "Project Documents",
    subtitle: "Manage documents associated with ongoing and archived projects.",
  },
  company: {
    title: "Company Documents",
    subtitle: "Manage company licenses, certificates, legal and compliance documents.",
  },
  financial: {
    title: "Financial Documents",
    subtitle:
      "Manage financial attachments linked with expenses, receipts and banking transactions.",
  },
  expiring: {
    title: "Expiring Documents",
    subtitle: "Track document expiry dates and renewal requirements.",
  },
  archived: {
    title: "Archived Documents",
    subtitle: "View and manage documents removed from active records.",
  },
};
const tone = (s: DocumentStatus) =>
  s === "Active" || s === "Renewed"
    ? "success"
    : s === "Expiring Soon"
      ? "warning"
      : s === "Expired"
        ? "danger"
        : s === "Draft"
          ? "info"
          : "neutral";
const date = (v?: string) => (v ? new Date(`${v}T12:00:00`).toLocaleDateString("en-GB") : "—");
const categoryMatch = (d: ErpDocument, view: View) =>
  view === "tenders"
    ? d.category === "Tender" || d.relatedModule === "Tender"
    : view === "projects"
      ? d.category === "Project" || d.relatedModule === "Project / CMS"
      : view === "company"
        ? ["Company", "Legal", "Tax & VAT", "Employee / Authorization"].includes(d.category)
        : view === "financial"
          ? d.category === "Financial" ||
            ["Expense", "Receipt", "Cash & Bank"].includes(d.relatedModule)
          : view === "expiring"
            ? Boolean(d.expiryDate) && !d.archivedAt && daysUntil(d.expiryDate!) <= 30
            : view === "archived"
              ? Boolean(d.archivedAt)
              : !d.archivedAt;
function Summary({
  label,
  value,
  toneClass = "text-biz-blue",
}: {
  label: string;
  value: number;
  toneClass?: string;
}) {
  return (
    <div className="rounded-lg border border-biz-border bg-white p-4 shadow-card">
      <p className="text-[11px] font-semibold text-biz-muted">{label}</p>
      <p className={cn("mt-2 text-xl font-bold", toneClass)}>{value}</p>
    </div>
  );
}

function Overlay({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={onClose}
    >
      <section
        className={cn(
          "max-h-[92vh] w-full overflow-y-auto rounded-lg bg-white p-5 shadow-card-hover",
          wide ? "max-w-4xl" : "max-w-2xl",
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[16px] font-bold">{title}</h2>
          <button aria-label="Close" onClick={onClose}>
            <X className="h-5 w-5 text-biz-muted" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
function Field({
  label,
  children,
  required = false,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="text-[11px] font-semibold">
      {label}
      {required && <span className="text-red-500"> *</span>}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function UploadDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = React.useState({
      name: "",
      category: "Tender",
      type: "Tender Notice",
      module: "Tender",
      related: "",
      organization: "",
      reference: "",
      certificate: "",
      issueDate: "",
      expiryDate: "",
      reminder: "30",
      description: "",
      tags: "",
    }),
    [file, setFile] = React.useState<File | null>(null),
    [error, setError] = React.useState(""),
    [saving, setSaving] = React.useState(false);
  if (!open) return null;
  const save = async () => {
    if (!form.name.trim() || !file) {
      setError("Document Name and File are required.");
      return;
    }
    if (file.size > 15 * 1048576) {
      setError("File must not exceed 15 MB.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await documentService.create(
        {
          name: form.name,
          category: form.category,
          documentType: form.type,
          relatedModule: form.module,
          relatedEntityName: form.related || form.organization || undefined,
          referenceNumber: form.reference || undefined,
          certificateNumber: form.certificate || undefined,
          issueDate: form.issueDate || undefined,
          expiryDate: form.expiryDate || undefined,
          reminderDays: Number(form.reminder) || undefined,
          description: form.description || undefined,
          tags: form.tags,
        },
        file,
      );
      onSaved();
      onClose();
    } catch {
      setError("Failed to upload document. Please try again.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Overlay title="Upload Document" onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Document Name" required>
          <TextInput
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <Field label="Document Category" required>
          <SelectInput
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            options={DOCUMENT_CATEGORIES.map((x) => ({ value: x, label: x }))}
          />
        </Field>
        <Field label="Document Type" required>
          <TextInput
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          />
        </Field>
        <Field label="Related Module">
          <SelectInput
            value={form.module}
            onChange={(e) => setForm({ ...form, module: e.target.value })}
            options={DOCUMENT_MODULES.map((x) => ({ value: x, label: x }))}
          />
        </Field>
        <Field label="Related Tender / Project">
          <TextInput
            value={form.related}
            onChange={(e) => setForm({ ...form, related: e.target.value })}
          />
        </Field>
        <Field label="Organization">
          <TextInput
            value={form.organization}
            onChange={(e) => setForm({ ...form, organization: e.target.value })}
          />
        </Field>
        <Field label="Reference Number">
          <TextInput
            value={form.reference}
            onChange={(e) => setForm({ ...form, reference: e.target.value })}
          />
        </Field>
        <Field label="Certificate / License No.">
          <TextInput
            value={form.certificate}
            onChange={(e) => setForm({ ...form, certificate: e.target.value })}
          />
        </Field>
        <Field label="Issue Date">
          <TextInput
            type="date"
            value={form.issueDate}
            onChange={(e) => setForm({ ...form, issueDate: e.target.value })}
          />
        </Field>
        <Field label="Expiry Date">
          <TextInput
            type="date"
            value={form.expiryDate}
            onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
          />
        </Field>
        <Field label="Reminder Before Expiry">
          <SelectInput
            value={form.reminder}
            onChange={(e) => setForm({ ...form, reminder: e.target.value })}
            options={[0, 7, 15, 30, 60, 90].map((x) => ({
              value: String(x),
              label: x ? `${x} Days Before` : "No Reminder",
            }))}
          />
        </Field>
        <Field label="Tags (comma separated)">
          <TextInput
            value={form.tags}
            onChange={(e) => setForm({ ...form, tags: e.target.value })}
          />
        </Field>
      </div>
      <div className="mt-3">
        <Field label="Description / Remarks">
          <textarea
            className="min-h-20 w-full rounded-sm border border-biz-border p-3 text-[13px]"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </Field>
      </div>
      <div className="mt-3">
        <Field label="File" required>
          <input
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
            className="h-11 w-full rounded-sm border border-biz-border p-2 text-xs"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setError("");
            }}
          />
        </Field>
        {file && (
          <p className="mt-2 rounded bg-slate-50 p-2 text-xs">
            {file.name} · {fileSize(file.size)}
          </p>
        )}
      </div>
      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
        <PrimaryButton onClick={save} disabled={saving}>
          <Upload className="h-4 w-4" />
          {saving ? "Uploading..." : "Save Document"}
        </PrimaryButton>
      </div>
    </Overlay>
  );
}

function DetailsDialog({
  document,
  onClose,
  onChange,
}: {
  document: ErpDocument;
  onClose: () => void;
  onChange: (d: ErpDocument) => void;
}) {
  const [tab, setTab] = React.useState<"details" | "versions" | "replace" | "edit">("details"),
    [name, setName] = React.useState(document.name),
    [reference, setReference] = React.useState(document.referenceNumber ?? ""),
    [newFile, setNewFile] = React.useState<File | null>(null),
    [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const download = async (version?: number) => {
    await documentService.download(document.id, version, document.fileName);
  };
  const replace = async () => {
    if (!newFile) return;
    setBusy(true);
    try {
      const updated = await documentService.addVersion(document.id, newFile, note);
      onChange(updated);
      setTab("versions");
      setNewFile(null);
      setNote("");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Overlay title={document.name} onClose={onClose} wide>
      <div className="mb-4 flex flex-wrap gap-2">
        {(["details", "versions", "replace", "edit"] as const).map((x) => (
          <button
            key={x}
            onClick={() => setTab(x)}
            className={cn(
              "h-8 rounded border px-3 text-xs font-semibold",
              tab === x ? "border-biz-blue bg-biz-blue text-white" : "border-biz-border",
            )}
          >
            {x === "details"
              ? "Details"
              : x === "versions"
                ? "Version History"
                : x === "replace"
                  ? "Replace Version"
                  : "Edit Metadata"}
          </button>
        ))}
      </div>
      {tab === "details" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <div className="flex min-h-64 items-center justify-center rounded border border-dashed bg-slate-50">
            <div className="text-center text-biz-muted">
              <FileText className="mx-auto h-14 w-14" />
              <p className="mt-2 text-xs">
                {document.fileType.includes("pdf") || document.fileType.includes("image")
                  ? "Preview will load from authorized file storage."
                  : "Preview unavailable for this format."}
              </p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
            {[
              ["Category", document.category],
              ["Document Type", document.documentType],
              ["File", document.fileName],
              ["File Size", fileSize(document.fileSize)],
              ["Reference", document.referenceNumber],
              ["Related To", document.relatedEntityName],
              ["Organization", document.organizationName],
              ["Issue Date", date(document.issueDate)],
              ["Expiry Date", date(document.expiryDate)],
              ["Status", documentStatus(document)],
              ["Uploaded By", document.uploadedBy],
              ["Uploaded Date", date(document.uploadedAt)],
              ["Last Updated", date(document.updatedAt)],
              ["Current Version", `v${document.currentVersion}`],
              ["Description", document.description],
              ["Tags", document.tags.join(", ")],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="font-semibold text-biz-muted">{k}</dt>
                <dd className="mt-1 text-biz-text">{v || "—"}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {tab === "versions" && (
        <div className="space-y-3">
          {document.versions.map((v) => (
            <div
              key={v.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded border border-biz-border p-3 text-xs"
            >
              <div>
                <p className="font-bold">
                  v{v.version} {v.current && <StatusBadge label="Current" tone="success" />}
                </p>
                <p className="mt-1 text-biz-muted">
                  {v.fileName} · {fileSize(v.fileSize)} · {date(v.uploadedAt)} · {v.uploadedBy}
                </p>
                <p className="mt-1">{v.changeNote}</p>
              </div>
              <div className="flex gap-2">
                <SecondaryButton size="sm" onClick={() => download(v.version)}>
                  View
                </SecondaryButton>
                <SecondaryButton size="sm" onClick={() => download(v.version)}>
                  Download
                </SecondaryButton>
              </div>
            </div>
          ))}
        </div>
      )}
      {tab === "replace" && (
        <div className="space-y-3">
          <p className="rounded bg-slate-50 p-3 text-xs">
            Current: v{document.currentVersion} · {document.fileName}
          </p>
          <Field label="Upload New File" required>
            <input
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
              className="h-11 w-full rounded border border-biz-border p-2 text-xs"
              onChange={(e) => setNewFile(e.target.files?.[0] ?? null)}
            />
          </Field>
          <Field label="Change Note">
            <TextInput value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <PrimaryButton disabled={!newFile || busy} onClick={replace}>
            {busy ? "Saving..." : "Save as New Version"}
          </PrimaryButton>
        </div>
      )}
      {tab === "edit" && (
        <div className="space-y-3">
          <Field label="Document Name">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Reference Number">
            <TextInput value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
          <PrimaryButton
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const updated = await documentService.update(document.id, { name, referenceNumber: reference });
                onChange(updated);
                setTab("details");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Saving..." : "Save Metadata"}
          </PrimaryButton>
        </div>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        <SecondaryButton onClick={() => download()}>
          <Download className="h-4 w-4" />
          Download
        </SecondaryButton>
        {!document.archivedAt ? (
          <SecondaryButton
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                onChange(await documentService.archive(document.id, "Archived from document details"));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Archive className="h-4 w-4" />
            Archive
          </SecondaryButton>
        ) : (
          <PrimaryButton
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                onChange(await documentService.restore(document.id));
              } finally {
                setBusy(false);
              }
            }}
          >
            <RefreshCcw className="h-4 w-4" />
            Restore
          </PrimaryButton>
        )}
      </div>
    </Overlay>
  );
}

export function DocumentWorkspace({ view = "center" }: { view?: View }) {
  useSetBreadcrumb([
    { label: "Documents", href: view === "center" ? undefined : "/documents" },
    ...(view !== "center" ? [{ label: META[view].title }] : []),
  ]);
  const [documents, setDocuments] = React.useState<ErpDocument[]>([]),
    [loading, setLoading] = React.useState(true),
    [draft, setDraft] = React.useState<DocumentFilters>(EMPTY_FILTERS),
    [filters, setFilters] = React.useState<DocumentFilters>(EMPTY_FILTERS),
    [page, setPage] = React.useState(1),
    [upload, setUpload] = React.useState(false),
    [selected, setSelected] = React.useState<ErpDocument | null>(null),
    limit = 8;

  const reload = React.useCallback(() => {
    setLoading(true);
    documentService
      .list()
      .then(setDocuments)
      .finally(() => setLoading(false));
  }, []);
  // `loading` already starts true, so the initial fetch doesn't need to set it again —
  // avoids a synchronous setState call directly in the effect body.
  React.useEffect(() => {
    documentService
      .list()
      .then(setDocuments)
      .finally(() => setLoading(false));
  }, []);
  const scoped = React.useMemo(
      () => documents.filter((d) => categoryMatch(d, view)),
      [documents, view],
    ),
    types = [...new Set(scoped.map((d) => d.documentType))],
    organizations = [...new Set(scoped.map((d) => d.organizationName).filter(Boolean))] as string[];
  const filtered = React.useMemo(
      () =>
        scoped.filter((d) => {
          const status = documentStatus(d),
            uploadDate = d.uploadedAt;
          return (
            searchDocument(d, filters.search) &&
            (!filters.documentType || d.documentType === filters.documentType) &&
            (!filters.category || d.category === filters.category) &&
            (!filters.module || d.relatedModule === filters.module) &&
            (!filters.related ||
              (d.relatedEntityName ?? "").toLowerCase().includes(filters.related.toLowerCase())) &&
            (!filters.organization || d.organizationName === filters.organization) &&
            (!filters.status || status === filters.status) &&
            (!filters.dateFrom || uploadDate >= filters.dateFrom) &&
            (!filters.dateTo || uploadDate <= filters.dateTo) &&
            (!filters.expiryPeriod ||
              (Boolean(d.expiryDate) && daysUntil(d.expiryDate!) <= Number(filters.expiryPeriod)))
          );
        }),
      [scoped, filters],
    ),
    totalPages = Math.max(1, Math.ceil(filtered.length / limit)),
    safePage = Math.min(page, totalPages),
    rows = filtered.slice((safePage - 1) * limit, safePage * limit);
  const update = (changed: ErpDocument) => {
    setDocuments((all) => all.map((d) => (d.id === changed.id ? changed : d)));
    setSelected((current) => (current?.id === changed.id ? changed : current));
  };
  const expiring = scoped.filter((d) => documentStatus(d) === "Expiring Soon").length,
    expired = scoped.filter((d) => documentStatus(d) === "Expired").length;
  const summaries: Array<[string, number]> =
    view === "center"
      ? [
          ["Total Documents", scoped.length],
          ["Tender Documents", scoped.filter((d) => d.category === "Tender").length],
          ["Project Documents", scoped.filter((d) => d.category === "Project").length],
          ["Expiring Soon", expiring],
          ["Expired", expired],
        ]
      : view === "tenders"
        ? [
            ["Total Tender Documents", scoped.length],
            [
              "Active Tenders",
              new Set(
                scoped
                  .filter((d) => documentStatus(d) === "Active")
                  .map((d) => d.tenderId)
                  .filter(Boolean),
              ).size,
            ],
            ["Expiring Documents", expiring],
            [
              "Missing / Required Documents",
              scoped.filter((d) => documentStatus(d) === "Draft").length,
            ],
          ]
        : view === "projects"
          ? [
              ["Total Project Documents", scoped.length],
              [
                "Ongoing Project Documents",
                scoped.filter((d) => d.projectStatus === "Ongoing").length,
              ],
              [
                "Archived Project Documents",
                scoped.filter((d) => d.projectStatus === "Archived").length,
              ],
              ["Expiring Documents", expiring],
            ]
          : view === "company"
            ? [
                ["Total Documents", scoped.length],
                ["Active", scoped.filter((d) => documentStatus(d) === "Active").length],
                ["Expiring Soon", expiring],
                ["Expired", expired],
              ]
            : view === "expiring"
              ? [
                  [
                    "Expiring in 7 Days",
                    scoped.filter(
                      (d) =>
                        d.expiryDate &&
                        daysUntil(d.expiryDate) >= 0 &&
                        daysUntil(d.expiryDate) <= 7,
                    ).length,
                  ],
                  [
                    "Expiring in 15 Days",
                    scoped.filter(
                      (d) =>
                        d.expiryDate &&
                        daysUntil(d.expiryDate) >= 0 &&
                        daysUntil(d.expiryDate) <= 15,
                    ).length,
                  ],
                  [
                    "Expiring in 30 Days",
                    scoped.filter(
                      (d) =>
                        d.expiryDate &&
                        daysUntil(d.expiryDate) >= 0 &&
                        daysUntil(d.expiryDate) <= 30,
                    ).length,
                  ],
                  ["Expired", expired],
                ]
              : [
                  ["Total Documents", scoped.length],
                  ["Active", scoped.filter((d) => documentStatus(d) === "Active").length],
                  ["Expiring Soon", expiring],
                  ["Expired", expired],
                ];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row">
        <div>
          <h1 className="text-page-title text-biz-text">{META[view].title}</h1>
          <p className="mt-1 text-[13px] text-biz-muted">{META[view].subtitle}</p>
        </div>
        <div className="flex gap-2">
          {view !== "center" && (
            <Link href="/documents">
              <SecondaryButton>← Back to Documents</SecondaryButton>
            </Link>
          )}
          <PrimaryButton onClick={() => setUpload(true)}>
            <Plus className="h-4 w-4" />
            Upload Document
          </PrimaryButton>
        </div>
      </div>
      <div
        className={cn(
          "grid gap-3 sm:grid-cols-2",
          summaries.length === 5 ? "xl:grid-cols-5" : "xl:grid-cols-4",
        )}
      >
        {summaries.map(([label, value]) => (
          <Summary
            key={String(label)}
            label={String(label)}
            value={Number(value)}
            toneClass={
              label === "Expired"
                ? "text-red-600"
                : label === "Expiring Soon"
                  ? "text-orange-600"
                  : undefined
            }
          />
        ))}
      </div>
      <section className="rounded-lg border border-biz-border bg-white p-4 shadow-card">
        <div className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-7">
          <TextInput
            icon={Search}
            placeholder="Search documents..."
            value={draft.search}
            onChange={(e) => setDraft({ ...draft, search: e.target.value })}
          />
          <SelectInput
            placeholder="Document Type"
            value={draft.documentType}
            onChange={(e) => setDraft({ ...draft, documentType: e.target.value })}
            options={types.map((x) => ({ value: x, label: x }))}
          />
          <SelectInput
            placeholder="Category"
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
            options={DOCUMENT_CATEGORIES.map((x) => ({ value: x, label: x }))}
          />
          <SelectInput
            placeholder="Related Module"
            value={draft.module}
            onChange={(e) => setDraft({ ...draft, module: e.target.value })}
            options={DOCUMENT_MODULES.map((x) => ({ value: x, label: x }))}
          />
          <SelectInput
            placeholder="Organization"
            value={draft.organization}
            onChange={(e) => setDraft({ ...draft, organization: e.target.value })}
            options={organizations.map((x) => ({ value: x, label: x }))}
          />
          <SelectInput
            placeholder="Status"
            value={draft.status}
            onChange={(e) => setDraft({ ...draft, status: e.target.value })}
            options={["Active", "Expiring Soon", "Expired", "Archived", "Draft", "Renewed"].map(
              (x) => ({ value: x, label: x }),
            )}
          />
          <div className="flex gap-2">
            <SecondaryButton
              onClick={() => {
                setDraft(EMPTY_FILTERS);
                setFilters(EMPTY_FILTERS);
                setPage(1);
              }}
            >
              <RotateCcw className="h-4 w-4" />
            </SecondaryButton>
            <PrimaryButton
              className="flex-1"
              onClick={() => {
                setFilters(draft);
                setPage(1);
              }}
            >
              Filter
            </PrimaryButton>
          </div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <TextInput
            placeholder="Related Tender / Project"
            value={draft.related}
            onChange={(e) => setDraft({ ...draft, related: e.target.value })}
          />
          <TextInput
            type="date"
            value={draft.dateFrom}
            onChange={(e) => setDraft({ ...draft, dateFrom: e.target.value })}
          />
          <TextInput
            type="date"
            value={draft.dateTo}
            onChange={(e) => setDraft({ ...draft, dateTo: e.target.value })}
          />
          {view === "expiring" && (
            <SelectInput
              placeholder="Expiry Period"
              value={draft.expiryPeriod}
              onChange={(e) => setDraft({ ...draft, expiryPeriod: e.target.value })}
              options={[7, 15, 30, 60, 90].map((x) => ({
                value: String(x),
                label: `Within ${x} Days`,
              }))}
            />
          )}
        </div>
      </section>
      <section className="overflow-hidden rounded-lg border border-biz-border bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left text-[11px]">
            <thead className="bg-[#f4f7fb]">
              <tr>
                {[
                  "SL",
                  "Document",
                  "Type",
                  "Related To",
                  "Reference",
                  "Organization",
                  "Upload Date",
                  "Expiry Date",
                  "Days Remaining",
                  "Status",
                  "Uploaded By",
                  "Action",
                ].map((x) => (
                  <th key={x} className="px-3 py-3 font-semibold">
                    {x}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((d, i) => {
                const status = documentStatus(d);
                return (
                  <tr key={d.id} className="border-t border-biz-border">
                    <td className="px-3 py-3">{(safePage - 1) * limit + i + 1}</td>
                    <td className="max-w-52 px-3 font-semibold">
                      <button
                        className="text-left hover:text-biz-blue"
                        onClick={() => setSelected(d)}
                      >
                        {d.name}
                      </button>
                      <p className="font-normal text-biz-muted">
                        v{d.currentVersion} · {d.fileName}
                      </p>
                    </td>
                    <td className="px-3">{d.documentType}</td>
                    <td className="max-w-48 px-3">
                      {d.tenderId && <span className="font-semibold">{d.tenderId} · </span>}
                      {d.relatedEntityName ?? d.relatedModule}
                    </td>
                    <td className="px-3">{d.referenceNumber ?? d.certificateNumber ?? "—"}</td>
                    <td className="px-3">{d.organizationName ?? "—"}</td>
                    <td className="px-3">{date(d.uploadedAt)}</td>
                    <td className="px-3">{date(d.expiryDate)}</td>
                    <td
                      className={cn(
                        "px-3 font-semibold",
                        d.expiryDate && daysUntil(d.expiryDate) < 0
                          ? "text-red-600"
                          : d.expiryDate && daysUntil(d.expiryDate) <= 30
                            ? "text-orange-600"
                            : "",
                      )}
                    >
                      {daysRemaining(d.expiryDate)}
                    </td>
                    <td className="px-3">
                      <StatusBadge label={status} tone={tone(status)} />
                    </td>
                    <td className="px-3">{d.uploadedBy}</td>
                    <td className="px-3">
                      <div className="flex gap-1">
                        <button
                          title="View details"
                          onClick={() => setSelected(d)}
                          className="rounded border p-1.5 hover:text-biz-blue"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          title="Version history"
                          onClick={() => setSelected(d)}
                          className="rounded border p-1.5 hover:text-biz-blue"
                        >
                          <History className="h-3.5 w-3.5" />
                        </button>
                        <button
                          title={d.archivedAt ? "Restore" : "Archive"}
                          onClick={async () => {
                            update(
                              d.archivedAt
                                ? await documentService.restore(d.id)
                                : await documentService.archive(d.id, "Archived from document list"),
                            );
                          }}
                          className="rounded border p-1.5 hover:text-biz-blue"
                        >
                          {d.archivedAt ? (
                            <RefreshCcw className="h-3.5 w-3.5" />
                          ) : (
                            <Archive className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {loading ? (
          <div className="p-14 text-center text-sm font-semibold text-biz-muted">Loading documents...</div>
        ) : !rows.length ? (
          <div className="p-14 text-center">
            <FileClock className="mx-auto h-10 w-10 text-biz-muted" />
            <p className="mt-3 text-sm font-semibold">
              {view === "expiring"
                ? "No expiring documents."
                : view === "archived"
                  ? "No archived documents."
                  : "No documents found."}
            </p>
            <button
              className="mt-2 text-xs font-semibold text-biz-blue"
              onClick={() => {
                setDraft(EMPTY_FILTERS);
                setFilters(EMPTY_FILTERS);
              }}
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <Pagination
            page={safePage}
            limit={limit}
            total={filtered.length}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        )}
      </section>
      <UploadDialog open={upload} onClose={() => setUpload(false)} onSaved={reload} />
      {selected && (
        <DetailsDialog document={selected} onClose={() => setSelected(null)} onChange={update} />
      )}
    </div>
  );
}
