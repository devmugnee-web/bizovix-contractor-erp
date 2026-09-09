import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@bizovix/database";
import { buildPaginationMeta } from "@bizovix/utils";
import { AccountingService } from "../accounting/accounting.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { CashBankService } from "../cash-bank/cash-bank.service";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectLifecycleGuardService } from "../prisma/project-lifecycle-guard.service";
import { NumberingService } from "../settings-numbering/numbering.service";
import { QueryReceiptDto } from "./dto/query-receipt.dto";
import { SaveReceiptDto } from "./dto/save-receipt.dto";
import { UpdateReceiptDto } from "./dto/update-receipt.dto";

const includeRelations = {
  work: {
    select: {
      id: true,
      workName: true,
      organizationMaster: { select: { shortName: true } },
      tender: { select: { egpTenderId: true } },
      pgBgWorkflow: { select: { noaAmount: true } },
    },
  },
  receivedInAccount: { select: { id: true, accountName: true, accountNumber: true } },
} satisfies Prisma.ReceiptInclude;

type ReceiptRow = Prisma.ReceiptGetPayload<{ include: typeof includeRelations }>;
const D = (value: Prisma.Decimal | number | string) => new Prisma.Decimal(value);

function toDto(row: ReceiptRow) {
  return {
    ...row,
    receiptNo: row.receiptNo ?? row.referenceNo ?? row.id,
    amount: row.amount.toFixed(2),
    grossAmount: row.grossAmount.toFixed(2),
    vatDeductedAmount: row.vatDeductedAmount.toFixed(2),
    taxDeductedAmount: row.taxDeductedAmount.toFixed(2),
    securityDepositDeductedAmount: row.securityDepositDeductedAmount.toFixed(2),
    otherDeductionAmount: row.otherDeductionAmount.toFixed(2),
    chequeDate: row.chequeDate?.toISOString() ?? null,
    work: row.work
      ? {
          id: row.work.id,
          workName: row.work.workName,
          organizationMaster: row.work.organizationMaster,
          tenderNumber: row.work.tender?.egpTenderId ?? null,
          noaAmount: row.work.pgBgWorkflow?.noaAmount?.toFixed(2) ?? null,
        }
      : null,
  };
}

function receiptSettlement(dto: SaveReceiptDto) {
  const net = D(dto.amount);
  const vat = D(dto.vatDeductedAmount ?? 0);
  const tax = D(dto.taxDeductedAmount ?? 0);
  const securityDeposit = D(dto.securityDepositDeductedAmount ?? 0);
  const other = D(dto.otherDeductionAmount ?? 0);
  const deductions = vat.add(tax).add(securityDeposit).add(other);

  if ([net, vat, tax, securityDeposit, other].some((value) => value.lt(0))) {
    throw new BadRequestException("Receipt and deduction amounts cannot be negative");
  }
  if (!net.gt(0)) throw new BadRequestException("Net received amount must be greater than zero");
  if (dto.receiptCategory === "GENERAL" && !deductions.isZero()) {
    throw new BadRequestException("Deductions are only supported for project receipts");
  }

  const gross = dto.receiptCategory === "PROJECT"
    ? D(dto.grossAmount ?? net.add(deductions))
    : net;

  if (!gross.gt(0)) throw new BadRequestException("Gross amount must be greater than zero");
  if (dto.receiptCategory === "PROJECT" && !gross.equals(net.add(deductions))) {
    throw new BadRequestException("Gross amount must equal net received plus VAT, tax, SD and other deductions");
  }

  if (dto.paymentMethod === "CHEQUE") {
    if (!dto.chequeNo?.trim() || !dto.chequeDate || !dto.chequeBankName?.trim()) {
      throw new BadRequestException("Cheque number, cheque date and cheque bank are required");
    }
  }

  return { net, gross, vat, tax, securityDeposit, other, deductions };
}

