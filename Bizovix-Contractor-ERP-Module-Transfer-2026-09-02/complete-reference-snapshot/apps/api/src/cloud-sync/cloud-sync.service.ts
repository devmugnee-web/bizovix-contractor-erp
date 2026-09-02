import { BadRequestException, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID, timingSafeEqual } from "node:crypto";

import type { AppEnvironment } from "../config/env.schema.js";
import { PrismaService } from "../prisma/prisma.service.js";

type WorkspaceBackupCounts = {
  parties: number;
  items: number;
  categories: number;
  units: number;
  vouchers: number;
  settings: number;
};

type CloudBackupInput = {
  tenantId: string;
  companyId: string;
  workspaceId: string;
  workspaceName: string;
  sourceDeviceId: string;
  backupVersion: number;
  exportType: string;
  checksumSha256: string;
  sizeBytes: number;
  counts: WorkspaceBackupCounts;
  payload: Record<string, unknown>;
};

type CloudWorkspaceBackupRow = {
  id: string;
  tenantId: string;
  companyId: string;
  workspaceId: string;
  workspaceName: string;
  sourceDeviceId: string;
  backupVersion: number;
  exportType: string;
  checksumSha256: string;
  sizeBytes: number;
  counts: unknown;
  createdAt: Date;
};

