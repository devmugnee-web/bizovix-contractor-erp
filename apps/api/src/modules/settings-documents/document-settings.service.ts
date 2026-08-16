import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import type { UpdateDocumentSettingDto } from "./dto/document-settings.dto";

const MIME_BY_EXTENSION: Record<string, string> = {
  PDF: "application/pdf",
  DOC: "application/msword",
  DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  XLS: "application/vnd.ms-excel",
  XLSX: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  JPG: "image/jpeg",
  JPEG: "image/jpeg",
  PNG: "image/png",
};

@Injectable()
export class DocumentSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  get(org: string) {
    return this.prisma.documentSetting.upsert({
      where: { organizationId: org },
      update: {},
      create: { organizationId: org },
    });
  }

  async update(org: string, userId: string, dto: UpdateDocumentSettingDto) {
    const old = await this.get(org);
    const allowedFileTypes = dto.allowedFileTypes.map((t) => t.toUpperCase());
    const row = await this.prisma.documentSetting.update({
      where: { organizationId: org },
      data: { ...dto, allowedFileTypes, updatedById: userId },
    });
    await this.audit.record({
      organizationId: org,
      userId,
      action: "update",
      module: "Settings",
      entityType: "DocumentSetting",
      entityId: row.id,
      oldValue: old,
      newValue: row,
    });
    return row;
  }

  /** Server-side MIME allow-list derived from the configured extensions —
   * used to validate uploads regardless of what the client claims. */
  async allowedMimeTypes(org: string) {
    const setting = await this.get(org);
    return new Set(setting.allowedFileTypes.map((ext) => MIME_BY_EXTENSION[ext]).filter(Boolean));
  }

  async assertUploadAllowed(org: string, mimeType: string, sizeBytes: number) {
    const setting = await this.get(org);
    const allowed = await this.allowedMimeTypes(org);
    if (!allowed.has(mimeType)) return `File type not allowed. Permitted types: ${setting.allowedFileTypes.join(", ")}`;
    if (sizeBytes > setting.maxFileSizeMb * 1024 * 1024) return `File exceeds the ${setting.maxFileSizeMb} MB size limit`;
    return null;
  }
}
