import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@bizovix/database";
import { Prisma as PrismaNamespace } from "@bizovix/database";
import type { PaginationMeta } from "@bizovix/types";
import { buildPaginationMeta } from "@bizovix/utils";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { AccountingService } from "../accounting/accounting.service";
import { CashBankService } from "../cash-bank/cash-bank.service";
import { TenderBankSettingsService } from "../settings-tender-bank/tender-bank-settings.service";
import { CreateTenderSecurityDto } from "./dto/create-tender-security.dto";
import { QueryPendingTenderSecurityDto } from "./dto/query-pending-tender-security.dto";

const includePendingRelations = {
  organizationMaster: { select: { id: true, shortName: true, fullName: true } },
  cmsWork: { select: { id: true } },
} satisfies Prisma.DocumentPurchaseInclude;

const includeRunningTenderRelations = {
  organizationMaster: { select: { id: true, shortName: true, fullName: true } },
  documentPurchases: {
    select: {
      id: true,
      purchaseDate: true,
      estimatedTenderAmount: true,
      tenderSecurityStatus: true,
    },
    orderBy: { purchaseDate: "desc" as const },
  },
} satisfies Prisma.TenderInclude;

const includeTenderSecurityRelations = {
  items: true,
} satisfies Prisma.TenderSecurityInclude;

type RunningTenderRecord = Prisma.TenderGetPayload<{ include: typeof includeRunningTenderRelations }>;
type TenderSecurityRecord = Prisma.TenderSecurityGetPayload<{ include: typeof includeTenderSecurityRelations }>;

/**
 * Real business rule: security amount = Estimated Tender Amount x the org's configured
 * default security percentage (TenderBankSetting.tsDefaultSecurityPct). If the document
 * purchase has no estimated tender amount on file, this honestly resolves to 0 rather
 * than fabricating a figure — the amount is still editable by the user before saving.
 */
const ACTIVE_TENDER_STATUSES = [
  "DRAFT",
  "PUBLISHED",
  "DOCUMENT_PURCHASED",
  "PREPARING",
  "SUBMITTED",
  "OPENED",
  "UNDER_PROCESS",
  "NOA",
] as const;

function runningTenderToDto(record: RunningTenderRecord, tsDefaultSecurityPct: PrismaNamespace.Decimal) {
  const pendingPurchase = record.documentPurchases.find((purchase) => purchase.tenderSecurityStatus === "PENDING");
  const createdPurchase = record.documentPurchases.find((purchase) => purchase.tenderSecurityStatus === "CREATED");
  const notRequiredPurchase = record.documentPurchases.find((purchase) => purchase.tenderSecurityStatus === "NOT_REQUIRED");
  const selectedPurchase = createdPurchase ?? pendingPurchase ?? notRequiredPurchase ?? record.documentPurchases[0] ?? null;
  const securityStatus = createdPurchase
    ? "CREATED"
    : pendingPurchase
      ? "PENDING"
      : notRequiredPurchase
        ? "NOT_REQUIRED"
        : "NO_DOCUMENT_PURCHASE";
  const securityAmount = record.estimatedTenderSecurityAmount
    ?? (selectedPurchase ? selectedPurchase.estimatedTenderAmount.mul(tsDefaultSecurityPct).div(100) : new PrismaNamespace.Decimal(0));

  return {
    id: record.id,
    tenderRecordId: record.id,
    documentPurchaseId: securityStatus === "PENDING" ? pendingPurchase?.id ?? null : null,
    tenderId: record.egpTenderId,
    organizationMasterId: record.organizationMasterId,
    organizationMaster: record.organizationMaster,
    tenderWorkName: record.workName,
    submissionDeadline: record.submissionDeadline ?? null,
    tenderSecurityValidUpTo: record.tenderSecurityValidUpTo ?? null,
    tenderStatus: record.status,
    securityAmount: securityAmount.toFixed(2),
    securityStatus,
    eligible: securityStatus === "PENDING",
    ineligibleReason: securityStatus === "CREATED"
      ? "Tender security already created"
      : securityStatus === "NOT_REQUIRED"
        ? "Tender security marked as not required"
        : securityStatus === "NO_DOCUMENT_PURCHASE"
          ? "Document Purchase is required first"
          : null,
  };
}

function tenderSecurityToDto(record: TenderSecurityRecord) {
  return {
    ...record,
    amount: record.amount.toFixed(2),
    marginAmount: record.marginAmount.toFixed(2),
    bankFinanceAmount: record.bankFinanceAmount.toFixed(2),
    interestRate: record.interestRate.toFixed(2),
    items: record.items.map((item) => ({
      ...item,
      securityAmount: item.securityAmount.toFixed(2),
      marginPercentage: item.marginPercentage.toFixed(2),
      marginAmount: item.marginAmount.toFixed(2),
      bankFinanceAmount: item.bankFinanceAmount.toFixed(2),
    })),
  };
}

