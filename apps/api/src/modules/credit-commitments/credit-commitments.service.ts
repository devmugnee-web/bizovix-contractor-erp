import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@bizovix/database";
import { Prisma as PrismaNamespace } from "@bizovix/database";
import type { PaginationMeta } from "@bizovix/types";
import { buildPaginationMeta } from "@bizovix/utils";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateCreditCommitmentDto } from "./dto/create-credit-commitment.dto";
import { QueryCreditCommitmentDto } from "./dto/query-credit-commitment.dto";

const pendingInclude = {
  organizationMaster: { select: { id: true, shortName: true, fullName: true } },
} satisfies Prisma.DocumentPurchaseInclude;

const commitmentInclude = {
  items: true,
} satisfies Prisma.CreditCommitmentInclude;

type CommitmentRecord = Prisma.CreditCommitmentGetPayload<{ include: typeof commitmentInclude }>;

function toDto(record: CommitmentRecord) {
  return {
    ...record,
    amount: record.amount.toFixed(2),
    totalAmount: record.totalAmount.toFixed(2),
    items: record.items.map((item) => ({ ...item, chargeAmount: item.chargeAmount.toFixed(2) })),
  };
}

@Injectable()
export class CreditCommitmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async pending(organizationId: string, query: QueryCreditCommitmentDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 5;
    const where: Prisma.DocumentPurchaseWhereInput = {
      organizationId,
      creditCommitmentItems: { none: {} },
      ...(query.search
        ? {
            OR: [
              { tenderWorkName: { contains: query.search, mode: "insensitive" } },
              { egpTenderId: { contains: query.search, mode: "insensitive" } },
              { organizationMaster: { shortName: { contains: query.search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.documentPurchase.findMany({
        where,
        include: pendingInclude,
        orderBy: { purchaseDate: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.documentPurchase.count({ where }),
    ]);

    return {
      items: items.map((item) => ({
        id: item.id,
        tenderId: item.egpTenderId,
        organizationMaster: item.organizationMaster,
        tenderWorkName: item.tenderWorkName,
        purchaseDate: item.purchaseDate,
        // Real value only — no fabricated multiplier. A zero here honestly reflects
        // that no Estimated Tender Amount was recorded on the document purchase.
        estimatedTenderAmount: item.estimatedTenderAmount.toFixed(2),
      })),
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  async findAll(
    organizationId: string,
    query: QueryCreditCommitmentDto,
  ): Promise<{ items: ReturnType<typeof toDto>[]; meta: PaginationMeta }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 8;
    const where: Prisma.CreditCommitmentWhereInput = { organizationId, paymentFromAccountId: { not: null } };
    const [items, total] = await Promise.all([
      this.prisma.creditCommitment.findMany({
        where,
        include: commitmentInclude,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.creditCommitment.count({ where }),
    ]);
    return { items: items.map(toDto), meta: buildPaginationMeta(total, page, limit) };
  }

  async findOne(organizationId: string, id: string) {
    const record = await this.prisma.creditCommitment.findFirst({
      where: { id, organizationId },
      include: commitmentInclude,
    });
    if (!record) throw new NotFoundException("Credit commitment charge not found");
    return toDto(record);
  }

  async create(organizationId: string, userId: string, dto: CreateCreditCommitmentDto) {
    const purchaseIds = dto.items.map((item) => item.documentPurchaseId);
    const bankIds = [...new Set(dto.items.map((item) => item.bankAccountId))];
    if (new Set(purchaseIds).size !== purchaseIds.length) {
      throw new BadRequestException("Duplicate selected tender found");
    }

    const [paymentAccount, banks, purchases] = await Promise.all([
      this.prisma.bankAccount.findFirst({ where: { id: dto.paymentFromAccountId, organizationId } }),
      this.prisma.bankAccount.findMany({ where: { id: { in: bankIds }, organizationId } }),
      this.prisma.documentPurchase.findMany({
        where: { id: { in: purchaseIds }, organizationId, creditCommitmentItems: { none: {} } },
      }),
    ]);
    if (!paymentAccount) throw new NotFoundException("Payment account not found");
    if (banks.length !== bankIds.length) throw new BadRequestException("One or more banks are invalid");
    if (purchases.length !== purchaseIds.length) {
      throw new BadRequestException("One or more selected tenders are not eligible");
    }

    let totalAmount = new PrismaNamespace.Decimal(0);
    const items = dto.items.map((item) => {
      const chargeAmount = new PrismaNamespace.Decimal(item.chargeAmount);
      totalAmount = totalAmount.plus(chargeAmount);
      return {
        documentPurchaseId: item.documentPurchaseId,
        bankAccountId: item.bankAccountId,
        chargeAmount,
        remarks: item.remarks,
      };
    });
    const paymentDate = new Date(dto.paymentDate);
    // Header-level tenderId/organizationMasterId mirror the first selected item's tender —
    // a real relational link (not a string-matched guess) for the common single-tender case.
    const firstPurchase = purchases[0]!;

    const record = await this.prisma.$transaction((tx) =>
      tx.creditCommitment.create({
        data: {
          organizationId,
          tenderId: firstPurchase.linkedTenderId,
          organizationMasterId: firstPurchase.organizationMasterId,
          paymentFromAccountId: dto.paymentFromAccountId,
          paymentDate,
          remarks: dto.remarks,
          totalAmount,
          amount: totalAmount,
          chargeDate: paymentDate,
          isCharged: true,
          createdById: userId,
          items: { create: items },
        },
        include: commitmentInclude,
      }),
    );

    await this.auditLogService.record({
      organizationId,
      userId,
      action: "create",
      entityType: "CreditCommitment",
      entityId: record.id,
      newValue: toDto(record),
    });
    return toDto(record);
  }
}
