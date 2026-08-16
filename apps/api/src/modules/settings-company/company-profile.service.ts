import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import type { UpdateCompanyProfileDto } from "./dto/company-profile.dto";

export type CompanyAssetKind = "logo" | "signature" | "seal";
type UploadedAssetFile = { originalname: string; mimetype: string; size: number; buffer: Buffer };

const ASSET_FIELDS: Record<CompanyAssetKind, { data: "logoData" | "signatureData" | "sealData"; mime: "logoMimeType" | "signatureMimeType" | "sealMimeType" }> = {
  logo: { data: "logoData", mime: "logoMimeType" },
  signature: { data: "signatureData", mime: "signatureMimeType" },
  seal: { data: "sealData", mime: "sealMimeType" },
};
const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);
const MAX_ASSET_SIZE = 2 * 1024 * 1024;

function redact<T extends Record<string, unknown>>(row: T) {
  const { logoData, signatureData, sealData, ...rest } = row as T & {
    logoData?: unknown;
    signatureData?: unknown;
    sealData?: unknown;
  };
  return {
    ...rest,
    hasLogo: !!logoData,
    hasSignature: !!signatureData,
    hasSeal: !!sealData,
  };
}

@Injectable()
export class CompanyProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async get(org: string) {
    const row = await this.prisma.companyProfile.upsert({
      where: { organizationId: org },
      update: {},
      create: { organizationId: org },
    });
    return redact(row);
  }

  async update(org: string, userId: string, dto: UpdateCompanyProfileDto) {
    const old = await this.get(org);
    const row = await this.prisma.companyProfile.update({
      where: { organizationId: org },
      data: { ...dto, updatedById: userId },
    });
    await this.audit.record({
      organizationId: org,
      userId,
      action: "update",
      module: "Settings",
      entityType: "CompanyProfile",
      entityId: row.id,
      oldValue: old,
      newValue: redact(row),
    });
    return redact(row);
  }

  async uploadAsset(org: string, userId: string, kind: CompanyAssetKind, file: UploadedAssetFile) {
    if (!file) throw new BadRequestException("Select a file to upload");
    if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype))
      throw new BadRequestException("Only PNG, JPG, WEBP or SVG images are allowed");
    if (file.size > MAX_ASSET_SIZE) throw new BadRequestException("File must be smaller than 2 MB");
    await this.prisma.companyProfile.upsert({
      where: { organizationId: org },
      update: {},
      create: { organizationId: org },
    });
    const fields = ASSET_FIELDS[kind];
    const row = await this.prisma.companyProfile.update({
      where: { organizationId: org },
      data: { [fields.data]: Uint8Array.from(file.buffer), [fields.mime]: file.mimetype, updatedById: userId },
    });
    await this.audit.record({
      organizationId: org,
      userId,
      action: "upload",
      module: "Settings",
      entityType: "CompanyProfile",
      entityId: row.id,
      description: `Company ${kind} uploaded`,
    });
    return redact(row);
  }

  async getAsset(org: string, kind: CompanyAssetKind) {
    const row = await this.prisma.companyProfile.findUnique({ where: { organizationId: org } });
    const fields = ASSET_FIELDS[kind];
    const data = row?.[fields.data] as Buffer | null | undefined;
    const mimeType = row?.[fields.mime] as string | null | undefined;
    if (!data || !mimeType) throw new NotFoundException(`Company ${kind} not uploaded`);
    return { data, mimeType };
  }
}
