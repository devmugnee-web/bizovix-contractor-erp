import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@bizovix/database";
import { Prisma as PrismaNamespace } from "@bizovix/database";
import type { PaginationMeta } from "@bizovix/types";
import { buildPaginationMeta } from "@bizovix/utils";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { TenderBankSettingsService } from "../settings-tender-bank/tender-bank-settings.service";
import { CreateTenderSecurityDto } from "./dto/create-tender-security.dto";
import { QueryPendingTenderSecurityDto } from "./dto/query-pending-tender-security.dto";

const includePendingRelations = {
  organizationMaster: { select: { id: true, shortName: true, fullName: true } },
} satisfies Prisma.DocumentPurchaseInclude;

const includeTenderSecurityRelations = {
  items: true,
} satisfies Prisma.TenderSecurityInclude;

type PendingRecord = Prisma.DocumentPurchaseGetPayload<{ include: typeof includePendingRelations }>;
type TenderSecurityRecord = Prisma.TenderSecurityGetPayload<{ include: typeof includeTenderSecurityRelations }>;

/**
 * Real business rule: security amount = Estimated Tender Amount x the org's configured
 * default security percentage (TenderBankSetting.tsDefaultSecurityPct). If the document
 * purchase has no estimated tender amount on file, this honestly resolves to 0 rather
 * than fabricating a figure — the amount is still editable by the user before saving.
 */
function securityAmountFor(record: PendingRecord, tsDefaultSecurityPct: PrismaNamespace.Decimal): PrismaNamespace.Decimal {
  return record.estimatedTenderAmount.mul(tsDefaultSecurityPct).div(100);
}

function pendingToDto(record: PendingRecord, tsDefaultSecurityPct: PrismaNamespace.Decimal) {
  return {
    id: record.id,
    tenderId: record.egpTenderId,
    organizationMasterId: record.organizationMasterId,
    organizationMaster: record.organizationMaster,
    tenderWorkName: record.tenderWorkName,
    purchaseDate: record.purchaseDate,
    securityAmount: securityAmountFor(record, tsDefaultSecurityPct).toFixed(2),
    status: "Security Not Given" as const,
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
  ) {}

  async pending(
    organizationId: string,
    query: QueryPendingTenderSecurityDto,
  ): Promise<{ items: ReturnType<typeof pendingToDto>[]; meta: PaginationMeta }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 5;
    const settings = await this.tenderBankSettings.get(organizationId);
    const where: Prisma.DocumentPurchaseWhereInput = {
      organizationId,
      tenderSecurityStatus: "PENDING",
      ...(query.organizationId ? { organizationMasterId: query.organizationId } : {}),
      ...(query.search
        ? {
            OR: [
              { tenderWorkName: { contains: query.search, mode: "insensitive" } },
              { egpTenderId: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(query.fromDate || query.toDate
        ? {
            purchaseDate: {
              ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
              ...(query.toDate ? { lte: new Date(query.toDate) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.documentPurchase.findMany({
        where,
        include: includePendingRelations,
        orderBy: { purchaseDate: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.documentPurchase.count({ where }),
    ]);

    return {
      items: items.map((item) => pendingToDto(item, settings.tsDefaultSecurityPct)),
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  async create(organizationId: string, userId: string, dto: CreateTenderSecurityDto) {
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
      const marginAmount = securityAmount.mul(marginPercentage).div(100);
      const bankFinanceAmount = securityAmount.minus(marginAmount);
      totalSecurity = totalSecurity.plus(securityAmount);
      totalMargin = totalMargin.plus(marginAmount);
      totalBankFinance = totalBankFinance.plus(bankFinanceAmount);
      return {
        documentPurchaseId: item.documentPurchaseId,
        securityAmount,
        marginPercentage,
        marginAmount,
        bankFinanceAmount,
        referenceNo: item.referenceNo,
      };
    });

    const firstPurchase = purchases[0]!;
    const record = await this.prisma.$transaction(async (tx) => {
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
          interestRate: dto.interestRate,
          validityMonths: dto.validityMonths,
          issueDate: new Date(dto.issueDate),
          expiryDate: new Date(dto.expiryDate),
          remarks: dto.remarks,
          createdById: userId,
          items: { create: items },
        },
        include: includeTenderSecurityRelations,
      });
      await tx.documentPurchase.updateMany({
        where: { id: { in: documentPurchaseIds }, organizationId },
        data: { tenderSecurityStatus: "CREATED" },
      });
      return created;
    });

    await this.auditLogService.record({
      organizationId,
      userId,
      action: "create",
      entityType: "TenderSecurity",
      entityId: record.id,
      newValue: tenderSecurityToDto(record),
    });

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
