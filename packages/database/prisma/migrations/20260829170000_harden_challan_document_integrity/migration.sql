-- One active document occupies one evidence slot on a Challan. Archived rows remain
-- available as history and do not block a replacement upload.
CREATE UNIQUE INDEX "documents_challanSubmissionId_documentType_active_key"
  ON "documents"("challanSubmissionId", "documentType")
  WHERE "challanSubmissionId" IS NOT NULL
    AND "documentType" IS NOT NULL
    AND "status" <> 'ARCHIVED';

-- Version numbers are allocated per document and must stay collision-free under concurrency.
CREATE UNIQUE INDEX "document_versions_documentId_version_key"
  ON "document_versions"("documentId", "version");
