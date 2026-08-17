import {
  apiRequest,
  apiRequestPaginated,
  downloadDocument as downloadDocumentBlob,
} from "@bizovix/api-client";
import type { CreateDocumentInput, DocumentRecord, UpdateDocumentInput } from "@bizovix/types";
import type { DocumentCategory, DocumentModule, DocumentVersion, ErpDocument } from "@/lib/documents";

function mapVersion(v: NonNullable<DocumentRecord["versions"]>[number], currentVersion: number): DocumentVersion {
  return {
    id: v.id,
    version: v.version,
    fileName: v.fileName,
    fileSize: v.fileSize,
    uploadedAt: v.createdAt.slice(0, 10),
    uploadedBy: v.uploadedByName ?? "Unknown",
    changeNote: v.changeNote ?? "",
    current: v.version === currentVersion,
  };
}

function mapToErpDocument(d: DocumentRecord): ErpDocument {
  return {
    id: d.id,
    name: d.name,
    fileName: d.fileName ?? "—",
    fileType: d.fileType ?? "application/octet-stream",
    fileSize: d.fileSize ?? 0,
    category: (d.category as DocumentCategory) ?? "Other",
    documentType: d.documentType ?? "",
    relatedModule: (d.relatedModule as DocumentModule) ?? "General",
    relatedEntityId: d.relatedEntityId ?? undefined,
    relatedEntityName: d.relatedEntityName ?? undefined,
    organizationName: d.relatedEntityName ?? undefined,
    referenceNumber: d.referenceNumber ?? undefined,
    certificateNumber: d.certificateNumber ?? undefined,
    issuingAuthority: d.issuingAuthority ?? undefined,
    account: d.account ?? undefined,
    amount: d.amount ? Number(d.amount) : undefined,
    issueDate: d.issueDate?.slice(0, 10),
    expiryDate: d.expiryDate?.slice(0, 10),
    reminderDays: d.reminderDays ?? undefined,
    responsiblePerson: d.responsiblePerson ?? undefined,
    description: d.description ?? undefined,
    tags: d.tags,
    manualStatus: d.status === "DRAFT" ? "Draft" : d.status === "RENEWED" ? "Renewed" : undefined,
    currentVersion: d.currentVersion,
    versions: (d.versions ?? []).map((v) => mapVersion(v, d.currentVersion)),
    uploadedBy: d.uploadedByName ?? "Unknown",
    uploadedAt: d.createdAt.slice(0, 10),
    updatedAt: d.updatedAt.slice(0, 10),
    archivedAt: d.archivedAt?.slice(0, 10),
    archivedBy: d.archivedByName ?? undefined,
    archiveReason: d.archiveReason ?? undefined,
  };
}

export const documentService = {
  async list(): Promise<ErpDocument[]> {
    const { items } = await apiRequestPaginated<DocumentRecord>("/documents", { params: { limit: 500 } });
    return items.map(mapToErpDocument);
  },

  async create(input: CreateDocumentInput, file: File): Promise<ErpDocument> {
    const record = await apiRequest<DocumentRecord>("/documents", {
      method: "POST",
      body: (() => {
        const form = new FormData();
        for (const [key, value] of Object.entries(input)) {
          if (value !== undefined && value !== null && value !== "") form.append(key, String(value));
        }
        form.append("file", file);
        return form;
      })(),
    });
    return mapToErpDocument(record);
  },

  async update(id: string, input: UpdateDocumentInput): Promise<ErpDocument> {
    const record = await apiRequest<DocumentRecord>(`/documents/${id}`, { method: "PATCH", body: input });
    return mapToErpDocument(record);
  },

  async addVersion(id: string, file: File, changeNote?: string): Promise<ErpDocument> {
    const form = new FormData();
    if (changeNote) form.append("changeNote", changeNote);
    form.append("file", file);
    const record = await apiRequest<DocumentRecord>(`/documents/${id}/versions`, { method: "POST", body: form });
    return mapToErpDocument(record);
  },

  async archive(id: string, reason?: string): Promise<ErpDocument> {
    const record = await apiRequest<DocumentRecord>(`/documents/${id}/archive`, { method: "PATCH", body: { reason } });
    return mapToErpDocument(record);
  },

  async restore(id: string): Promise<ErpDocument> {
    const record = await apiRequest<DocumentRecord>(`/documents/${id}/restore`, { method: "PATCH" });
    return mapToErpDocument(record);
  },

  async download(documentId: string, version?: number, fallbackName = "document"): Promise<void> {
    const { blob, fileName } = await downloadDocumentBlob(documentId, version);
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement("a");
    a.href = url;
    a.download = fileName ?? fallbackName;
    a.click();
    URL.revokeObjectURL(url);
  },
};