function unallocatedDeductionLines(
  settlement: ReturnType<typeof receiptSettlement>,
  projectId: string,
  partyName: string,
) {
  const lines: Array<{
    systemKey: string;
    projectId: string;
    partyName: string;
    partyType: string;
    debit: Prisma.Decimal;
    credit: number;
    description: string;
  }> = [];
  if (settlement.vat.gt(0)) lines.push({ systemKey: "TAX_DEDUCTED_VAT", projectId, partyName, partyType: "CUSTOMER", debit: settlement.vat, credit: 0, description: "VAT deducted at source" });
  if (settlement.tax.gt(0)) lines.push({ systemKey: "TAX_DEDUCTED_AIT", projectId, partyName, partyType: "CUSTOMER", debit: settlement.tax, credit: 0, description: "Tax deducted at source" });
  if (settlement.securityDeposit.gt(0)) lines.push({ systemKey: "RETENTION_RECEIVABLE", projectId, partyName, partyType: "CUSTOMER", debit: settlement.securityDeposit, credit: 0, description: "Security deposit retained" });
  if (settlement.other.gt(0)) lines.push({ systemKey: "OTHER_DEDUCTION_RECEIVABLE", projectId, partyName, partyType: "CUSTOMER", debit: settlement.other, credit: 0, description: "Other receipt deduction" });
  return lines;
}

