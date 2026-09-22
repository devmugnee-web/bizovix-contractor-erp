import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@bizovix/database";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import type { UpdateNumberSequenceDto } from "./dto/numbering.dto";

export const NUMBERING_MODULE_KEYS = [
  "TENDER",
  "EXPENSE",
  "RECEIPT",
  "JOURNAL",
  "PAYMENT_VOUCHER",
  "RECEIPT_VOUCHER",
  "BANK_TRANSFER",
  "PG_BG",
  "TENDER_SECURITY",
  "DOCUMENT",
  "PROJECT",
  "CHEQUE",
  "INVOICE",
  "PROJECT_BILL",
  "CHALLAN_SUBMISSION",
  "VARIATION_ORDER",
  "TIME_EXTENSION",
  "COMPLETION_CERTIFICATE",
  "DLP_DEFECT",
  "RETENTION_RELEASE",
  "HANDOVER",
  "VENDOR",
  "SUBCONTRACTOR",
  "ITEM",
  "PURCHASE_REQUISITION",
  "RFQ",
  "COMPARATIVE_STATEMENT",
  "PURCHASE_ORDER",
  "GOODS_RECEIPT_NOTE",
  "SUPPLIER_BILL",
  "SUPPLIER_PAYMENT",
  "SALES_QUOTATION",
  "WORK_IOU",
  "ASSET",
  "LC",
  "LC_GRN",
  "EMPLOYEE",
] as const;
export type NumberingModuleKey = (typeof NUMBERING_MODULE_KEYS)[number];

const DEFAULT_PREFIX: Record<NumberingModuleKey, string> = {
  TENDER: "TND",
  EXPENSE: "EXP",
  RECEIPT: "RC",
  JOURNAL: "JV",
  PAYMENT_VOUCHER: "PV",
  RECEIPT_VOUCHER: "RV",
  BANK_TRANSFER: "TRF",
  PG_BG: "PG",
  TENDER_SECURITY: "TS",
  DOCUMENT: "DOC",
  PROJECT: "PRJ",
  CHEQUE: "CHQ",
  INVOICE: "INV",
  PROJECT_BILL: "RB",
  CHALLAN_SUBMISSION: "CH",
  VARIATION_ORDER: "VO",
  TIME_EXTENSION: "EOT",
  COMPLETION_CERTIFICATE: "CC",
  DLP_DEFECT: "DEF",
  RETENTION_RELEASE: "RR",
  HANDOVER: "HO",
  VENDOR: "VEN",
  SUBCONTRACTOR: "SUB",
  ITEM: "ITM",
  PURCHASE_REQUISITION: "PR",
  RFQ: "RFQ",
  COMPARATIVE_STATEMENT: "CS",
  PURCHASE_ORDER: "PO",
  GOODS_RECEIPT_NOTE: "GRN",
  SUPPLIER_BILL: "SB",
  SUPPLIER_PAYMENT: "SPY",
  SALES_QUOTATION: "QT",
  WORK_IOU: "WIOU",
  ASSET: "AST",
  LC: "LC",
  LC_GRN: "LCGRN",
  EMPLOYEE: "EMP",
};

/** RECEIPT keeps its pre-existing 5-digit format (the live ReceiptSequence counter
 * already produced "RC-2026-00024"-style numbers before this module existed) so newly
 * formatted numbers stay consistent with rows already in the database. */
const DEFAULT_SEQUENCE_LENGTH: Partial<Record<NumberingModuleKey, number>> = {
  RECEIPT: 5,
};

interface SequenceConfig {
  prefix: string;
  includeYear: boolean;
  yearFormat: string;
  separator: string;
  sequenceLength: number;
}

@Injectable()
export class NumberingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async ensureDefaults(org: string, tx: Prisma.TransactionClient | PrismaService = this.prisma) {
    // One native INSERT ... ON CONFLICT DO NOTHING statement avoids the
    // read-then-insert race Prisma's emulated upsert can hit when several first
    // allocations initialize the same tenant concurrently. Existing custom
    // configuration is never updated.
    await tx.numberSequence.createMany({
      data: NUMBERING_MODULE_KEYS.map((moduleKey) => ({
        organizationId: org,
        moduleKey,
        prefix: DEFAULT_PREFIX[moduleKey],
        sequenceLength: DEFAULT_SEQUENCE_LENGTH[moduleKey] ?? 4,
      })),
      skipDuplicates: true,
    });
  }

  async list(org: string) {
    await this.ensureDefaults(org);
    return this.prisma.numberSequence.findMany({
      where: { organizationId: org },
      orderBy: { moduleKey: "asc" },
    });
  }

  async getConfig(org: string, moduleKey: string) {
    await this.ensureDefaults(org);
    const row = await this.prisma.numberSequence.findUnique({
      where: { organizationId_moduleKey: { organizationId: org, moduleKey } },
    });
    if (!row) throw new NotFoundException(`Numbering config for ${moduleKey} not found`);
    return row;
  }

  format(config: SequenceConfig, year: number, sequenceValue: number) {
    const yearPart = config.includeYear
      ? config.yearFormat === "YY"
        ? String(year).slice(-2)
        : String(year)
      : null;
    const seqPart = String(sequenceValue).padStart(config.sequenceLength, "0");
    return [config.prefix, yearPart, seqPart].filter(Boolean).join(config.separator);
  }

  async preview(org: string, moduleKey: string) {
    const config = await this.getConfig(org, moduleKey);
    return this.format(config, new Date().getFullYear(), config.nextNumber);
  }

  async update(org: string, userId: string, moduleKey: string, dto: UpdateNumberSequenceDto) {
    const old = await this.getConfig(org, moduleKey);
    const row = await this.prisma.numberSequence.update({
      where: { organizationId_moduleKey: { organizationId: org, moduleKey } },
      data: { ...dto, updatedById: userId },
    });
    await this.audit.record({
      organizationId: org,
      userId,
      action: "update",
      module: "Settings",
      entityType: "NumberSequence",
      entityId: row.id,
      referenceNo: moduleKey,
      oldValue: old,
      newValue: row,
    });
    return row;
  }

  /**
   * Atomically consumes and formats the next number for (org, moduleKey). A single
   * parameterized UPDATE...RETURNING is the concurrency guard (mirrors ReceiptSequence's
   * increment pattern) — safe for concurrent callers without an explicit transaction.
   * Resets to 1 on year rollover when the sequence includes the year in its format.
   */
  async next(
    org: string,
    moduleKey: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    // Default creation and counter consumption belong to the same client. An
    // outer transaction must be able to roll back both, including a new tenant.
    await this.ensureDefaults(org, tx);
    const year = new Date().getFullYear();
    const rows = await tx.$queryRaw<
      Array<{
        prefix: string;
        includeYear: boolean;
        yearFormat: string;
        separator: string;
        sequenceLength: number;
        nextNumber: number;
      }>
    >`
      UPDATE "number_sequences"
      SET "nextNumber" = CASE WHEN "includeYear" AND ("lastYearUsed" IS DISTINCT FROM ${year}) THEN 2 ELSE "nextNumber" + 1 END,
          "lastYearUsed" = CASE WHEN "includeYear" THEN ${year} ELSE "lastYearUsed" END,
          "updatedAt" = now()
      WHERE "organizationId" = ${org} AND "moduleKey" = ${moduleKey}
      RETURNING "prefix", "includeYear", "yearFormat", "separator", "sequenceLength", "nextNumber"
    `;
    const row = rows[0];
    if (!row) throw new NotFoundException(`Numbering config for ${moduleKey} not found`);
    const consumed = row.nextNumber - 1;
    return this.format(row, year, consumed);
  }
}
