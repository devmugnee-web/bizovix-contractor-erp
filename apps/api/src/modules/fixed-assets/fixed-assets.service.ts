import { randomUUID } from "crypto";
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@bizovix/database";
import { buildPaginationMeta } from "@bizovix/utils";
import { AccountingService } from "../accounting/accounting.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { CashBankService } from "../cash-bank/cash-bank.service";
import { PrismaService } from "../prisma/prisma.service";
import { NumberingService } from "../settings-numbering/numbering.service";
import { calculateCapitalizedCost, calculateDepreciationAmount } from "./fixed-assets.calculations";
import {
  BulkPostDepreciationDto,
  CreateAssetCategoryDto,
  CreateFixedAssetDto,
  PostDepreciationDto,
  QueryFixedAssetsDto,
  UpdateAssetCategoryDto,
  UpdateFixedAssetDto,
} from "./dto/fixed-assets.dto";

type Tx = Prisma.TransactionClient;
const D = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);

const assetInclude = {
  assetCategory: true,
  supplier: { select: { id: true, code: true, name: true } },
  assetLedger: { select: { id: true, code: true, name: true, isSystem: true, isActive: true } },
  depreciationEntries: { orderBy: { periodEnd: "desc" as const } },
};

@Injectable()
export class FixedAssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
    private readonly cashBank: CashBankService,
    private readonly audit: AuditLogService,
    private readonly numbering: NumberingService,
  ) {}

  private async category(org: string, id: string, tx: Tx | PrismaService = this.prisma) {
    const row = await tx.assetCategory.findFirst({ where: { id, organizationId: org } });
    if (!row) throw new NotFoundException("Asset category not found");
    return row;
  }

  private code(prefix: string, categoryCode: string) {
    const clean = categoryCode.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) || "GEN";
    return `${prefix}-${clean}-${randomUUID().slice(0, 6).toUpperCase()}`;
  }

  private async ensureCategoryLedgers(tx: Tx, org: string, categoryId: string) {
    const category = await this.category(org, categoryId, tx);
    await this.accounting.ensureChart(org, tx);
    const assetsRoot = await this.accounting.systemAccount(tx, org, "ASSET_FIXED");
    const expenseRoot = await this.accounting.systemAccount(tx, org, "ADMINISTRATIVE_EXPENSES");
    const create = (data: Prisma.LedgerAccountUncheckedCreateInput) => tx.ledgerAccount.create({ data });
    const assetLedger = category.assetLedgerId
      ? await tx.ledgerAccount.findFirst({ where: { id: category.assetLedgerId, organizationId: org, isActive: true } })
      : null;
    const accumulatedLedger = category.accumulatedDepreciationLedgerId
      ? await tx.ledgerAccount.findFirst({ where: { id: category.accumulatedDepreciationLedgerId, organizationId: org, isActive: true } })
      : null;
    const expenseLedger = category.depreciationExpenseLedgerId
      ? await tx.ledgerAccount.findFirst({ where: { id: category.depreciationExpenseLedgerId, organizationId: org, isActive: true } })
      : null;
    const nextAsset = assetLedger ?? await create({ organizationId: org, code: this.code("FA", category.code), name: `${category.name} - Fixed Assets`, parentId: assetsRoot.id, accountType: "ASSET", normalBalance: "DEBIT", isSystem: false });
    const nextAccumulated = accumulatedLedger ?? await create({ organizationId: org, code: this.code("AD", category.code), name: `${category.name} - Accumulated Depreciation`, parentId: assetsRoot.id, accountType: "ASSET", normalBalance: "CREDIT", isSystem: false });
    const nextExpense = expenseLedger ?? await create({ organizationId: org, code: this.code("DE", category.code), name: `${category.name} - Depreciation Expense`, parentId: expenseRoot.id, accountType: "EXPENSE", normalBalance: "DEBIT", isSystem: false });
    if (!category.assetLedgerId || !category.accumulatedDepreciationLedgerId || !category.depreciationExpenseLedgerId) {
      await tx.assetCategory.update({
        where: { id: category.id },
        data: { assetLedgerId: nextAsset.id, accumulatedDepreciationLedgerId: nextAccumulated.id, depreciationExpenseLedgerId: nextExpense.id },
      });
    }
    return { category, assetLedger: nextAsset, accumulatedLedger: nextAccumulated, expenseLedger: nextExpense };
  }

  private present<T extends { capitalizedCost: Prisma.Decimal; salvageValue: Prisma.Decimal; depreciationEntries: Array<{ amount: Prisma.Decimal }> }>(row: T) {
    const accumulated = row.depreciationEntries.reduce((sum, entry) => sum.add(entry.amount), D(0));
    const netBookValue = Prisma.Decimal.max(D(0), row.capitalizedCost.sub(accumulated));
    return { ...row, accumulatedDepreciation: accumulated.toFixed(4), netBookValue: netBookValue.toFixed(4) };
  }

  async list(org: string, query: QueryFixedAssetsDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const where: Prisma.FixedAssetWhereInput = {
      organizationId: org,
      categoryId: query.categoryId,
      status: query.status,
      ...(query.search ? { OR: [
        { assetCode: { contains: query.search, mode: "insensitive" } },
        { name: { contains: query.search, mode: "insensitive" } },
        { serialNumber: { contains: query.search, mode: "insensitive" } },
        { location: { contains: query.search, mode: "insensitive" } },
      ] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.fixedAsset.findMany({ where, include: assetInclude, orderBy: [{ status: "asc" }, { createdAt: "desc" }], skip: (page - 1) * limit, take: limit }),
      this.prisma.fixedAsset.count({ where }),
    ]);
    return { items: rows.map((row) => this.present(row)), meta: buildPaginationMeta(total, page, limit) };
  }

  async findOne(org: string, id: string) {
    const row = await this.prisma.fixedAsset.findFirst({ where: { id, organizationId: org }, include: assetInclude });
    if (!row) throw new NotFoundException("Fixed asset not found");
    return this.present(row);
  }

  async dashboard(org: string) {
    const rows = await this.prisma.fixedAsset.findMany({ where: { organizationId: org }, select: { status: true, capitalizedCost: true, salvageValue: true, depreciationEntries: { select: { amount: true } } } });
    let cost = D(0), depreciation = D(0);
    for (const row of rows) {
      cost = cost.add(row.capitalizedCost);
      depreciation = depreciation.add(row.depreciationEntries.reduce((sum, entry) => sum.add(entry.amount), D(0)));
    }
    return {
      totalAssets: rows.length,
      activeAssets: rows.filter((row) => row.status === "ACTIVE").length,
      fullyDepreciatedAssets: rows.filter((row) => row.status === "FULLY_DEPRECIATED").length,
      capitalizedCost: cost.toFixed(4),
      accumulatedDepreciation: depreciation.toFixed(4),
      netBookValue: Prisma.Decimal.max(D(0), cost.sub(depreciation)).toFixed(4),
    };
  }

  listCategories(org: string) {
    return this.prisma.assetCategory.findMany({ where: { organizationId: org }, include: { parent: { select: { id: true, name: true } }, _count: { select: { assets: true } } }, orderBy: [{ isActive: "desc" }, { name: "asc" }] });
  }

  async createCategory(org: string, userId: string, dto: CreateAssetCategoryDto) {
    const code = dto.code.trim().toUpperCase();
    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.parentId) await this.category(org, dto.parentId, tx);
      const category = await tx.assetCategory.create({ data: { organizationId: org, name: dto.name.trim(), code, parentId: dto.parentId, defaultUsefulLifeMonths: dto.defaultUsefulLifeMonths, defaultSalvageValue: dto.defaultSalvageValue, defaultDepreciationMethod: dto.defaultDepreciationMethod } });
      await this.ensureCategoryLedgers(tx, org, category.id);
      return tx.assetCategory.findUniqueOrThrow({ where: { id: category.id } });
    });
    await this.audit.record({ organizationId: org, userId, action: "ASSET_CATEGORY_CREATED", entityType: "AssetCategory", entityId: row.id, newValue: row });
    return row;
  }

  async updateCategory(org: string, userId: string, id: string, dto: UpdateAssetCategoryDto) {
    const old = await this.category(org, id);
    if (dto.parentId === id) throw new BadRequestException("A category cannot be its own parent");
    if (dto.parentId) await this.category(org, dto.parentId);
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.assetCategory.update({ where: { id }, data: { ...dto, name: dto.name?.trim() } });
      if (dto.name && dto.name.trim() !== old.name) {
        const ids = [old.assetLedgerId, old.accumulatedDepreciationLedgerId, old.depreciationExpenseLedgerId].filter((value): value is string => Boolean(value));
        const ledgers = await tx.ledgerAccount.findMany({ where: { id: { in: ids }, organizationId: org, isSystem: false } });
        for (const ledger of ledgers) {
          const suffix = ledger.id === old.assetLedgerId ? "Fixed Assets" : ledger.id === old.accumulatedDepreciationLedgerId ? "Accumulated Depreciation" : "Depreciation Expense";
          await tx.ledgerAccount.update({ where: { id: ledger.id }, data: { name: `${dto.name.trim()} - ${suffix}` } });
        }
      }
      return updated;
    });
    await this.audit.record({ organizationId: org, userId, action: "ASSET_CATEGORY_UPDATED", entityType: "AssetCategory", entityId: id, oldValue: old, newValue: row });
    return row;
  }

  async deleteCategory(org: string, userId: string, id: string) {
    const old = await this.category(org, id);
    const [assets, children] = await Promise.all([this.prisma.fixedAsset.count({ where: { organizationId: org, categoryId: id } }), this.prisma.assetCategory.count({ where: { organizationId: org, parentId: id } })]);
    if (assets || children) throw new ConflictException("Category is in use and cannot be deleted");
    await this.prisma.$transaction(async (tx) => {
      await tx.assetCategory.delete({ where: { id } });
      const ids = [old.assetLedgerId, old.accumulatedDepreciationLedgerId, old.depreciationExpenseLedgerId].filter((value): value is string => Boolean(value));
      await tx.ledgerAccount.updateMany({ where: { id: { in: ids }, organizationId: org, isSystem: false }, data: { isActive: false } });
    });
    await this.audit.record({ organizationId: org, userId, action: "ASSET_CATEGORY_DELETED", entityType: "AssetCategory", entityId: id, oldValue: old });
    return { id, success: true };
  }

  async create(org: string, userId: string, dto: CreateFixedAssetDto) {
    const capitalized = calculateCapitalizedCost(dto);
    if (capitalized.lte(0)) throw new BadRequestException("Capitalized cost must be positive");
    const salvage = D(dto.salvageValue ?? 0);
    if (salvage.gte(capitalized)) throw new BadRequestException("Salvage value must be lower than capitalized cost");
    if (dto.fundingMode === "CASH_BANK" && !dto.fundingBankAccountId) throw new BadRequestException("Cash/bank account is required");
    if (dto.fundingMode === "CREDIT" && !dto.supplierId) throw new BadRequestException("Supplier is required for a credit acquisition");

    const row = await this.prisma.$transaction(async (tx) => {
      const ledgers = await this.ensureCategoryLedgers(tx, org, dto.categoryId);
      const assetCode = dto.assetCode?.trim().toUpperCase() || await this.numbering.next(org, "ASSET", tx);
      let supplier: { id: string; name: string } | null = null;
      if (dto.supplierId) {
        supplier = await tx.party.findFirst({ where: { id: dto.supplierId, organizationId: org, status: "ACTIVE", roles: { hasSome: ["SUPPLIER", "VENDOR"] } }, select: { id: true, name: true } });
        if (!supplier) throw new NotFoundException("Supplier not found");
      }
      if (dto.fundingBankAccountId && !(await tx.bankAccount.findFirst({ where: { id: dto.fundingBankAccountId, organizationId: org } }))) throw new NotFoundException("Funding account not found");
      const fixedAssetsCategory = await this.accounting.systemAccount(tx, org, "ASSET_FIXED");
      const assetLedger = await tx.ledgerAccount.create({ data: { organizationId: org, code: this.code("AS", ledgers.category.code), name: dto.name.trim(), parentId: fixedAssetsCategory.id, accountType: "ASSET", normalBalance: "DEBIT", isSystem: false } });
      let payableId: string | undefined;
      if (dto.fundingMode === "CREDIT") {
        const payable = await tx.payable.create({ data: { organizationId: org, partyId: supplier!.id, partyName: supplier!.name, partyType: "SUPPLIER", billNo: `ASSET-${assetCode}`, billDate: new Date(dto.purchaseDate), amount: capitalized, description: `Fixed asset acquisition: ${dto.name.trim()}`, createdById: userId } });
        payableId = payable.id;
      }
      const asset = await tx.fixedAsset.create({ data: {
        organizationId: org, assetLedgerId: assetLedger.id, assetCode, categoryId: ledgers.category.id, supplierId: supplier?.id,
        fundingMode: dto.fundingMode, fundingBankAccountId: dto.fundingBankAccountId, payableId, name: dto.name.trim(), category: ledgers.category.name,
        location: dto.location?.trim(), department: dto.department?.trim(), assignedToName: dto.assignedToName?.trim(), brand: dto.brand?.trim(), model: dto.model?.trim(), manufacturer: dto.manufacturer?.trim(), serialNumber: dto.serialNumber?.trim(), registrationNumber: dto.registrationNumber?.trim(), condition: dto.condition, operationalStatus: dto.operationalStatus, acquisitionType: dto.acquisitionType, notes: dto.notes?.trim(),
        purchaseDate: new Date(dto.purchaseDate), purchaseCost: dto.purchaseCost, transportationCost: dto.transportationCost, installationCost: dto.installationCost, importDuty: dto.importDuty, registrationCost: dto.registrationCost, otherCapitalizedCost: dto.otherCapitalizedCost, discountAmount: dto.discountAmount, capitalizedCost: capitalized, salvageValue: salvage, usefulLifeMonths: dto.usefulLifeMonths, depreciationMethod: dto.depreciationMethod, useManualDepreciation: dto.useManualDepreciation, manualDepreciationAmount: dto.manualDepreciationAmount, createdById: userId,
      } });
      if (dto.fundingMode === "CASH_BANK") {
        await this.cashBank.post(tx, { organizationId: org, accountId: dto.fundingBankAccountId!, direction: "OUT", amount: capitalized, sourceModule: "FIXED_ASSET", sourceType: "ACQUISITION", sourceId: asset.id, referenceNo: assetCode, description: `Fixed asset acquisition: ${asset.name}`, transactionDate: asset.purchaseDate, createdById: userId });
      }
      const creditLine = dto.fundingMode === "CASH_BANK"
        ? { bankAccountId: dto.fundingBankAccountId!, debit: 0, credit: capitalized }
        : dto.fundingMode === "CREDIT"
          ? { systemKey: "ACCOUNTS_PAYABLE", debit: 0, credit: capitalized, partyName: supplier!.name, partyType: "SUPPLIER" }
          : { systemKey: "OPENING_BALANCE_EQUITY", debit: 0, credit: capitalized };
      const journal = await this.accounting.post(tx, { organizationId: org, userId, journalDate: asset.purchaseDate, referenceNo: assetCode, description: `Fixed asset acquisition: ${asset.name}`, sourceModule: "FIXED_ASSET", sourceType: "ACQUISITION", sourceId: asset.id, lines: [{ accountId: assetLedger.id, debit: capitalized, credit: 0 }, creditLine] });
      await tx.fixedAsset.update({ where: { id: asset.id }, data: { acquisitionJournalId: journal.id } });
      return tx.fixedAsset.findUniqueOrThrow({ where: { id: asset.id }, include: assetInclude });
    });
    await this.audit.record({ organizationId: org, userId, action: "FIXED_ASSET_ACQUIRED", entityType: "FixedAsset", entityId: row.id, referenceNo: row.assetCode, newValue: { assetCode: row.assetCode, capitalizedCost: row.capitalizedCost.toFixed(4), fundingMode: row.fundingMode } });
    return this.present(row);
  }

  async previewDepreciation(org: string, id: string) {
    const asset = await this.findOne(org, id);
    const amounts = calculateDepreciationAmount({ capitalizedCost: asset.capitalizedCost, salvageValue: asset.salvageValue, usefulLifeMonths: asset.usefulLifeMonths, priorDepreciation: asset.accumulatedDepreciation, manualAnnualDepreciation: asset.useManualDepreciation ? asset.manualDepreciationAmount : null });
    return { assetId: id, standardMonthlyAmount: amounts.standardMonthly.toFixed(4), remainingDepreciableAmount: amounts.remaining.toFixed(4), nextAmount: amounts.nextAmount.toFixed(4) };
  }

  async postDepreciation(org: string, userId: string, id: string, dto: PostDepreciationDto) {
    const start = new Date(dto.periodStart), end = new Date(dto.periodEnd);
    if (end < start) throw new BadRequestException("Period end must be on or after period start");
    const alreadyPosted = await this.prisma.fixedAssetDepreciationEntry.findUnique({ where: { fixedAssetId_periodEnd: { fixedAssetId: id, periodEnd: end } }, select: { organizationId: true } });
    if (alreadyPosted?.organizationId === org) return this.findOne(org, id);
    const row = await this.prisma.$transaction(async (tx) => {
      const asset = await tx.fixedAsset.findFirst({ where: { id, organizationId: org }, include: assetInclude });
      if (!asset) throw new NotFoundException("Fixed asset not found");
      if (asset.status !== "ACTIVE") throw new BadRequestException("Only active assets can be depreciated");
      if (start < asset.purchaseDate) throw new BadRequestException("Depreciation cannot predate acquisition");
      const prior = asset.depreciationEntries.reduce((sum, entry) => sum.add(entry.amount), D(0));
      const amounts = calculateDepreciationAmount({ capitalizedCost: asset.capitalizedCost, salvageValue: asset.salvageValue, usefulLifeMonths: asset.usefulLifeMonths, priorDepreciation: prior, manualAnnualDepreciation: asset.useManualDepreciation ? asset.manualDepreciationAmount : null });
      const remaining = amounts.remaining;
      if (remaining.lte(0)) throw new BadRequestException("Asset is already fully depreciated");
      const amount = amounts.nextAmount;
      const category = await this.ensureCategoryLedgers(tx, org, asset.categoryId!);
      const sourceId = `${asset.id}:${dto.periodEnd}`;
      const journal = await this.accounting.post(tx, { organizationId: org, userId, journalDate: end, referenceNo: `${asset.assetCode}-${dto.periodEnd}`, description: `Depreciation: ${asset.name}`, sourceModule: "FIXED_ASSET_DEPRECIATION", sourceType: "DEPRECIATION", sourceId, lines: [{ accountId: category.expenseLedger.id, debit: amount, credit: 0 }, { accountId: category.accumulatedLedger.id, debit: 0, credit: amount }] });
      await tx.fixedAssetDepreciationEntry.create({ data: { organizationId: org, fixedAssetId: asset.id, periodStart: start, periodEnd: end, amount, journalEntryId: journal.id, postedById: userId } });
      if (remaining.sub(amount).lte(0)) await tx.fixedAsset.update({ where: { id: asset.id }, data: { status: "FULLY_DEPRECIATED" } });
      return tx.fixedAsset.findUniqueOrThrow({ where: { id: asset.id }, include: assetInclude });
    });
    await this.audit.record({ organizationId: org, userId, action: "FIXED_ASSET_DEPRECIATION_POSTED", entityType: "FixedAsset", entityId: id, referenceNo: row.assetCode, newValue: { periodStart: dto.periodStart, periodEnd: dto.periodEnd } });
    return this.present(row);
  }

  async postBulkDepreciation(org: string, userId: string, dto: BulkPostDepreciationDto) {
    const assets = await this.prisma.fixedAsset.findMany({ where: { organizationId: org, status: "ACTIVE", ...(dto.assetIds?.length ? { id: { in: dto.assetIds } } : {}) }, select: { id: true, assetCode: true } });
    const posted = [], failed = [];
    for (const asset of assets) {
      try { posted.push(await this.postDepreciation(org, userId, asset.id, dto)); }
      catch (error) { failed.push({ id: asset.id, assetCode: asset.assetCode, error: error instanceof Error ? error.message : "Depreciation failed" }); }
    }
    return { posted, failed };
  }

  async update(org: string, userId: string, id: string, dto: UpdateFixedAssetDto) {
    const old = await this.prisma.fixedAsset.findFirst({ where: { id, organizationId: org }, include: { assetLedger: true } });
    if (!old) throw new NotFoundException("Fixed asset not found");
    const salvage = dto.salvageValue === undefined ? old.salvageValue : D(dto.salvageValue);
    if (salvage.gte(old.capitalizedCost)) throw new BadRequestException("Salvage value must be lower than capitalized cost");
    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.name && dto.name.trim() !== old.name && !old.assetLedger.isSystem) await tx.ledgerAccount.update({ where: { id: old.assetLedgerId }, data: { name: dto.name.trim() } });
      await tx.fixedAsset.update({ where: { id }, data: { ...dto, name: dto.name?.trim(), location: dto.location?.trim() || undefined, department: dto.department?.trim() || undefined, assignedToName: dto.assignedToName?.trim() || undefined, brand: dto.brand?.trim() || undefined, model: dto.model?.trim() || undefined, manufacturer: dto.manufacturer?.trim() || undefined, serialNumber: dto.serialNumber?.trim() || undefined, registrationNumber: dto.registrationNumber?.trim() || undefined, notes: dto.notes?.trim() || undefined } });
      return tx.fixedAsset.findUniqueOrThrow({ where: { id }, include: assetInclude });
    });
    await this.audit.record({ organizationId: org, userId, action: "FIXED_ASSET_UPDATED", entityType: "FixedAsset", entityId: id, oldValue: { name: old.name }, newValue: { name: row.name } });
    return this.present(row);
  }

  async remove(org: string, userId: string, id: string) {
    const asset = await this.prisma.fixedAsset.findFirst({ where: { id, organizationId: org }, include: { assetLedger: true, depreciationEntries: true } });
    if (!asset) throw new NotFoundException("Fixed asset not found");
    if (asset.depreciationEntries.length) throw new ConflictException("Reverse depreciation entries before deleting this asset");
    if (asset.payableId) {
      const payable = await this.prisma.payable.findFirst({ where: { id: asset.payableId, organizationId: org } });
      if (payable && payable.paidAmount.gt(0)) throw new ConflictException("An asset with supplier payments cannot be deleted");
    }
    await this.prisma.$transaction(async (tx) => {
      await this.accounting.reverseSource(tx, org, userId, "FIXED_ASSET", asset.id);
      if (asset.fundingMode === "CASH_BANK") await this.cashBank.reverseSource(tx, { organizationId: org, sourceModule: "FIXED_ASSET", sourceId: asset.id, userId, reason: "Fixed asset deletion" });
      await tx.fixedAsset.delete({ where: { id: asset.id } });
      if (asset.payableId) await tx.payable.deleteMany({ where: { id: asset.payableId, organizationId: org, paidAmount: 0 } });
      if (!asset.assetLedger.isSystem) await tx.ledgerAccount.update({ where: { id: asset.assetLedgerId }, data: { isActive: false } });
    });
    await this.audit.record({ organizationId: org, userId, action: "FIXED_ASSET_DELETED", entityType: "FixedAsset", entityId: id, oldValue: { assetCode: asset.assetCode, name: asset.name } });
    return { id, success: true };
  }

  async registerReport(org: string) {
    const rows = await this.prisma.fixedAsset.findMany({ where: { organizationId: org }, include: assetInclude, orderBy: { assetCode: "asc" } });
    return rows.map((row) => this.present(row));
  }
}