@Injectable()
export class CloudSyncService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly configService: ConfigService<AppEnvironment, true>,
  ) {}

  assertCloudToken(authorization?: string, tokenHeader?: string) {
    const token = tokenHeader || authorization?.replace(/^Bearer\s+/i, "").trim();
    const expected = this.getExpectedToken();

    if (!token || !this.safeCompare(token, expected)) {
      throw new ForbiddenException("Cloud sync access denied");
    }
  }

  async listWorkspaceBackups(workspaceId?: string) {
    if (!workspaceId?.trim()) {
      throw new BadRequestException("workspaceId is required");
    }

    const rows = await this.prisma.$queryRaw<CloudWorkspaceBackupRow[]>`
      SELECT
        "id",
        "tenantId",
        "companyId",
        "workspaceId",
        "workspaceName",
        "sourceDeviceId",
        "backupVersion",
        "exportType",
        "checksumSha256",
        "sizeBytes",
        "counts",
        "createdAt"
      FROM "CloudWorkspaceBackup"
      WHERE "workspaceId" = ${workspaceId.trim()}
      ORDER BY "createdAt" DESC
      LIMIT 20
    `;

    return rows.map((row) => this.serializeBackupRow(row));
  }

  async createWorkspaceBackup(body: unknown) {
    const input = this.parseBackupInput(body);
    const maxSizeBytes = this.getMaxBackupSizeBytes();

    if (input.sizeBytes > maxSizeBytes) {
      throw new BadRequestException(`Backup is too large. Maximum size is ${Math.round(maxSizeBytes / (1024 * 1024))} MB`);
    }

    const rows = await this.prisma.$queryRaw<CloudWorkspaceBackupRow[]>`
      INSERT INTO "CloudWorkspaceBackup" (
        "id",
        "tenantId",
        "companyId",
        "workspaceId",
        "workspaceName",
        "sourceDeviceId",
        "backupVersion",
        "exportType",
        "checksumSha256",
        "sizeBytes",
        "counts",
        "payload"
      )
      VALUES (
        ${randomUUID()},
        ${input.tenantId},
        ${input.companyId},
        ${input.workspaceId},
        ${input.workspaceName},
        ${input.sourceDeviceId},
        ${input.backupVersion},
        ${input.exportType},
        ${input.checksumSha256},
        ${input.sizeBytes},
        CAST(${JSON.stringify(input.counts)} AS jsonb),
        CAST(${JSON.stringify(input.payload)} AS jsonb)
      )
      ON CONFLICT ("workspaceId", "checksumSha256")
      DO UPDATE SET "createdAt" = CURRENT_TIMESTAMP
      RETURNING
        "id",
        "tenantId",
        "companyId",
        "workspaceId",
        "workspaceName",
        "sourceDeviceId",
        "backupVersion",
        "exportType",
        "checksumSha256",
        "sizeBytes",
        "counts",
        "createdAt"
    `;

    return this.serializeBackupRow(rows[0]);
  }

  private parseBackupInput(body: unknown): CloudBackupInput {
    const value = body as Partial<Record<keyof CloudBackupInput, unknown>>;
    const tenantId = this.requiredString(value.tenantId, "tenantId");
    const companyId = this.requiredString(value.companyId, "companyId");
    const workspaceId = this.requiredString(value.workspaceId, "workspaceId");
    const workspaceName = this.requiredString(value.workspaceName, "workspaceName");
    const sourceDeviceId = this.requiredString(value.sourceDeviceId, "sourceDeviceId");
    const exportType = this.requiredString(value.exportType, "exportType");
    const checksumSha256 = this.requiredString(value.checksumSha256, "checksumSha256");
    const backupVersion = Number(value.backupVersion);
    const sizeBytes = Number(value.sizeBytes);

    if (!Number.isInteger(backupVersion) || backupVersion < 1) {
      throw new BadRequestException("backupVersion must be a positive integer");
    }

    if (!Number.isInteger(sizeBytes) || sizeBytes < 1) {
      throw new BadRequestException("sizeBytes must be a positive integer");
    }

    if (!/^[a-f0-9]{64}$/i.test(checksumSha256)) {
      throw new BadRequestException("checksumSha256 must be a SHA-256 hex digest");
    }

    return {
      tenantId,
      companyId,
      workspaceId,
      workspaceName,
      sourceDeviceId,
      backupVersion,
      exportType,
      checksumSha256: checksumSha256.toLowerCase(),
      sizeBytes,
      counts: this.parseCounts(value.counts),
      payload: this.parsePayload(value.payload),
    };
  }

  private parseCounts(value: unknown): WorkspaceBackupCounts {
    const counts = value as Partial<WorkspaceBackupCounts>;
    return {
      parties: this.nonNegativeCount(counts?.parties, "parties"),
      items: this.nonNegativeCount(counts?.items, "items"),
      categories: this.nonNegativeCount(counts?.categories, "categories"),
      units: this.nonNegativeCount(counts?.units, "units"),
      vouchers: this.nonNegativeCount(counts?.vouchers, "vouchers"),
      settings: this.nonNegativeCount(counts?.settings, "settings"),
    };
  }

  private parsePayload(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new BadRequestException("payload must be a JSON object");
    }

    return value as Record<string, unknown>;
  }

  private requiredString(value: unknown, field: string) {
    if (typeof value !== "string" || !value.trim()) {
      throw new BadRequestException(`${field} is required`);
    }

    return value.trim();
  }

  private nonNegativeCount(value: unknown, field: string) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new BadRequestException(`${field} count must be a non-negative integer`);
    }

    return parsed;
  }

  private serializeBackupRow(row: CloudWorkspaceBackupRow | undefined) {
    if (!row) {
      throw new BadRequestException("Backup could not be saved");
    }

    return {
      id: row.id,
      tenantId: row.tenantId,
      companyId: row.companyId,
      workspaceId: row.workspaceId,
      workspaceName: row.workspaceName,
      sourceDeviceId: row.sourceDeviceId,
      backupVersion: row.backupVersion,
      exportType: row.exportType,
      checksumSha256: row.checksumSha256,
      sizeBytes: row.sizeBytes,
      counts: row.counts,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private getExpectedToken() {
    const configuredToken = this.configService.get("CLOUD_SYNC_TOKEN", { infer: true })?.trim();
    if (configuredToken) {
      return configuredToken;
    }

    if (this.configService.get("NODE_ENV", { infer: true }) === "production") {
      throw new ForbiddenException("Cloud sync token is not configured");
    }

    return "local-cloud-dev-token";
  }

  private getMaxBackupSizeBytes() {
    return this.configService.get("CLOUD_SYNC_MAX_BACKUP_MB", { infer: true }) * 1024 * 1024;
  }

  private safeCompare(left: string, right: string) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }
}
