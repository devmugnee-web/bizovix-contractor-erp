import { DEMO_DOCUMENTS, type DocumentFilters, type ErpDocument } from "@/lib/documents";
export interface DocumentService {
  list(filters?: Partial<DocumentFilters>): ErpDocument[];
  createDemoDownload(
    document: ErpDocument,
    fileName?: string,
  ): { url: string; downloadName: string };
}
class DemoDocumentService implements DocumentService {
  list() {
    return structuredClone(DEMO_DOCUMENTS);
  }
  createDemoDownload(document: ErpDocument, fileName = document.fileName) {
    const content = `Demo document placeholder\nDocument: ${document.name}\nReference: ${document.referenceNumber ?? "N/A"}\n`;
    return {
      url: URL.createObjectURL(new Blob([content], { type: "text/plain" })),
      downloadName: `${fileName}.demo.txt`,
    };
  }
}
// Replace this implementation with tenant-scoped NestJS endpoints and authorized object storage.
export const documentService: DocumentService = new DemoDocumentService();