@Injectable()
export class ReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly cashBank: CashBankService,
    private readonly accounting: AccountingService,
    private readonly numbering: NumberingService,
    private readonly lifecycle: ProjectLifecycleGuardService,
  ) {}

  private where(organizationId: string, query: QueryReceiptDto): Prisma.ReceiptWhereInput {
    return {
      organizationId,
      ...(query.receiptType ? { receiptType: query.receiptType } : {}),
      ...(query.workId ? { workId: query.workId } : {}),
      ...(query.receivedInAccountId ? { receivedInAccountId: query.receivedInAccountId } : {}),
      ...(query.status ? { status: query.status } : { status: { not: "CANCELLED" } }),
      ...(query.dateFrom || query.dateTo
        ? { receiptDate: { ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}), ...(query.dateTo ? { lte: new Date(`${query.dateTo}T23:59:59.999Z`) } : {}) } }
        : {}),
      ...(query.search
        ? {
            OR: [
              { receiptNo: { contains: query.search, mode: "insensitive" } },
              { referenceNo: { contains: query.search, mode: "insensitive" } },
              { chequeNo: { contains: query.search, mode: "insensitive" } },
              { chequeBankName: { contains: query.search, mode: "insensitive" } },
              { receivedFrom: { contains: query.search, mode: "insensitive" } },
              { work: { workName: { contains: query.search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
  }

  async findAll(organizationId: string, query: QueryReceiptDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 5;
    const where = this.where(organizationId, query);
    const [items, total] = await Promise.all([
      this.prisma.receipt.findMany({ where, include: includeRelations, orderBy: [{ receiptDate: "desc" }, { receiptNo: "desc" }], skip: (page - 1) * limit, take: limit }),
      this.prisma.receipt.count({ where }),
    ]);
    return { items: items.map(toDto), meta: buildPaginationMeta(total, page, limit) };
  }

  async summary(organizationId: string) {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const valid = { organizationId, status: "RECEIVED" as const };
    const [total, month, project, general] = await Promise.all([
      this.prisma.receipt.aggregate({ where: valid, _sum: { amount: true, grossAmount: true, vatDeductedAmount: true, taxDeductedAmount: true, securityDepositDeductedAmount: true, otherDeductionAmount: true } }),
      this.prisma.receipt.aggregate({ where: { ...valid, receiptDate: { gte: monthStart } }, _sum: { amount: true } }),
      this.prisma.receipt.aggregate({ where: { ...valid, receiptCategory: "PROJECT" }, _sum: { amount: true } }),
      this.prisma.receipt.aggregate({ where: { ...valid, receiptCategory: "GENERAL" }, _sum: { amount: true } }),
    ]);
    return {
      totalReceived: (total._sum.amount ?? 0).toFixed(2),
      totalGross: (total._sum.grossAmount ?? 0).toFixed(2),
      totalVatDeducted: (total._sum.vatDeductedAmount ?? 0).toFixed(2),
      totalTaxDeducted: (total._sum.taxDeductedAmount ?? 0).toFixed(2),
      totalSecurityDepositDeducted: (total._sum.securityDepositDeductedAmount ?? 0).toFixed(2),
      totalOtherDeduction: (total._sum.otherDeductionAmount ?? 0).toFixed(2),
      thisMonth: (month._sum.amount ?? 0).toFixed(2),
      projectReceipt: (project._sum.amount ?? 0).toFixed(2),
      generalReceipt: (general._sum.amount ?? 0).toFixed(2),
      monthLabel: now.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
    };
  }

  async findOne(organizationId: string, id: string) {
    const row = await this.prisma.receipt.findFirst({ where: { id, organizationId }, include: includeRelations });
    if (!row) throw new NotFoundException("Receipt not found");
    return toDto(row);
  }

  private async refs(organizationId: string, dto: SaveReceiptDto) {
    const [work, account, receivable, receiptHead] = await Promise.all([
      dto.workId ? this.prisma.cmsWork.findFirst({ where: { id: dto.workId, organizationId } }) : null,
      this.prisma.bankAccount.findFirst({ where: { id: dto.receivedInAccountId, organizationId } }),
      dto.receivableId ? this.prisma.receivable.findFirst({ where: { id: dto.receivableId, organizationId } }) : null,
      dto.receiptHeadAccountId ? this.prisma.ledgerAccount.findFirst({ where: { id: dto.receiptHeadAccountId, organizationId, accountType: "INCOME", isActive: true } }) : null,
    ]);
    if (dto.receiptCategory === "PROJECT" && !work) throw new NotFoundException("Project not found");
    if (!account) throw new NotFoundException("Receiving account not found");
    if (dto.receiptHeadAccountId && !receiptHead) throw new NotFoundException("Active receipt head not found");
    if (dto.receivableId) {
      if (!receivable) throw new NotFoundException("Receivable not found");
      if (dto.receiptCategory !== "PROJECT" || !dto.workId || receivable.projectId !== dto.workId) {
        throw new BadRequestException("Receivable does not belong to the selected project");
      }
      const outstanding = receivable.amount.sub(receivable.receivedAmount);
      if (D(dto.amount).gt(outstanding)) {
        throw new BadRequestException(`Receipt amount exceeds the outstanding receivable of ${outstanding.toFixed(2)} for bill ${receivable.billNo}`);
      }
    }
    return { receivable, receiptHead };
  }

  async create(organizationId: string, userId: string, dto: SaveReceiptDto) {
    if (dto.workId) await this.lifecycle.assertOperationalMutationAllowed(organizationId, dto.workId, "allocating a project receipt");
    const settlement = receiptSettlement(dto);
    const { receiptHead } = await this.refs(organizationId, dto);
    const year = new Date(dto.receiptDate).getUTCFullYear();

    const row = await this.prisma.$transaction(async (tx) => {
      const receivable = dto.receivableId
        ? await tx.receivable.findFirst({ where: { id: dto.receivableId, organizationId, ...(dto.workId ? { projectId: dto.workId } : {}) } })
        : null;
      if (dto.receivableId && !receivable) throw new NotFoundException("Receivable not found for the selected project");
      if (receivable && receivable.receivedAmount.add(settlement.net).gt(receivable.amount)) {
        throw new BadRequestException(`Receipt amount exceeds the outstanding receivable of ${receivable.amount.sub(receivable.receivedAmount).toFixed(2)} for bill ${receivable.billNo}`);
      }

      const sequence = await tx.receiptSequence.upsert({
        where: { organizationId_year: { organizationId, year } },
        update: { value: { increment: 1 } },
        create: { organizationId, year, value: 1 },
      });
      const config = await this.numbering.getConfig(organizationId, "RECEIPT");
      const receiptNo = this.numbering.format(config, year, sequence.value);
      const receipt = await tx.receipt.create({
        data: {
          organizationId,
          receiptNo,
          receiptDate: new Date(dto.receiptDate),
          receiptCategory: dto.receiptCategory,
          receiptType: dto.receiptType,
          workId: dto.receiptCategory === "PROJECT" ? dto.workId : null,
          receivableId: dto.receivableId,
          receivedFrom: dto.receivedFrom.trim(),
          amount: settlement.net,
          grossAmount: settlement.gross,
          vatDeductedAmount: settlement.vat,
          taxDeductedAmount: settlement.tax,
          securityDepositDeductedAmount: settlement.securityDeposit,
          otherDeductionAmount: settlement.other,
          receivedInAccountId: dto.receivedInAccountId,
          paymentMethod: dto.paymentMethod,
          chequeNo: dto.paymentMethod === "CHEQUE" ? dto.chequeNo?.trim() : null,
          chequeDate: dto.paymentMethod === "CHEQUE" && dto.chequeDate ? new Date(dto.chequeDate) : null,
          chequeBankName: dto.paymentMethod === "CHEQUE" ? dto.chequeBankName?.trim() : null,
          referenceNo: dto.referenceNo?.trim() || null,
          description: dto.description?.trim() || null,
          status: dto.status ?? "RECEIVED",
          createdById: userId,
        },
        include: includeRelations,
      });

      if (receipt.status === "RECEIVED") {
        const partyName = dto.receivedFrom.trim();
        const description = dto.description?.trim() || `Receipt from ${partyName}`;
        await this.cashBank.post(tx, {
          organizationId,
          accountId: dto.receivedInAccountId,
          direction: "IN",
          amount: settlement.net,
          sourceModule: "RECEIPT",
          sourceType: dto.receiptType,
          sourceId: receipt.id,
          referenceNo: receipt.receiptNo,
          description,
          transactionDate: receipt.receiptDate,
          createdById: userId,
        });

        const deductionLines = receipt.workId && !receivable
          ? unallocatedDeductionLines(settlement, receipt.workId, partyName)
          : [];
        await this.accounting.post(tx, {
          organizationId,
          userId,
          journalDate: receipt.receiptDate,
          referenceNo: receipt.receiptNo,
          description,
          sourceModule: "RECEIPT",
          sourceType: dto.receiptType,
          sourceId: receipt.id,
          lines: [
            { bankAccountId: dto.receivedInAccountId, projectId: receipt.workId, partyName, partyType: receipt.workId ? "CUSTOMER" : "OTHER", debit: settlement.net, credit: 0 },
            ...deductionLines,
            receiptHead && dto.receiptCategory === "GENERAL"
              ? { accountId: receiptHead.id, projectId: null, partyName, partyType: "OTHER", debit: 0, credit: settlement.net }
              : { systemKey: receivable ? "ACCOUNTS_RECEIVABLE" : "OTHER_INCOME", projectId: receipt.workId, partyName, partyType: receivable ? "CUSTOMER" : "OTHER", debit: 0, credit: receivable ? settlement.net : settlement.gross },
          ],
        });

        if (receivable) {
          const receivedAmount = receivable.receivedAmount.add(settlement.net);
          const status = receivedAmount.gte(receivable.amount) ? "RECEIVED" : "PARTIALLY_RECEIVED";
          const changed = await tx.receivable.updateMany({
            where: { id: receivable.id, organizationId, receivedAmount: receivable.receivedAmount },
            data: { receivedAmount, status },
          });
          if (changed.count !== 1) throw new BadRequestException("Receivable changed concurrently; retry the receipt");
          if (receivable.projectBillId) {
            await tx.projectBill.update({ where: { id: receivable.projectBillId }, data: { receivedAmount, status } });
          }
        }
      }
      return receipt;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await this.audit.record({ organizationId, userId, action: "create", entityType: "Receipt", entityId: row.id, newValue: toDto(row) });
    if (dto.receivableId) {
      await this.audit.record({ organizationId, userId, action: "RECEIPT_ALLOCATED_TO_BILL", entityType: "Receivable", entityId: dto.receivableId, referenceNo: row.receiptNo, description: `Receipt ${row.receiptNo} allocated` });
    }
    return toDto(row);
  }

  async update(organizationId: string, userId: string, id: string, dto: UpdateReceiptDto) {
    const existing = await this.findOne(organizationId, id);
    if (existing.status === "CANCELLED") throw new BadRequestException("Cancelled receipt cannot be edited");

    const financialChange = [
      dto.receiptDate,
      dto.receiptCategory,
      dto.receiptType,
      dto.workId,
      dto.receivableId,
      dto.receivedFrom,
      dto.amount,
      dto.grossAmount,
      dto.vatDeductedAmount,
      dto.taxDeductedAmount,
      dto.securityDepositDeductedAmount,
      dto.otherDeductionAmount,
      dto.receivedInAccountId,
      dto.paymentMethod,
      dto.chequeNo,
      dto.chequeDate,
      dto.chequeBankName,
      dto.status,
    ].some((value) => value !== undefined);

    if (existing.status === "RECEIVED" && financialChange) {
      const merged: SaveReceiptDto = {
        receiptDate: dto.receiptDate ?? new Date(existing.receiptDate).toISOString().slice(0, 10),
        receiptCategory: dto.receiptCategory ?? existing.receiptCategory as "PROJECT" | "GENERAL",
        receiptType: dto.receiptType ?? existing.receiptType,
        workId: dto.workId ?? existing.workId ?? undefined,
        receivableId: dto.receivableId ?? existing.receivableId ?? undefined,
        receiptHeadAccountId: dto.receiptHeadAccountId,
        receivedFrom: dto.receivedFrom ?? existing.receivedFrom,
        amount: dto.amount ?? Number(existing.amount),
        grossAmount: dto.grossAmount ?? Number(existing.grossAmount),
        vatDeductedAmount: dto.vatDeductedAmount ?? Number(existing.vatDeductedAmount),
        taxDeductedAmount: dto.taxDeductedAmount ?? Number(existing.taxDeductedAmount),
        securityDepositDeductedAmount: dto.securityDepositDeductedAmount ?? Number(existing.securityDepositDeductedAmount),
        otherDeductionAmount: dto.otherDeductionAmount ?? Number(existing.otherDeductionAmount),
        receivedInAccountId: dto.receivedInAccountId ?? existing.receivedInAccountId ?? "",
        paymentMethod: dto.paymentMethod ?? existing.paymentMethod,
        chequeNo: dto.chequeNo ?? existing.chequeNo ?? undefined,
        chequeDate: dto.chequeDate ?? existing.chequeDate ?? undefined,
        chequeBankName: dto.chequeBankName ?? existing.chequeBankName ?? undefined,
        referenceNo: dto.referenceNo ?? existing.referenceNo ?? undefined,
        description: dto.description ?? existing.description ?? undefined,
        status: dto.status ?? "RECEIVED",
      };
      const settlement = receiptSettlement(merged);
      const { receiptHead } = await this.refs(organizationId, { ...merged, receivableId: undefined });

      const replacement = await this.prisma.$transaction(async (tx) => {
        await this.accounting.reverseSource(tx, organizationId, userId, "RECEIPT", id);
        await this.cashBank.reverseSource(tx, { organizationId, sourceModule: "RECEIPT", sourceId: id, userId, reason: "Receipt amendment" });

        if (existing.receivableId) {
          const oldReceivable = await tx.receivable.findFirst({ where: { id: existing.receivableId, organizationId } });
          if (!oldReceivable) throw new NotFoundException("Allocated receivable not found");
          const rolledBack = Prisma.Decimal.max(D(0), oldReceivable.receivedAmount.sub(existing.amount));
          const oldStatus = rolledBack.isZero() ? "OUTSTANDING" : rolledBack.gte(oldReceivable.amount) ? "RECEIVED" : "PARTIALLY_RECEIVED";
          await tx.receivable.update({ where: { id: oldReceivable.id, organizationId }, data: { receivedAmount: rolledBack, status: oldStatus } });
          if (oldReceivable.projectBillId) {
            await tx.projectBill.update({ where: { id: oldReceivable.projectBillId, organizationId }, data: { receivedAmount: rolledBack, status: rolledBack.isZero() ? "CERTIFIED" : rolledBack.gte(oldReceivable.amount) ? "RECEIVED" : "PARTIALLY_RECEIVED" } });
          }
        }

        const target = merged.receivableId
          ? await tx.receivable.findFirst({ where: { id: merged.receivableId, organizationId, ...(merged.workId ? { projectId: merged.workId } : {}) } })
          : null;
        if (merged.receivableId && !target) throw new NotFoundException("Replacement receivable not found for the selected project");
        if (target && target.receivedAmount.add(settlement.net).gt(target.amount)) {
          throw new BadRequestException("Replacement receipt exceeds the receivable outstanding amount");
        }

        const year = new Date(merged.receiptDate).getUTCFullYear();
        const sequence = await tx.receiptSequence.upsert({
          where: { organizationId_year: { organizationId, year } },
          update: { value: { increment: 1 } },
          create: { organizationId, year, value: 1 },
        });
        const config = await this.numbering.getConfig(organizationId, "RECEIPT");
        const receiptNo = this.numbering.format(config, year, sequence.value);
        const created = await tx.receipt.create({
          data: {
            organizationId,
            receiptNo,
            receiptDate: new Date(merged.receiptDate),
            receiptCategory: merged.receiptCategory,
            receiptType: merged.receiptType,
            workId: merged.receiptCategory === "PROJECT" ? merged.workId : null,
            receivableId: merged.receivableId,
            receivedFrom: merged.receivedFrom.trim(),
            amount: settlement.net,
            grossAmount: settlement.gross,
            vatDeductedAmount: settlement.vat,
            taxDeductedAmount: settlement.tax,
            securityDepositDeductedAmount: settlement.securityDeposit,
            otherDeductionAmount: settlement.other,
            receivedInAccountId: merged.receivedInAccountId,
            paymentMethod: merged.paymentMethod,
            chequeNo: merged.paymentMethod === "CHEQUE" ? merged.chequeNo?.trim() : null,
            chequeDate: merged.paymentMethod === "CHEQUE" && merged.chequeDate ? new Date(merged.chequeDate) : null,
            chequeBankName: merged.paymentMethod === "CHEQUE" ? merged.chequeBankName?.trim() : null,
            referenceNo: merged.referenceNo?.trim() || null,
            description: merged.description?.trim() || null,
            status: merged.status ?? "RECEIVED",
            createdById: userId,
            replacesReceiptId: id,
          },
          include: includeRelations,
        });

        if (created.status === "RECEIVED") {
          const partyName = merged.receivedFrom.trim();
          const description = merged.description?.trim() || `Receipt from ${partyName}`;
          await this.cashBank.post(tx, { organizationId, accountId: merged.receivedInAccountId, direction: "IN", amount: settlement.net, sourceModule: "RECEIPT", sourceType: merged.receiptType, sourceId: created.id, referenceNo: receiptNo, description, transactionDate: created.receiptDate, createdById: userId });
          const deductionLines = created.workId && !target
            ? unallocatedDeductionLines(settlement, created.workId, partyName)
            : [];
          await this.accounting.post(tx, {
            organizationId,
            userId,
            journalDate: created.receiptDate,
            referenceNo: receiptNo,
            description,
            sourceModule: "RECEIPT",
            sourceType: merged.receiptType,
            sourceId: created.id,
            lines: [
              { bankAccountId: merged.receivedInAccountId, projectId: created.workId, partyName, partyType: created.workId ? "CUSTOMER" : "OTHER", debit: settlement.net, credit: 0 },
              ...deductionLines,
              receiptHead && merged.receiptCategory === "GENERAL"
                ? { accountId: receiptHead.id, projectId: null, partyName, partyType: "OTHER", debit: 0, credit: settlement.net }
                : { systemKey: target ? "ACCOUNTS_RECEIVABLE" : "OTHER_INCOME", projectId: created.workId, partyName, partyType: target ? "CUSTOMER" : "OTHER", debit: 0, credit: target ? settlement.net : settlement.gross },
            ],
          });

          if (target) {
            const receivedAmount = target.receivedAmount.add(settlement.net);
            const status = receivedAmount.gte(target.amount) ? "RECEIVED" : "PARTIALLY_RECEIVED";
            await tx.receivable.update({ where: { id: target.id, organizationId }, data: { receivedAmount, status } });
            if (target.projectBillId) await tx.projectBill.update({ where: { id: target.projectBillId, organizationId }, data: { receivedAmount, status } });
          }
        }

        await tx.receipt.update({ where: { id, organizationId }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: userId, cancellationReason: `Replaced by ${receiptNo}` } });
        return created;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

      await this.audit.record({ organizationId, userId, action: "RECEIPT_AMENDED", entityType: "Receipt", entityId: id, oldValue: existing, newValue: toDto(replacement) });
      return toDto(replacement);
    }

    const row = await this.prisma.receipt.update({ where: { id, organizationId }, data: { referenceNo: dto.referenceNo, description: dto.description }, include: includeRelations });
    await this.audit.record({ organizationId, userId, action: "RECEIPT_METADATA_UPDATED", entityType: "Receipt", entityId: id, oldValue: existing, newValue: toDto(row) });
    return toDto(row);
  }

  async cancel(organizationId: string, userId: string, id: string) {
    const existing = await this.findOne(organizationId, id);
    if (existing.status === "CANCELLED") return existing;
    const row = await this.prisma.$transaction(async (tx) => {
      if (existing.status === "RECEIVED") {
        await this.accounting.reverseSource(tx, organizationId, userId, "RECEIPT", id);
        await this.cashBank.reverseSource(tx, { organizationId, sourceModule: "RECEIPT", sourceId: id, userId, reason: "Receipt cancellation" });
        if (existing.receivableId) {
          const receivable = await tx.receivable.findFirst({ where: { id: existing.receivableId, organizationId } });
          if (!receivable) throw new NotFoundException("Allocated receivable not found");
          const receivedAmount = Prisma.Decimal.max(D(0), receivable.receivedAmount.sub(existing.amount));
          const status = receivedAmount.isZero() ? "OUTSTANDING" : receivedAmount.gte(receivable.amount) ? "RECEIVED" : "PARTIALLY_RECEIVED";
          await tx.receivable.update({ where: { id: receivable.id, organizationId }, data: { receivedAmount, status } });
          if (receivable.projectBillId) {
            await tx.projectBill.update({ where: { id: receivable.projectBillId, organizationId }, data: { receivedAmount, status: receivedAmount.isZero() ? "CERTIFIED" : receivedAmount.gte(receivable.amount) ? "RECEIVED" : "PARTIALLY_RECEIVED" } });
          }
        }
      }
      return tx.receipt.update({ where: { id, organizationId }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: userId, cancellationReason: "Cancelled by user" }, include: includeRelations });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await this.audit.record({ organizationId, userId, action: "RECEIPT_CANCELLED", entityType: "Receipt", entityId: id, oldValue: existing, newValue: toDto(row) });
    return toDto(row);
  }

  async getEligibleBills(organizationId: string, workId: string) {
    const bills = await this.prisma.receivable.findMany({
      where: {
        organizationId,
        projectId: workId,
        projectBill: { status: { in: ["CERTIFIED", "PARTIALLY_RECEIVED"] } },
      },
      include: {
        projectBill: {
          select: {
            status: true,
            grossBillAmount: true,
            vatAmount: true,
            aitAmount: true,
            retentionAmount: true,
            otherDeductionAmount: true,
          },
        },
      },
      orderBy: { billDate: "desc" },
    });

    return bills
      .filter((bill) => bill.projectBill && bill.amount.gt(bill.receivedAmount))
      .map((bill) => ({
        id: bill.id,
        billNo: bill.billNo,
        grossBillAmount: bill.projectBill!.grossBillAmount.toFixed(2),
        vatAmount: bill.projectBill!.vatAmount.toFixed(2),
        taxAmount: bill.projectBill!.aitAmount.toFixed(2),
        securityDepositAmount: bill.projectBill!.retentionAmount.toFixed(2),
        otherDeductionAmount: bill.projectBill!.otherDeductionAmount.toFixed(2),
        netCertified: bill.amount.toFixed(2),
        alreadyReceived: bill.receivedAmount.toFixed(2),
        outstanding: bill.amount.sub(bill.receivedAmount).toFixed(2),
      }));
  }
}