@Injectable()
export class TenderSecuritiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly tenderBankSettings: TenderBankSettingsService,
    private readonly accounting: AccountingService,
    private readonly cashBank: CashBankService,
  ) {}

  async pending(
    organizationId: string,
    query: QueryPendingTenderSecurityDto,
  ): Promise<{ items: ReturnType<typeof runningTenderToDto>[]; meta: PaginationMeta }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 5;
    const settings = await this.tenderBankSettings.get(organizationId);
    const securityStatus = query.securityStatus ?? "PENDING";
    const securityWhere: Prisma.TenderWhereInput = securityStatus === "PENDING"
      ? { documentPurchases: { some: { tenderSecurityStatus: "PENDING" }, none: { tenderSecurityStatus: "CREATED" } } }
      : securityStatus === "CREATED"
        ? { documentPurchases: { some: { tenderSecurityStatus: "CREATED" } } }
        : securityStatus === "NOT_REQUIRED"
          ? { documentPurchases: { some: { tenderSecurityStatus: "NOT_REQUIRED" }, none: { tenderSecurityStatus: { in: ["PENDING", "CREATED"] } } } }
          : securityStatus === "NO_DOCUMENT_PURCHASE"
            ? { documentPurchases: { none: {} } }
            : {};
    const where: Prisma.TenderWhereInput = {
      organizationId,
      ...(query.tenderStatus
        ? { status: query.tenderStatus }
        : securityStatus === "PENDING"
          ? { status: { in: [...ACTIVE_TENDER_STATUSES] } }
          : {}),
      ...securityWhere,
      ...(query.organizationId ? { organizationMasterId: query.organizationId } : {}),
      ...(query.search
        ? {
            OR: [
              { workName: { contains: query.search, mode: "insensitive" } },
              { egpTenderId: { contains: query.search, mode: "insensitive" } },
              { organizationMaster: { shortName: { contains: query.search, mode: "insensitive" } } },
            ],
          }
        : {}),
      ...(query.fromDate || query.toDate
        ? {
            submissionDeadline: {
              ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
              ...(query.toDate ? { lte: new Date(query.toDate) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.tender.findMany({
        where,
        include: includeRunningTenderRelations,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.tender.count({ where }),
    ]);

    return {
      items: items.map((item) => runningTenderToDto(item, settings.tsDefaultSecurityPct)),
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  async create(organizationId: string, userId: string, dto: CreateTenderSecurityDto) {
    if (!dto.items.length) throw new BadRequestException("Select at least one tender");
    if (dto.items.some((item) => typeof item.referenceNo !== "string" || !item.referenceNo.trim())) {
      throw new BadRequestException("Reference No. (PO/BG No.) is required for each tender");
    }

    const documentPurchaseIds = dto.items.map((item) => item.documentPurchaseId);
    const uniqueIds = new Set(documentPurchaseIds);
    if (uniqueIds.size !== documentPurchaseIds.length) {
      throw new BadRequestException("Duplicate selected tender found");
    }

    const [bank, chargeAccount, purchases] = await Promise.all([
      this.prisma.bankAccount.findFirst({ where: { id: dto.bankId, organizationId } }),
      this.prisma.bankAccount.findFirst({ where: { id: dto.chargeFromAccountId, organizationId } }),
      this.prisma.documentPurchase.findMany({
        where: { id: { in: documentPurchaseIds }, organizationId, tenderSecurityStatus: "PENDING" },
        include: includePendingRelations,
      }),
    ]);

    if (!bank) throw new NotFoundException("Bank not found");
    if (!chargeAccount) throw new NotFoundException("Charge account not found");
    if (bank.accountType !== "BANK" || !bank.isActive) {
      throw new BadRequestException("Issuing bank account must be an active bank account");
    }
    if (chargeAccount.accountType !== "BANK" || !chargeAccount.isActive) {
      throw new BadRequestException("Company account must be an active bank account");
    }
    const issuingBankName = bank.bankName?.trim().toLocaleLowerCase();
    const companyBankName = chargeAccount.bankName?.trim().toLocaleLowerCase();
    if (!issuingBankName || !companyBankName || issuingBankName !== companyBankName) {
      throw new BadRequestException("Company account must belong to the issuing bank");
    }
    if (purchases.length !== documentPurchaseIds.length) {
      throw new BadRequestException("One or more selected tenders are not eligible");
    }

    const purchaseById = new Map(purchases.map((purchase) => [purchase.id, purchase]));
    let totalSecurity = new PrismaNamespace.Decimal(0);
    let totalMargin = new PrismaNamespace.Decimal(0);
    let totalBankFinance = new PrismaNamespace.Decimal(0);

    const items = dto.items.map((item) => {
      const purchase = purchaseById.get(item.documentPurchaseId);
      if (!purchase) throw new BadRequestException("Invalid selected tender");
      const securityAmount = new PrismaNamespace.Decimal(item.securityAmount);
      const marginPercentage = new PrismaNamespace.Decimal(item.marginPercentage);
      if (!securityAmount.isFinite() || securityAmount.lte(0) || securityAmount.decimalPlaces() > 2) {
        throw new BadRequestException("Security amount must be positive with at most two decimal places");
      }
      if (!marginPercentage.isFinite() || marginPercentage.lt(0) || marginPercentage.gt(100) || marginPercentage.decimalPlaces() > 2) {
        throw new BadRequestException("Margin percentage must be between 0 and 100 with at most two decimal places");
      }
      const marginAmount = securityAmount.mul(marginPercentage).div(100).toDecimalPlaces(2);
      const bankFinanceAmount = dto.fundingType === "LOAN"
        ? securityAmount
        : new PrismaNamespace.Decimal(0);
      totalSecurity = totalSecurity.plus(securityAmount);
      totalMargin = totalMargin.plus(marginAmount);
      totalBankFinance = totalBankFinance.plus(bankFinanceAmount);
      return {
        documentPurchaseId: item.documentPurchaseId,
        securityAmount,
        marginPercentage,
        marginAmount,
        bankFinanceAmount,
        referenceNo: item.referenceNo.trim(),
      };
    });

    const firstPurchase = purchases[0]!;
    const record = await this.prisma.$transaction(async (tx) => {
      // Claim pending purchases before posting so concurrent saves cannot deduct twice.
      const claimed = await tx.documentPurchase.updateMany({
        where: { id: { in: documentPurchaseIds }, organizationId, tenderSecurityStatus: "PENDING" },
        data: { tenderSecurityStatus: "CREATED" },
      });
      if (claimed.count !== documentPurchaseIds.length) {
        throw new BadRequestException("One or more selected tenders are no longer eligible");
      }
      const created = await tx.tenderSecurity.create({
        data: {
          organizationId,
          tenderId: firstPurchase.linkedTenderId,
          organizationMasterId: firstPurchase.organizationMasterId,
          bankAccountId: dto.bankId,
          chargeFromAccountId: dto.chargeFromAccountId,
          securityType: dto.securityType,
          fundingType: dto.fundingType,
          amount: totalSecurity,
          marginAmount: totalMargin,
          bankFinanceAmount: totalBankFinance,
          interestRate: dto.fundingType === "LOAN" ? dto.interestRate : 0,
          validityMonths: dto.validityMonths,
          issueDate: new Date(dto.issueDate),
          expiryDate: new Date(dto.expiryDate),
          remarks: dto.remarks,
          createdById: userId,
          items: { create: items },
        },
        include: includeTenderSecurityRelations,
      });
      for (const item of created.items) {
        if (item.marginAmount.isZero()) continue;
        const purchase = purchaseById.get(item.documentPurchaseId)!;
        const description = `Tender security margin - ${purchase.egpTenderId ?? purchase.tenderWorkName}`;
        await this.cashBank.post(tx, {
          organizationId, accountId: dto.chargeFromAccountId, direction: "OUT", amount: item.marginAmount,
          sourceModule: "TENDER_SECURITY", sourceType: "MARGIN", sourceId: item.id,
          referenceNo: item.referenceNo, description, transactionDate: created.issueDate, createdById: userId,
        });
        await this.accounting.post(tx, {
          organizationId, userId, journalDate: created.issueDate, referenceNo: item.referenceNo, description,
          sourceModule: "TENDER_SECURITY", sourceType: "MARGIN", sourceId: item.id,
          lines: [
            { systemKey: "BANK_MARGIN", projectId: purchase.cmsWork?.id, debit: item.marginAmount, credit: 0 },
            { bankAccountId: dto.chargeFromAccountId, projectId: purchase.cmsWork?.id, debit: 0, credit: item.marginAmount },
          ],
        });
      }
      await this.auditLogService.record({
        organizationId, userId, action: "create", entityType: "TenderSecurity",
        entityId: created.id, newValue: tenderSecurityToDto(created),
      }, tx);
      return created;
    }, { timeout: 30_000 });

    return tenderSecurityToDto(record);
  }

  async markNotRequired(organizationId: string, userId: string, documentPurchaseIds: string[]) {
    const result = await this.prisma.documentPurchase.updateMany({
      where: { id: { in: documentPurchaseIds }, organizationId, tenderSecurityStatus: "PENDING" },
      data: { tenderSecurityStatus: "NOT_REQUIRED" },
    });

    await this.auditLogService.record({
      organizationId,
      userId,
      action: "mark_not_required",
      entityType: "TenderSecurity",
      newValue: { documentPurchaseIds, count: result.count },
    });

    return { count: result.count };
  }
}
