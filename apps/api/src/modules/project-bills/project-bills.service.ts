import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@bizovix/database";
import { buildPaginationMeta } from "@bizovix/utils";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectLifecycleGuardService } from "../prisma/project-lifecycle-guard.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { AccountingService } from "../accounting/accounting.service";
import { DeductionConfigsService } from "../deduction-configs/deduction-configs.service";
import { NumberingService } from "../settings-numbering/numbering.service";
import {
  SaveProjectBillDto,
  BillAdjustmentInputDto,
  BillItemInputDto,
} from "./dto/save-project-bill.dto";
import { QueryProjectBillDto } from "./dto/query-project-bill.dto";
import { calculateBillItem, summarizeBill } from "./bill-calculations";
import { assertBillQuantities, billQuantities, COMMITTED_BILL_STATUSES } from "./bill-availability";

type Tx = Prisma.TransactionClient;
const D = (v: Prisma.Decimal | number | string) => new Prisma.Decimal(v);

const includeRelations = {
  cmsWork: {
    select: {
      id: true,
      workName: true,
      organizationMaster: { select: { id: true, shortName: true } },
      tender: { select: { id: true, egpTenderId: true } },
    },
  },
  contract: {
    select: { id: true, contractNo: true, retentionPct: true, currentContractValue: true },
  },
  items: {
    include: { boqItem: { select: { id: true, itemCode: true } } },
    orderBy: { boqItem: { sortOrder: "asc" as const } },
  },
  adjustments: { orderBy: { sortOrder: "asc" as const } },
  receivable: true,
} satisfies Prisma.ProjectBillInclude;

type BillRecord = Prisma.ProjectBillGetPayload<{ include: typeof includeRelations }>;

function money(v: Prisma.Decimal) {
  return v.toFixed(2);
}

function toDto(record: BillRecord) {
  return {
    ...record,
    grossWorkValue: money(record.grossWorkValue),
    approvedAdditions: money(record.approvedAdditions),
    grossBillAmount: money(record.grossBillAmount),
    retentionPct: record.retentionPct?.toFixed(2) ?? null,
    retentionAmount: money(record.retentionAmount),
    retentionReleasedAmount: money(record.retentionReleasedAmount),
    vatRate: record.vatRate?.toFixed(4) ?? null,
    vatAmount: money(record.vatAmount),
    aitRate: record.aitRate?.toFixed(4) ?? null,
    aitAmount: money(record.aitAmount),
    otherDeductionAmount: money(record.otherDeductionAmount),
    netCertifiedAmount: money(record.netCertifiedAmount),
    receivedAmount: money(record.receivedAmount),
    items: record.items.map((item) => ({
      ...item,
      approvedRate: money(item.approvedRate),
      contractQty: item.contractQty.toFixed(3),
      previousQty: item.previousQty.toFixed(3),
      currentQty: item.currentQty.toFixed(3),
      cumulativeQty: item.cumulativeQty.toFixed(3),
      previousValue: money(item.previousValue),
      currentValue: money(item.currentValue),
      cumulativeValue: money(item.cumulativeValue),
    })),
    adjustments: record.adjustments.map((a) => ({
      ...a,
      rate: a.rate?.toFixed(4) ?? null,
      baseAmount: a.baseAmount ? money(a.baseAmount) : null,
      amount: money(a.amount),
    })),
    receivable: record.receivable
      ? {
          ...record.receivable,
          amount: money(record.receivable.amount),
          receivedAmount: money(record.receivable.receivedAmount),
        }
      : null,
  };
}

const EDITABLE_STATUSES = new Set(["DRAFT"]);
const CANCELLABLE_STATUSES = new Set(["DRAFT", "SUBMITTED", "UNDER_REVIEW", "REJECTED"]);

@Injectable()
export class ProjectBillsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly accounting: AccountingService,
    private readonly deductionConfigs: DeductionConfigsService,
    private readonly numbering: NumberingService,
    private readonly lifecycle: ProjectLifecycleGuardService,
  ) {}

  private async assertWork(organizationId: string, cmsWorkId: string) {
    const work = await this.prisma.cmsWork.findFirst({ where: { id: cmsWorkId, organizationId } });
    if (!work) throw new NotFoundException("Project / Work not found");
    return work;
  }

  private async assertContract(
    organizationId: string,
    contractId: string,
    client: PrismaService | Tx = this.prisma,
  ) {
    const contract = await client.projectContract.findFirst({
      where: { id: contractId, organizationId },
    });
    if (!contract) throw new NotFoundException("Contract not found");
    if (contract.status !== "ACTIVE")
      throw new BadRequestException("An active contract is required for billing");
    if (contract.currency !== "BDT")
      throw new BadRequestException("Project billing currently requires a BDT contract");
    return contract;
  }

  private async lockWork(tx: Tx, organizationId: string, cmsWorkId: string) {
    // Serialize quantity reservations and certification for this project.
    await tx.$queryRaw`SELECT id FROM cms_works WHERE id = ${cmsWorkId} AND "organizationId" = ${organizationId} FOR UPDATE`;
    await this.lifecycle.assertOperationalMutationAllowed(
      organizationId,
      cmsWorkId,
      "changing project bills",
      tx,
    );
  }

  async findAll(organizationId: string, query: QueryProjectBillDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const where: Prisma.ProjectBillWhereInput = {
      organizationId,
      ...(query.cmsWorkId ? { cmsWorkId: query.cmsWorkId } : {}),
      ...(query.billType ? { billType: query.billType } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.fromDate || query.toDate
        ? {
            billDate: {
              ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
              ...(query.toDate ? { lte: new Date(`${query.toDate}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { billNo: { contains: query.search, mode: "insensitive" } },
              { cmsWork: { workName: { contains: query.search, mode: "insensitive" } } },
              {
                cmsWork: {
                  tender: { egpTenderId: { contains: query.search, mode: "insensitive" } },
                },
              },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.projectBill.findMany({
        where,
        include: includeRelations,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.projectBill.count({ where }),
    ]);
    return { items: items.map(toDto), meta: buildPaginationMeta(total, page, limit) };
  }

  async stats(organizationId: string, cmsWorkId?: string) {
    const where: Prisma.ProjectBillWhereInput = {
      organizationId,
      ...(cmsWorkId ? { cmsWorkId } : {}),
    };
    const [total, certifiedAgg, retentionAgg] = await Promise.all([
      this.prisma.projectBill.count({ where }),
      this.prisma.projectBill.aggregate({
        where: { ...where, status: { in: ["CERTIFIED", "PARTIALLY_RECEIVED", "RECEIVED"] } },
        _sum: { grossBillAmount: true, netCertifiedAmount: true, receivedAmount: true },
      }),
      this.prisma.projectBill.aggregate({
        where: { ...where, status: { in: ["CERTIFIED", "PARTIALLY_RECEIVED", "RECEIVED"] } },
        _sum: { retentionAmount: true, retentionReleasedAmount: true },
      }),
    ]);
    const netCertified = D(certifiedAgg._sum.netCertifiedAmount ?? 0);
    const received = D(certifiedAgg._sum.receivedAmount ?? 0);
    const retentionHeld = D(retentionAgg._sum.retentionAmount ?? 0).sub(
      retentionAgg._sum.retentionReleasedAmount ?? 0,
    );
    return {
      totalBills: total,
      grossCertified: money(D(certifiedAgg._sum.grossBillAmount ?? 0)),
      netCertified: money(netCertified),
      received: money(received),
      outstanding: money(netCertified.sub(received)),
      retentionHeld: money(retentionHeld),
    };
  }

  async findOne(organizationId: string, id: string) {
    const record = await this.prisma.projectBill.findFirst({
      where: { id, organizationId },
      include: includeRelations,
    });
    if (!record) throw new NotFoundException("Running Bill not found");
    return toDto(record);
  }

  /** Backend-authoritative per-item calculation: fetches the CURRENT BoqItem ceiling
   * (which an approved Variation may have moved since the bill was drafted) and the sum of
   * currentQty already locked in by other CERTIFIED bills, then rejects any item whose
   * cumulative quantity would exceed that ceiling — the core over-billing guard. */
  private async calculateItems(
    tx: Tx,
    organizationId: string,
    cmsWorkId: string,
    items: BillItemInputDto[],
    excludeBillId: string | null,
  ) {
    assertBillQuantities(items);
    const boqItemIds = items.map((i) => i.boqItemId);
    const boqItems = await tx.boqItem.findMany({
      where: { id: { in: boqItemIds }, organizationId, cmsWorkId },
    });
    if (boqItems.length !== new Set(boqItemIds).size)
      throw new NotFoundException("One or more BOQ items were not found on this project");
    const boqById = new Map(boqItems.map((b) => [b.id, b]));

    const certifiedRows = await tx.projectBillItem.findMany({
      where: {
        boqItemId: { in: boqItemIds },
        bill: {
          organizationId,
          cmsWorkId,
          status: { in: COMMITTED_BILL_STATUSES },
          ...(excludeBillId ? { id: { not: excludeBillId } } : {}),
        },
      },
      select: { boqItemId: true, currentQty: true, bill: { select: { status: true } } },
    });

    return items.map((item) => {
      const boqItem = boqById.get(item.boqItemId)!;
      const quantities = billQuantities(
        boqItem.contractQty,
        certifiedRows.filter((row) => row.boqItemId === item.boqItemId),
      );
      if (D(item.currentQty).gt(quantities.remaining))
        throw new BadRequestException(
          `Billing quantity exceeds the available quantity for "${boqItem.description}". Check existing draft and submitted bills.`,
        );
      return calculateBillItem(boqItem, quantities.previous, item.currentQty);
    });
  }

  private calculateAdjustments(adjustments: BillAdjustmentInputDto[] | undefined) {
    return (adjustments ?? []).map((adj, index) => {
      const calculationType = adj.calculationType ?? "FIXED_AMOUNT";
      let amount: Prisma.Decimal;
      if (calculationType === "PERCENTAGE") {
        if (adj.rate === undefined || adj.baseAmount === undefined) {
          throw new BadRequestException(
            `Adjustment "${adj.type}" requires a rate and base amount for percentage calculation`,
          );
        }
        amount = D(adj.baseAmount).mul(adj.rate).div(100);
      } else {
        amount = D(adj.amount ?? 0);
      }
      return {
        type: adj.type,
        direction: adj.direction,
        description: adj.description,
        calculationType,
        rate: adj.rate,
        baseAmount: adj.baseAmount,
        amount,
        ledgerAccountId: adj.ledgerAccountId,
        sortOrder: index,
      };
    });
  }

  private summarize(
    items: Array<{ currentValue: Prisma.Decimal }>,
    adjustments: Array<{ direction: "ADDITION" | "DEDUCTION"; amount: Prisma.Decimal }>,
    retentionPct: Prisma.Decimal | null,
    vatRate: Prisma.Decimal | null,
    aitRate: Prisma.Decimal | null,
  ) {
    return summarizeBill(items, adjustments, retentionPct, vatRate, aitRate);
  }

  async preview(organizationId: string, dto: SaveProjectBillDto, excludeBillId?: string) {
    const contract = await this.assertContract(organizationId, dto.contractId);
    await this.lifecycle.assertOperationalMutationAllowed(
      organizationId,
      contract.cmsWorkId,
      "preparing project bills",
    );
    if (
      excludeBillId &&
      !(await this.prisma.projectBill.findFirst({
        where: {
          id: excludeBillId,
          organizationId,
          cmsWorkId: contract.cmsWorkId,
          status: "DRAFT",
        },
        select: { id: true },
      }))
    )
      throw new NotFoundException("Draft bill not found on this project");
    const totals = await this.prisma.$transaction(async (tx) => {
      const items = await this.calculateItems(
        tx,
        organizationId,
        contract.cmsWorkId,
        dto.items,
        excludeBillId ?? null,
      );
      const vat = await this.deductionConfigs.effectiveConfig(
        organizationId,
        "VAT",
        new Date(dto.billDate),
      );
      const ait = await this.deductionConfigs.effectiveConfig(
        organizationId,
        "AIT",
        new Date(dto.billDate),
      );
      return this.summarize(
        items,
        this.calculateAdjustments(dto.adjustments),
        dto.retentionPctOverride !== undefined
          ? D(dto.retentionPctOverride)
          : contract.retentionPct,
        vat ? D(vat.rate) : null,
        ait ? D(ait.rate) : null,
      );
    });
    return {
      grossWorkValue: money(totals.grossWorkValue),
      grossBillAmount: money(totals.grossBillAmount),
      retentionAmount: money(totals.retentionAmount),
      vatAmount: money(totals.vatAmount),
      aitAmount: money(totals.aitAmount),
      otherDeductionAmount: money(totals.otherDeductionAmount),
      netCertifiedAmount: money(totals.netCertifiedAmount),
    };
  }

  async saveDraft(
    organizationId: string,
    userId: string,
    id: string | null,
    dto: SaveProjectBillDto,
  ) {
    const contract = await this.assertContract(organizationId, dto.contractId);
    await this.lifecycle.assertOperationalMutationAllowed(
      organizationId,
      contract.cmsWorkId,
      "changing project bills",
    );
    await this.assertWork(organizationId, contract.cmsWorkId);

    const existing = id
      ? await this.prisma.projectBill.findFirst({ where: { id, organizationId } })
      : null;
    if (id && !existing) throw new NotFoundException("Running Bill not found");
    if (existing && existing.cmsWorkId !== contract.cmsWorkId)
      throw new BadRequestException("A bill cannot be moved to another project");
    if (existing && !EDITABLE_STATUSES.has(existing.status)) {
      throw new BadRequestException("Only a Draft bill can be edited");
    }
    if (dto.billType === "FINAL") {
      const otherFinal = await this.prisma.projectBill.findFirst({
        where: {
          organizationId,
          cmsWorkId: contract.cmsWorkId,
          billType: "FINAL",
          status: { notIn: ["CANCELLED", "REJECTED"] },
          ...(existing ? { id: { not: existing.id } } : {}),
        },
        select: { id: true },
      });
      if (otherFinal)
        throw new BadRequestException("Only one active Final Bill is allowed for a project");
    }

    const record = await this.prisma.$transaction(async (tx) => {
      await this.lockWork(tx, organizationId, contract.cmsWorkId);
      await this.assertContract(organizationId, contract.id, tx);
      if (existing) {
        const current = await tx.projectBill.findFirst({
          where: { id: existing.id, organizationId },
        });
        if (current?.status !== "DRAFT")
          throw new BadRequestException("Only a Draft bill can be edited");
      }
      if (
        dto.billType === "FINAL" &&
        (await tx.projectBill.findFirst({
          where: {
            organizationId,
            cmsWorkId: contract.cmsWorkId,
            billType: "FINAL",
            status: { notIn: ["CANCELLED", "REJECTED"] },
            ...(existing ? { id: { not: existing.id } } : {}),
          },
          select: { id: true },
        }))
      ) {
        throw new BadRequestException("Only one active Final Bill is allowed for a project");
      }
      const calculatedItems = await this.calculateItems(
        tx,
        organizationId,
        contract.cmsWorkId,
        dto.items,
        existing?.id ?? null,
      );
      const calculatedAdjustments = this.calculateAdjustments(dto.adjustments);
      const adjustmentAccountIds = calculatedAdjustments
        .map((item) => item.ledgerAccountId)
        .filter((id): id is string => Boolean(id));
      if (adjustmentAccountIds.length) {
        const allowed = await tx.ledgerAccount.findMany({
          where: {
            id: { in: adjustmentAccountIds },
            organizationId,
            isActive: true,
            isControlAccount: false,
          },
          select: { id: true },
        });
        if (allowed.length !== new Set(adjustmentAccountIds).size)
          throw new BadRequestException(
            "One or more adjustment ledger accounts are invalid, inactive, cross-tenant, or control accounts",
          );
      }
      const retentionPct =
        dto.retentionPctOverride !== undefined
          ? D(dto.retentionPctOverride)
          : contract.retentionPct;
      const vatConfig = await this.deductionConfigs.effectiveConfig(
        organizationId,
        "VAT",
        new Date(dto.billDate),
      );
      const aitConfig = await this.deductionConfigs.effectiveConfig(
        organizationId,
        "AIT",
        new Date(dto.billDate),
      );
      const totals = this.summarize(
        calculatedItems,
        calculatedAdjustments,
        retentionPct,
        vatConfig ? D(vatConfig.rate) : null,
        aitConfig ? D(aitConfig.rate) : null,
      );

      const billData = {
        billType: dto.billType ?? "RUNNING",
        billDate: new Date(dto.billDate),
        periodFrom: dto.periodFrom ? new Date(dto.periodFrom) : null,
        periodTo: dto.periodTo ? new Date(dto.periodTo) : null,
        clientCertificateRef: dto.clientCertificateRef,
        measurementBookRef: dto.measurementBookRef,
        remarks: dto.remarks,
        grossWorkValue: totals.grossWorkValue,
        approvedAdditions: totals.approvedAdditions,
        grossBillAmount: totals.grossBillAmount,
        retentionPct,
        retentionAmount: totals.retentionAmount,
        vatRate: vatConfig ? D(vatConfig.rate) : null,
        vatAmount: totals.vatAmount,
        aitRate: aitConfig ? D(aitConfig.rate) : null,
        aitAmount: totals.aitAmount,
        otherDeductionAmount: totals.otherDeductionAmount,
        netCertifiedAmount: totals.netCertifiedAmount,
      };

      if (existing) {
        await tx.projectBillItem.deleteMany({ where: { billId: existing.id } });
        await tx.billAdjustment.deleteMany({ where: { billId: existing.id } });
        return tx.projectBill.update({
          where: { id: existing.id },
          data: {
            contractId: contract.id,
            ...billData,
            items: { create: calculatedItems },
            adjustments: { create: calculatedAdjustments },
          },
          include: includeRelations,
        });
      }

      const billNo = await this.numbering.next(organizationId, "PROJECT_BILL", tx);
      return tx.projectBill.create({
        data: {
          organizationId,
          cmsWorkId: contract.cmsWorkId,
          contractId: contract.id,
          billNo,
          status: "DRAFT",
          createdById: userId,
          ...billData,
          items: { create: calculatedItems },
          adjustments: { create: calculatedAdjustments },
        },
        include: includeRelations,
      });
    });

    await this.auditLogService.record({
      organizationId,
      userId,
      action: existing ? "PROJECT_BILL_UPDATED" : "PROJECT_BILL_CREATED",
      entityType: "ProjectBill",
      entityId: record.id,
      referenceNo: record.billNo,
      newValue: toDto(record),
    });

    return toDto(record);
  }

  async submit(organizationId: string, userId: string, id: string) {
    const existing = await this.prisma.projectBill.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("Running Bill not found");
    await this.lifecycle.assertOperationalMutationAllowed(
      organizationId,
      existing.cmsWorkId,
      "submitting project bills",
    );
    if (existing.status !== "DRAFT")
      throw new BadRequestException("Only a Draft bill can be submitted");

    const record = await this.prisma.$transaction(async (tx) => {
      await this.lockWork(tx, organizationId, existing.cmsWorkId);
      const current = await tx.projectBill.findFirst({
        where: { id, organizationId },
        include: { items: true },
      });
      if (current?.status !== "DRAFT")
        throw new BadRequestException("Only a Draft bill can be submitted");
      await this.assertContract(organizationId, current.contractId, tx);
      await this.calculateItems(
        tx,
        organizationId,
        current.cmsWorkId,
        current.items.map((item) => ({
          boqItemId: item.boqItemId,
          currentQty: Number(item.currentQty),
        })),
        id,
      );
      return tx.projectBill.update({
        where: { id },
        data: { status: "SUBMITTED", submissionDate: new Date(), submittedById: userId },
        include: includeRelations,
      });
    });

    await this.auditLogService.record({
      organizationId,
      userId,
      action: "PROJECT_BILL_SUBMITTED",
      entityType: "ProjectBill",
      entityId: id,
      referenceNo: record.billNo,
      newValue: toDto(record),
    });

    return toDto(record);
  }

  async startReview(organizationId: string, userId: string, id: string) {
    const existing = await this.prisma.projectBill.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("Running Bill not found");
    await this.lifecycle.assertOperationalMutationAllowed(
      organizationId,
      existing.cmsWorkId,
      "certifying project bills",
    );
    if (existing.status !== "SUBMITTED")
      throw new BadRequestException("Only a Submitted bill can move to review");
    const record = await this.prisma.projectBill.update({
      where: { id },
      data: { status: "UNDER_REVIEW" },
      include: includeRelations,
    });
    await this.auditLogService.record({
      organizationId,
      userId,
      action: "PROJECT_BILL_UPDATED",
      entityType: "ProjectBill",
      entityId: id,
      referenceNo: record.billNo,
      description: "Moved to Under Review",
    });
    return toDto(record);
  }

  async reject(organizationId: string, userId: string, id: string) {
    const existing = await this.prisma.projectBill.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("Running Bill not found");
    await this.lifecycle.assertOperationalMutationAllowed(
      organizationId,
      existing.cmsWorkId,
      "rejecting project bills",
    );
    if (!["SUBMITTED", "UNDER_REVIEW"].includes(existing.status)) {
      throw new BadRequestException("Only a Submitted or Under Review bill can be rejected");
    }
    const record = await this.prisma.projectBill.update({
      where: { id },
      data: { status: "REJECTED" },
      include: includeRelations,
    });
    await this.auditLogService.record({
      organizationId,
      userId,
      action: "PROJECT_BILL_UPDATED",
      entityType: "ProjectBill",
      entityId: id,
      referenceNo: record.billNo,
      description: "Bill rejected",
    });
    return toDto(record);
  }

  async cancel(organizationId: string, userId: string, id: string) {
    const existing = await this.prisma.projectBill.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("Running Bill not found");
    await this.lifecycle.assertOperationalMutationAllowed(
      organizationId,
      existing.cmsWorkId,
      "cancelling project bills",
    );
    if (!CANCELLABLE_STATUSES.has(existing.status)) {
      throw new BadRequestException(
        "A Certified bill cannot be cancelled directly — this requires a formal reversal, which is not yet supported",
      );
    }
    const record = await this.prisma.projectBill.update({
      where: { id },
      data: { status: "CANCELLED" },
      include: includeRelations,
    });
    await this.auditLogService.record({
      organizationId,
      userId,
      action: "PROJECT_BILL_CANCELLED",
      entityType: "ProjectBill",
      entityId: id,
      referenceNo: record.billNo,
      oldValue: { status: existing.status },
    });
    return toDto(record);
  }

  /** Certification is the one atomic, authoritative, idempotent business event: re-validates
   * quantities against the live BOQ ceiling, snapshots rates so history stays reproducible,
   * locks the bill, updates BOQ execution, creates the Receivable, and posts the GL entry —
   * all inside a single transaction, or none of it happens. */
  async certify(organizationId: string, userId: string, id: string) {
    const existing = await this.prisma.projectBill.findFirst({
      where: { id, organizationId },
      include: {
        items: true,
        adjustments: true,
        contract: true,
        cmsWork: { include: { organizationMaster: true } },
      },
    });
    if (!existing) throw new NotFoundException("Running Bill not found");
    if (!["SUBMITTED", "UNDER_REVIEW"].includes(existing.status)) {
      throw new BadRequestException("Only a Submitted or Under Review bill can be certified");
    }

    const record = await this.prisma.$transaction(
      async (tx) => {
        await this.lockWork(tx, organizationId, existing.cmsWorkId);
        const alreadyPosted = await tx.journalEntry.findFirst({
          where: {
            organizationId,
            sourceModule: "PROJECT_BILL",
            sourceType: "CERTIFICATION",
            sourceId: id,
          },
        });
        if (alreadyPosted) {
          const already = await tx.projectBill.findFirst({
            where: { id },
            include: includeRelations,
          });
          return already!;
        }

        const current = await tx.projectBill.findFirst({ where: { id, organizationId } });
        if (!current || !["SUBMITTED", "UNDER_REVIEW"].includes(current.status))
          throw new BadRequestException("Only a Submitted or Under Review bill can be certified");
        await this.assertContract(organizationId, current.contractId, tx);

        const itemInputs: BillItemInputDto[] = existing.items.map((i) => ({
          boqItemId: i.boqItemId,
          currentQty: Number(i.currentQty),
        }));
        const calculatedItems = await this.calculateItems(
          tx,
          organizationId,
          existing.cmsWorkId,
          itemInputs,
          existing.id,
        );
        const vatConfig = await this.deductionConfigs.effectiveConfig(
          organizationId,
          "VAT",
          existing.billDate,
        );
        const aitConfig = await this.deductionConfigs.effectiveConfig(
          organizationId,
          "AIT",
          existing.billDate,
        );
        const adjustments = existing.adjustments.map((a) => ({
          direction: a.direction,
          amount: a.amount,
        }));
        const totals = this.summarize(
          calculatedItems,
          adjustments,
          existing.retentionPct,
          vatConfig ? D(vatConfig.rate) : null,
          aitConfig ? D(aitConfig.rate) : null,
        );

        await tx.projectBillItem.deleteMany({ where: { billId: id } });
        for (const item of calculatedItems) {
          await tx.projectBillItem.create({ data: { billId: id, ...item } });
          await tx.boqItem.update({
            where: { id: item.boqItemId },
            data: { executedQty: item.cumulativeQty, executedValue: item.cumulativeValue },
          });
        }

        const updated = await tx.projectBill.update({
          where: { id },
          data: {
            status: "CERTIFIED",
            certificationDate: new Date(),
            certifiedById: userId,
            grossWorkValue: totals.grossWorkValue,
            approvedAdditions: totals.approvedAdditions,
            grossBillAmount: totals.grossBillAmount,
            vatRate: vatConfig ? D(vatConfig.rate) : null,
            vatAmount: totals.vatAmount,
            aitRate: aitConfig ? D(aitConfig.rate) : null,
            aitAmount: totals.aitAmount,
            otherDeductionAmount: totals.otherDeductionAmount,
            netCertifiedAmount: totals.netCertifiedAmount,
            retentionAmount: totals.retentionAmount,
            retentionReleaseDueDate: existing.contract.dlpDays
              ? new Date(
                  existing.contract.currentCompletionDate.getTime() +
                    existing.contract.dlpDays * 86_400_000,
                )
              : null,
          },
        });

        const partyName = existing.cmsWork.organizationMaster.shortName;
        await tx.receivable.create({
          data: {
            organizationId,
            projectId: existing.cmsWorkId,
            contractId: existing.contractId,
            projectBillId: id,
            partyName,
            billNo: updated.billNo,
            billDate: updated.billDate,
            amount: totals.netCertifiedAmount,
          },
        });

        const deductionLines = adjustments
          .filter((a) => a.direction === "DEDUCTION")
          .map((a, index) => ({
            systemKey: "OTHER_DEDUCTION_RECEIVABLE",
            debit: a.amount,
            credit: 0,
            description: `Bill deduction ${index + 1}`,
          }))
          .filter((line) => D(line.debit).gt(0));

        await this.accounting.post(tx, {
          organizationId,
          userId,
          journalDate: updated.billDate,
          referenceNo: updated.billNo,
          description: `Running Bill ${updated.billNo} certified`,
          sourceModule: "PROJECT_BILL",
          sourceType: "CERTIFICATION",
          sourceId: id,
          lines: [
            {
              systemKey: "ACCOUNTS_RECEIVABLE",
              projectId: existing.cmsWorkId,
              partyName,
              partyType: "CUSTOMER",
              debit: totals.netCertifiedAmount,
              credit: 0,
            },
            ...(totals.retentionAmount.gt(0)
              ? [
                  {
                    systemKey: "RETENTION_RECEIVABLE",
                    projectId: existing.cmsWorkId,
                    partyName,
                    partyType: "CUSTOMER",
                    debit: totals.retentionAmount,
                    credit: 0,
                  },
                ]
              : []),
            ...(totals.vatAmount.gt(0)
              ? [
                  {
                    systemKey: "TAX_DEDUCTED_VAT",
                    projectId: existing.cmsWorkId,
                    partyName,
                    partyType: "CUSTOMER",
                    debit: totals.vatAmount,
                    credit: 0,
                  },
                ]
              : []),
            ...(totals.aitAmount.gt(0)
              ? [
                  {
                    systemKey: "TAX_DEDUCTED_AIT",
                    projectId: existing.cmsWorkId,
                    partyName,
                    partyType: "CUSTOMER",
                    debit: totals.aitAmount,
                    credit: 0,
                  },
                ]
              : []),
            ...deductionLines.map((line) => ({
              ...line,
              projectId: existing.cmsWorkId,
              partyName,
              partyType: "CUSTOMER",
            })),
            {
              systemKey: "PROJECT_REVENUE",
              projectId: existing.cmsWorkId,
              partyName,
              partyType: "CUSTOMER",
              debit: 0,
              credit: totals.grossBillAmount,
            },
          ],
        });

        return tx.projectBill.findFirst({ where: { id }, include: includeRelations });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 },
    );

    await this.auditLogService.record({
      organizationId,
      userId,
      action: "PROJECT_BILL_CERTIFIED",
      entityType: "ProjectBill",
      entityId: id,
      referenceNo: record!.billNo,
      newValue: toDto(record!),
    });

    return toDto(record!);
  }
}
