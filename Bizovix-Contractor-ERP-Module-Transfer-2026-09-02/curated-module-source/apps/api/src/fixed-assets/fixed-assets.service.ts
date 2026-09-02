import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";

import { AccountLevel, AccountNature, PartyType, Prisma, VoucherEntryStatus } from "../generated/prisma/index.js";
import {
  ACCOUNT_MANAGED_ROLE,
  fixedAssetCategoryAccumulatedDepreciationRole,
  fixedAssetCategoryDepreciationExpenseRole,
  fixedAssetCategoryNodeRole,
} from "../accounts/account-managed-role.js";
import { AccountsService } from "../accounts/accounts.service.js";
import { moneyEquals, roundMoney, sumMoney, toPaisa } from "../accounting/money.util.js";
import { PostingEngineService } from "../accounting/posting-engine.service.js";
import { AuditService } from "../audit/audit.service.js";
import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { VouchersService } from "../vouchers/vouchers.service.js";
import type { CreateAssetCategoryDto } from "./dto/create-asset-category.dto.js";
import type { CreateFixedAssetDto } from "./dto/create-fixed-asset.dto.js";
import type { PostDepreciationDto } from "./dto/post-depreciation.dto.js";
import type { UpdateAssetCategoryDto } from "./dto/update-asset-category.dto.js";
import type { UpdateFixedAssetDto } from "./dto/update-fixed-asset.dto.js";

function toDateOnly(value: string | Date) {
  const date = new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function slugifyCategoryCode(name: string) {
  const slug = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
  return slug.slice(0, 12) || "CAT";
}

type FixedAssetWithHistory = Prisma.FixedAssetGetPayload<{
  include: { depreciationEntries: { include: { voucherEntry: true } }; assetLedger: true; assetCategory: true; supplier: true };
}>;

function withNetBookValue(asset: FixedAssetWithHistory) {
  const accumulatedDepreciation = sumMoney(asset.depreciationEntries.map((entry) => entry.amount));
  const netBookValue = sumMoney([asset.capitalizedCost, -accumulatedDepreciation]);
  return {
    id: asset.id,
    assetCode: asset.assetCode,
    name: asset.name,
    category: asset.category,
    categoryId: asset.categoryId,
    categoryName: asset.assetCategory?.name ?? null,
    location: asset.location,
    department: asset.department,
    assignedToName: asset.assignedToName,
    brand: asset.brand,
    model: asset.model,
    manufacturer: asset.manufacturer,
    serialNumber: asset.serialNumber,
    registrationNumber: asset.registrationNumber,
    condition: asset.condition,
    operationalStatus: asset.operationalStatus,
    acquisitionType: asset.acquisitionType,
    supplierId: asset.supplierId,
    supplierName: asset.supplier?.name ?? null,
    notes: asset.notes,
    purchaseDate: asset.purchaseDate,
    purchaseCost: roundMoney(asset.purchaseCost),
    transportationCost: roundMoney(asset.transportationCost),
    installationCost: roundMoney(asset.installationCost),
    importDuty: roundMoney(asset.importDuty),
    registrationCost: roundMoney(asset.registrationCost),
    otherCapitalizedCost: roundMoney(asset.otherCapitalizedCost),
    discountAmount: roundMoney(asset.discountAmount),
    capitalizedCost: roundMoney(asset.capitalizedCost),
    salvageValue: roundMoney(asset.salvageValue),
    usefulLifeMonths: asset.usefulLifeMonths,
    depreciationMethod: asset.depreciationMethod,
    status: asset.status,
    disposalDate: asset.disposalDate,
    disposalProceeds: asset.disposalProceeds ? roundMoney(asset.disposalProceeds) : null,
    assetLedgerId: asset.assetLedgerId,
    assetLedgerCode: asset.assetLedger.code,
    accumulatedDepreciation,
    netBookValue,
    periodsPosted: asset.depreciationEntries.length,
    lastDepreciationDate: asset.depreciationEntries.at(-1)?.periodEnd ?? null,
    createdAt: asset.createdAt,
    depreciationHistory: asset.depreciationEntries.map((entry) => ({
      periodStart: entry.periodStart,
      periodEnd: entry.periodEnd,
      amount: roundMoney(entry.amount),
      voucherNumber: entry.voucherEntry.voucherNumber,
    })),
  };
}

const assetWithHistoryInclude = {
  depreciationEntries: { orderBy: { periodEnd: "asc" as const }, include: { voucherEntry: true } },
  assetLedger: true,
  assetCategory: true,
  supplier: true,
} satisfies Prisma.FixedAssetInclude;

@Injectable()
export class FixedAssetsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AccountsService) private readonly accountsService: AccountsService,
    @Inject(VouchersService) private readonly vouchersService: VouchersService,
    @Inject(PostingEngineService) private readonly postingEngine: PostingEngineService,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  private async ensureWorkspaceAccess(currentUser: AuthenticatedRequestUser, workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace || workspace.companyId !== currentUser.companyId || workspace.tenantId !== currentUser.tenantId) {
      throw new ForbiddenException("Workspace access denied");
    }
    return workspace;
  }

  private async ensureManagedAccount(
    currentUser: AuthenticatedRequestUser,
    managedRole: string,
    parentId: string,
    defaultName: string,
    level: "CATEGORY" | "LEDGER",
    nature: "ASSET" | "INDIRECT_EXPENSE",
  ) {
    const existing = await this.prisma.account.findFirst({
      where: { companyId: currentUser.companyId, managedRole },
    });
    const candidate = existing ?? await this.accountsService.createManagedAccount(currentUser, managedRole, {
      level,
      parentId,
      name: defaultName,
      nature,
      requiresItemDetails: level === "LEDGER" ? false : undefined,
    });
    const legacyParentIsValid = existing && candidate.parentId !== parentId
      ? Boolean(await this.prisma.account.findFirst({
          where: { id: candidate.parentId ?? "", companyId: currentUser.companyId, level: AccountLevel.CATEGORY, status: "ACTIVE" },
        }))
      : false;
    if (
      candidate.managedRole !== managedRole
      || candidate.level !== level
      || (candidate.parentId !== parentId && !legacyParentIsValid)
      || candidate.nature !== nature
      || candidate.status !== "ACTIVE"
      || candidate.isSystem
    ) {
      throw new BadRequestException(`Managed Fixed Asset account role ${managedRole} conflicts with the protected Chart of Accounts structure.`);
    }
    return candidate;
  }

  private async loadMappedFixedAssetAccount(
    currentUser: AuthenticatedRequestUser,
    accountId: string,
    expectedLevel: "CATEGORY" | "LEDGER",
    expectedNature: "ASSET" | "INDIRECT_EXPENSE",
    label: string,
  ) {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, companyId: currentUser.companyId, status: "ACTIVE" },
    });
    if (!account || account.level !== expectedLevel || account.nature !== expectedNature) {
      throw new BadRequestException(`${label} mapping is missing, inactive, cross-company, or has an invalid account type.`);
    }
    return account;
  }

  /** Idempotently ensures the Chart of Accounts has everywhere an uncategorized
   * Fixed Asset needs to file: Assets > Fixed Assets (each
   * asset gets its own ledger under here), a shared "Accumulated Depreciation"
   * contra-asset ledger under it, and a shared "Depreciation Expense" ledger
   * under Expenses > Indirect Expenses. Categorized assets get their own set
   * instead (see ensureCategoryLedgers) — this is the fallback for assets with
   * no category, kept for backward compatibility with pre-Phase-1 data. Safe to
   * call on every request — each step is a find-or-create. */
  async ensureFixedAssetChartSetup(currentUser: AuthenticatedRequestUser) {
    const fixedAssetsCategory = await this.prisma.account.findFirst({
      where: { companyId: currentUser.companyId, code: "1100000", level: AccountLevel.CATEGORY, status: "ACTIVE", isSystem: true },
    });
    if (!fixedAssetsCategory) {
      throw new BadRequestException("This company's Chart of Accounts has no protected Fixed Assets category (1100000).");
    }
    const accumulatedDepreciationLedger = await this.ensureManagedAccount(
      currentUser,
      ACCOUNT_MANAGED_ROLE.FIXED_ASSET_ACCUMULATED_DEPRECIATION,
      fixedAssetsCategory.id,
      "Accumulated Depreciation",
      "LEDGER",
      "ASSET",
    );

    const indirectExpenses = await this.prisma.account.findFirst({
      where: { companyId: currentUser.companyId, code: "5200000", level: AccountLevel.CATEGORY, status: "ACTIVE", isSystem: true },
    });
    if (!indirectExpenses) {
      throw new BadRequestException("This company's Chart of Accounts has no protected Indirect Expenses category (5200000).");
    }
    const depreciationExpenseLedger = await this.ensureManagedAccount(
      currentUser,
      ACCOUNT_MANAGED_ROLE.FIXED_ASSET_DEPRECIATION_EXPENSE,
      indirectExpenses.id,
      "Depreciation Expense",
      "LEDGER",
      "INDIRECT_EXPENSE",
    );

    return {
      fixedAssetsCategoryId: fixedAssetsCategory.id,
      accumulatedDepreciationLedgerId: accumulatedDepreciationLedger.id,
      accumulatedDepreciationLedgerName: accumulatedDepreciationLedger.name,
      depreciationExpenseLedgerId: depreciationExpenseLedger.id,
      depreciationExpenseLedgerName: depreciationExpenseLedger.name,
      indirectExpensesCategoryId: indirectExpenses.id,
    };
  }

  // --- Asset Categories --------------------------------------------------

  async listCategories(currentUser: AuthenticatedRequestUser) {
    const categories = await this.prisma.assetCategory.findMany({
      where: { companyId: currentUser.companyId },
      include: { _count: { select: { assets: true } } },
      orderBy: { name: "asc" },
    });
    return categories.map((category) => ({
      id: category.id,
      name: category.name,
      code: category.code,
      parentId: category.parentId,
      defaultUsefulLifeMonths: category.defaultUsefulLifeMonths,
      defaultSalvageValue: category.defaultSalvageValue === null ? null : roundMoney(category.defaultSalvageValue),
      defaultDepreciationMethod: category.defaultDepreciationMethod,
      isActive: category.isActive,
      assetCount: category._count.assets,
    }));
  }

  async createCategory(currentUser: AuthenticatedRequestUser, dto: CreateAssetCategoryDto) {
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException("Category name is required.");
    }
    if (dto.parentId) {
      const parent = await this.prisma.assetCategory.findFirst({ where: { id: dto.parentId, companyId: currentUser.companyId } });
      if (!parent) {
        throw new BadRequestException("Parent category not found.");
      }
    }

    const baseCode = dto.code?.trim() ? slugifyCategoryCode(dto.code) : slugifyCategoryCode(name);
    let code = baseCode;
    for (let attempt = 1; attempt < 50; attempt += 1) {
      const conflict = await this.prisma.assetCategory.findFirst({ where: { companyId: currentUser.companyId, code } });
      if (!conflict) break;
      code = `${baseCode}-${attempt + 1}`;
    }

    const category = await this.prisma.assetCategory.create({
      data: {
        tenantId: currentUser.tenantId,
        companyId: currentUser.companyId,
        parentId: dto.parentId ?? null,
        name,
        code,
        defaultUsefulLifeMonths: dto.defaultUsefulLifeMonths ?? null,
        defaultSalvageValue: dto.defaultSalvageValue == null ? null : roundMoney(dto.defaultSalvageValue),
        defaultDepreciationMethod: (dto.defaultDepreciationMethod as "STRAIGHT_LINE") ?? "STRAIGHT_LINE",
      },
    });

    return { ...category, defaultSalvageValue: category.defaultSalvageValue === null ? null : roundMoney(category.defaultSalvageValue), assetCount: 0 };
  }

  async updateCategory(currentUser: AuthenticatedRequestUser, id: string, dto: UpdateAssetCategoryDto) {
    const existing = await this.prisma.assetCategory.findFirst({ where: { id, companyId: currentUser.companyId } });
    if (!existing) {
      throw new NotFoundException("Asset category not found");
    }
    const updated = await this.prisma.assetCategory.update({
      where: { id },
      data: {
        name: dto.name?.trim() || undefined,
        defaultUsefulLifeMonths: dto.defaultUsefulLifeMonths ?? undefined,
        defaultSalvageValue: dto.defaultSalvageValue == null ? undefined : roundMoney(dto.defaultSalvageValue),
        defaultDepreciationMethod: (dto.defaultDepreciationMethod as "STRAIGHT_LINE") ?? undefined,
        isActive: dto.isActive ?? undefined,
      },
    });
    return { ...updated, defaultSalvageValue: updated.defaultSalvageValue === null ? null : roundMoney(updated.defaultSalvageValue) };
  }

  async deleteCategory(currentUser: AuthenticatedRequestUser, id: string) {
    const category = await this.prisma.assetCategory.findFirst({ where: { id, companyId: currentUser.companyId } });
    if (!category) {
      throw new NotFoundException("Asset category not found");
    }
    const assetCount = await this.prisma.fixedAsset.count({ where: { categoryId: id } });
    if (assetCount > 0) {
      throw new BadRequestException(`Cannot delete category with ${assetCount} asset(s). Delete assets first.`);
    }
    await this.prisma.assetCategory.delete({ where: { id } });
    return { success: true, id };
  }

  async bootstrapCoa(currentUser: AuthenticatedRequestUser) {
    const existing = await this.prisma.account.count({ where: { companyId: currentUser.companyId } });
    if (existing > 0) {
      return { status: "already_exists", count: existing };
    }

    const coaData: Array<{
      code: string;
      name: string;
      accountType: "CATEGORY" | "SUBCATEGORY" | "LEDGER";
      nature: AccountNature;
      isSystem: boolean;
      parentCode: string | null;
    }> = [
      // ======== 1. ASSETS ========
      { code: "1000", name: "Fixed Assets", accountType: "CATEGORY", nature: "ASSET", isSystem: true, parentCode: null },
      { code: "1100", name: "Fixed Assets - Property & Equipment", accountType: "SUBCATEGORY", nature: "ASSET", isSystem: true, parentCode: "1000" },
      { code: "1110", name: "Office Equipment", accountType: "LEDGER", nature: "ASSET", isSystem: false, parentCode: "1100" },
      { code: "1120", name: "Vehicles", accountType: "LEDGER", nature: "ASSET", isSystem: false, parentCode: "1100" },
      { code: "1130", name: "Building & Furniture", accountType: "LEDGER", nature: "ASSET", isSystem: false, parentCode: "1100" },

      { code: "2000", name: "Current Assets", accountType: "CATEGORY", nature: "ASSET", isSystem: true, parentCode: null },
      { code: "2100", name: "Closing Balance", accountType: "SUBCATEGORY", nature: "ASSET", isSystem: true, parentCode: "2000" },
      { code: "2110", name: "Closing Balance", accountType: "LEDGER", nature: "ASSET", isSystem: false, parentCode: "2100" },

      { code: "2200", name: "Cash & Cash Equivalents", accountType: "SUBCATEGORY", nature: "ASSET", isSystem: true, parentCode: "2000" },
      { code: "2210", name: "Cash Accounts", accountType: "SUBCATEGORY", nature: "ASSET", isSystem: true, parentCode: "2200" },
      { code: "2211", name: "Cash in Hand", accountType: "LEDGER", nature: "ASSET", isSystem: true, parentCode: "2210" },
      { code: "2212", name: "Petty Cash", accountType: "LEDGER", nature: "ASSET", isSystem: true, parentCode: "2210" },
      { code: "2220", name: "Bank & MFS Accounts", accountType: "SUBCATEGORY", nature: "ASSET", isSystem: true, parentCode: "2200" },
      { code: "2221", name: "Bank Accounts", accountType: "LEDGER", nature: "ASSET", isSystem: true, parentCode: "2220" },
      { code: "2222", name: "MFS", accountType: "LEDGER", nature: "ASSET", isSystem: true, parentCode: "2220" },

      { code: "2300", name: "Receivables", accountType: "SUBCATEGORY", nature: "ASSET", isSystem: true, parentCode: "2000" },
      { code: "2310", name: "Accounts Receivables Control", accountType: "LEDGER", nature: "ASSET", isSystem: true, parentCode: "2300" },
      { code: "2320", name: "Others Receivable", accountType: "LEDGER", nature: "ASSET", isSystem: false, parentCode: "2300" },

      { code: "2400", name: "Deposit & Advance", accountType: "SUBCATEGORY", nature: "ASSET", isSystem: true, parentCode: "2000" },
      { code: "2410", name: "Utility Deposit", accountType: "LEDGER", nature: "ASSET", isSystem: false, parentCode: "2400" },
      { code: "2420", name: "Advance to Supplier", accountType: "LEDGER", nature: "ASSET", isSystem: false, parentCode: "2400" },

      { code: "2500", name: "Goods in Transit", accountType: "SUBCATEGORY", nature: "ASSET", isSystem: true, parentCode: "2000" },
      { code: "2510", name: "Goods in Transit", accountType: "LEDGER", nature: "ASSET", isSystem: false, parentCode: "2500" },

      // ======== 2. LIABILITIES ========
      { code: "3000", name: "Liabilities", accountType: "CATEGORY", nature: "LIABILITY", isSystem: true, parentCode: null },
      { code: "3100", name: "Long Term Liabilities", accountType: "SUBCATEGORY", nature: "LIABILITY", isSystem: true, parentCode: "3000" },
      { code: "3110", name: "Bank Loan", accountType: "LEDGER", nature: "LIABILITY", isSystem: false, parentCode: "3100" },

      { code: "3200", name: "Current Liabilities", accountType: "SUBCATEGORY", nature: "LIABILITY", isSystem: true, parentCode: "3000" },
      { code: "3210", name: "Payable", accountType: "SUBCATEGORY", nature: "LIABILITY", isSystem: true, parentCode: "3200" },
      { code: "3211", name: "Accounts Payable Control", accountType: "LEDGER", nature: "LIABILITY", isSystem: true, parentCode: "3210" },
      { code: "3212", name: "Others Payable", accountType: "LEDGER", nature: "LIABILITY", isSystem: true, parentCode: "3210" },

      { code: "3220", name: "Advance Received", accountType: "SUBCATEGORY", nature: "LIABILITY", isSystem: true, parentCode: "3200" },
      { code: "3221", name: "Advance from Customer", accountType: "LEDGER", nature: "LIABILITY", isSystem: false, parentCode: "3220" },

      { code: "3230", name: "VAT", accountType: "SUBCATEGORY", nature: "LIABILITY", isSystem: true, parentCode: "3200" },
      { code: "3231", name: "VAT Input", accountType: "LEDGER", nature: "LIABILITY", isSystem: true, parentCode: "3230" },
      { code: "3232", name: "VAT Output", accountType: "LEDGER", nature: "LIABILITY", isSystem: true, parentCode: "3230" },

      { code: "3240", name: "Loan", accountType: "SUBCATEGORY", nature: "LIABILITY", isSystem: true, parentCode: "3200" },
      { code: "3241", name: "Short Term Loan", accountType: "LEDGER", nature: "LIABILITY", isSystem: false, parentCode: "3240" },
      { code: "3242", name: "Time Loan", accountType: "LEDGER", nature: "LIABILITY", isSystem: false, parentCode: "3240" },
      { code: "3243", name: "Personal Loan", accountType: "LEDGER", nature: "LIABILITY", isSystem: false, parentCode: "3240" },

      // ======== 3. EQUITY ========
      { code: "4000", name: "Equity", accountType: "CATEGORY", nature: "EQUITY", isSystem: true, parentCode: null },
      { code: "4100", name: "Capital & Reserves", accountType: "SUBCATEGORY", nature: "EQUITY", isSystem: true, parentCode: "4000" },
      { code: "4110", name: "Paid-up Capital", accountType: "LEDGER", nature: "EQUITY", isSystem: false, parentCode: "4100" },

      { code: "4200", name: "Withdraws", accountType: "SUBCATEGORY", nature: "EQUITY", isSystem: true, parentCode: "4000" },
      { code: "4210", name: "Drawings", accountType: "LEDGER", nature: "EQUITY", isSystem: false, parentCode: "4200" },

      { code: "4300", name: "Profit & Loss", accountType: "SUBCATEGORY", nature: "EQUITY", isSystem: true, parentCode: "4000" },
      { code: "4310", name: "Retained Earnings", accountType: "LEDGER", nature: "EQUITY", isSystem: false, parentCode: "4300" },

      // ======== 4. INCOME ========
      { code: "5000", name: "Income", accountType: "CATEGORY", nature: "INCOME", isSystem: true, parentCode: null },
      { code: "5100", name: "Operating Income", accountType: "SUBCATEGORY", nature: "INCOME", isSystem: true, parentCode: "5000" },
      { code: "5110", name: "Sales", accountType: "LEDGER", nature: "INCOME", isSystem: false, parentCode: "5100" },
      { code: "5120", name: "Sales Return", accountType: "LEDGER", nature: "INCOME", isSystem: false, parentCode: "5100" },

      { code: "5200", name: "Other Income", accountType: "SUBCATEGORY", nature: "INCOME", isSystem: true, parentCode: "5000" },
      { code: "5210", name: "Service Income", accountType: "LEDGER", nature: "INCOME", isSystem: false, parentCode: "5200" },
      { code: "5220", name: "Bank Interest", accountType: "LEDGER", nature: "INCOME", isSystem: false, parentCode: "5200" },
      { code: "5230", name: "Commission", accountType: "LEDGER", nature: "INCOME", isSystem: false, parentCode: "5200" },

      // ======== 5. DIRECT EXPENSES ========
      { code: "6000", name: "Direct Expenses", accountType: "CATEGORY", nature: "DIRECT_EXPENSE", isSystem: true, parentCode: null },
      { code: "6100", name: "Direct Expenses", accountType: "SUBCATEGORY", nature: "DIRECT_EXPENSE", isSystem: true, parentCode: "6000" },
      { code: "6110", name: "Carriage", accountType: "LEDGER", nature: "DIRECT_EXPENSE", isSystem: false, parentCode: "6100" },
      { code: "6120", name: "Labour", accountType: "LEDGER", nature: "DIRECT_EXPENSE", isSystem: false, parentCode: "6100" },
      { code: "6130", name: "Freight", accountType: "LEDGER", nature: "DIRECT_EXPENSE", isSystem: false, parentCode: "6100" },
      { code: "6140", name: "Handling", accountType: "LEDGER", nature: "DIRECT_EXPENSE", isSystem: false, parentCode: "6100" },
      { code: "6150", name: "Loading", accountType: "LEDGER", nature: "DIRECT_EXPENSE", isSystem: false, parentCode: "6100" },

      { code: "6200", name: "Purchase", accountType: "SUBCATEGORY", nature: "DIRECT_EXPENSE", isSystem: true, parentCode: "6000" },
      { code: "6210", name: "Purchase of Goods", accountType: "LEDGER", nature: "DIRECT_EXPENSE", isSystem: false, parentCode: "6200" },

      // ======== 6. INDIRECT EXPENSES ========
      { code: "7000", name: "Indirect Expenses", accountType: "CATEGORY", nature: "INDIRECT_EXPENSE", isSystem: true, parentCode: null },
      { code: "7100", name: "Administrative", accountType: "SUBCATEGORY", nature: "INDIRECT_EXPENSE", isSystem: true, parentCode: "7000" },
      { code: "7110", name: "Depreciation", accountType: "LEDGER", nature: "INDIRECT_EXPENSE", isSystem: false, parentCode: "7100" },
      { code: "7120", name: "Electricity", accountType: "LEDGER", nature: "INDIRECT_EXPENSE", isSystem: false, parentCode: "7100" },
      { code: "7130", name: "Internet", accountType: "LEDGER", nature: "INDIRECT_EXPENSE", isSystem: false, parentCode: "7100" },
      { code: "7140", name: "Rent", accountType: "LEDGER", nature: "INDIRECT_EXPENSE", isSystem: false, parentCode: "7100" },
      { code: "7150", name: "Stationery", accountType: "LEDGER", nature: "INDIRECT_EXPENSE", isSystem: false, parentCode: "7100" },
      { code: "7160", name: "Maintenance", accountType: "LEDGER", nature: "INDIRECT_EXPENSE", isSystem: false, parentCode: "7100" },

      { code: "7200", name: "Financial", accountType: "SUBCATEGORY", nature: "INDIRECT_EXPENSE", isSystem: true, parentCode: "7000" },
      { code: "7210", name: "Bank Charge", accountType: "LEDGER", nature: "INDIRECT_EXPENSE", isSystem: false, parentCode: "7200" },
      { code: "7220", name: "Interest", accountType: "LEDGER", nature: "INDIRECT_EXPENSE", isSystem: false, parentCode: "7200" },
      { code: "7230", name: "Loan Fee", accountType: "LEDGER", nature: "INDIRECT_EXPENSE", isSystem: false, parentCode: "7200" },

      { code: "7300", name: "Sales & Marketing", accountType: "SUBCATEGORY", nature: "INDIRECT_EXPENSE", isSystem: true, parentCode: "7000" },
      { code: "7310", name: "Advertisement", accountType: "LEDGER", nature: "INDIRECT_EXPENSE", isSystem: false, parentCode: "7300" },
      { code: "7320", name: "Entertainment", accountType: "LEDGER", nature: "INDIRECT_EXPENSE", isSystem: false, parentCode: "7300" },
      { code: "7330", name: "Digital Marketing", accountType: "LEDGER", nature: "INDIRECT_EXPENSE", isSystem: false, parentCode: "7300" },
      { code: "7340", name: "Promotion", accountType: "LEDGER", nature: "INDIRECT_EXPENSE", isSystem: false, parentCode: "7300" },
      { code: "7350", name: "Commission", accountType: "LEDGER", nature: "INDIRECT_EXPENSE", isSystem: false, parentCode: "7300" },
    ];

    const parentMap = new Map<string, string>();

    for (const item of coaData) {
      const parentId = item.parentCode ? parentMap.get(item.parentCode) : null;
      const account = await this.prisma.account.create({
        data: {
          code: item.code,
          name: item.name,
          level: item.accountType === "LEDGER" ? AccountLevel.LEDGER : AccountLevel.CATEGORY,
          nature: item.nature,
          isSystem: item.isSystem,
          parentId: parentId || null,
          tenantId: currentUser.tenantId,
          companyId: currentUser.companyId,
        },
      });
      parentMap.set(item.code, account.id);
    }

    const stats = await this.prisma.account.groupBy({
      by: ["level"],
      where: { companyId: currentUser.companyId },
      _count: true,
    });

    const protectedCount = await this.prisma.account.count({
      where: { companyId: currentUser.companyId, isSystem: true },
    });

    return {
      status: "success",
      message: `✅ COA seeding complete`,
      totalCreated: coaData.length,
      breakdown: Object.fromEntries(stats.map((s) => [s.level, s._count])),
      protectedCount,
    };
  }

  /** Idempotently provisions a category's own GL ledger set — a "Fixed Assets:
   * <Category>" node (each asset in the category gets its own ledger filed
   * under this, same as the global fallback), plus one shared "Accumulated
   * Depreciation - <Category>" and "Depreciation Expense - <Category>" ledger
   * that every asset in the category posts depreciation through. Persisted
   * onto the AssetCategory row so this only runs once per category. */
  private async ensureCategoryLedgers(currentUser: AuthenticatedRequestUser, categoryId: string) {
    const category = await this.prisma.assetCategory.findFirst({ where: { id: categoryId, companyId: currentUser.companyId } });
    if (!category) {
      throw new NotFoundException("Asset category not found");
    }
    const { fixedAssetsCategoryId, indirectExpensesCategoryId } = await this.ensureFixedAssetChartSetup(currentUser);
    const categoryNode = category.assetLedgerId
      ? await this.loadMappedFixedAssetAccount(currentUser, category.assetLedgerId, "CATEGORY", "ASSET", "Fixed Asset category account")
      : await this.ensureManagedAccount(
          currentUser,
          fixedAssetCategoryNodeRole(category.id),
          fixedAssetsCategoryId,
          `Fixed Assets: ${category.name}`,
          "CATEGORY",
          "ASSET",
        );
    const accumulatedDepreciationLedger = category.accumulatedDepreciationLedgerId
      ? await this.loadMappedFixedAssetAccount(
          currentUser,
          category.accumulatedDepreciationLedgerId,
          "LEDGER",
          "ASSET",
          "Accumulated Depreciation account",
        )
      : await this.ensureManagedAccount(
          currentUser,
          fixedAssetCategoryAccumulatedDepreciationRole(category.id),
          categoryNode.id,
          `Accumulated Depreciation - ${category.name}`,
          "LEDGER",
          "ASSET",
        );
    const depreciationExpenseLedger = category.depreciationExpenseLedgerId
      ? await this.loadMappedFixedAssetAccount(
          currentUser,
          category.depreciationExpenseLedgerId,
          "LEDGER",
          "INDIRECT_EXPENSE",
          "Depreciation Expense account",
        )
      : await this.ensureManagedAccount(
          currentUser,
          fixedAssetCategoryDepreciationExpenseRole(category.id),
          indirectExpensesCategoryId,
          `Depreciation Expense - ${category.name}`,
          "LEDGER",
          "INDIRECT_EXPENSE",
        );

    if (
      category.assetLedgerId !== categoryNode.id
      || category.accumulatedDepreciationLedgerId !== accumulatedDepreciationLedger.id
      || category.depreciationExpenseLedgerId !== depreciationExpenseLedger.id
    ) {
      await this.prisma.assetCategory.update({
        where: { id: category.id },
        data: {
          assetLedgerId: categoryNode.id,
          accumulatedDepreciationLedgerId: accumulatedDepreciationLedger.id,
          depreciationExpenseLedgerId: depreciationExpenseLedger.id,
        },
      });
    }

    return {
      assetCategoryNodeId: categoryNode.id,
      accumulatedDepreciationLedgerId: accumulatedDepreciationLedger.id,
      accumulatedDepreciationLedgerName: accumulatedDepreciationLedger.name,
      depreciationExpenseLedgerId: depreciationExpenseLedger.id,
      depreciationExpenseLedgerName: depreciationExpenseLedger.name,
    };
  }

  private nextAssetCode(categoryCode: string | null, existingCodes: string[]) {
    const prefix = `AST-${categoryCode ?? "GEN"}-`;
    let maxSeq = 0;
    existingCodes.forEach((code) => {
      if (!code.startsWith(prefix)) return;
      const seq = Number(code.slice(prefix.length));
      if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
    });
    return `${prefix}${String(maxSeq + 1).padStart(4, "0")}`;
  }

  // --- Assets --------------------------------------------------------------

  async list(currentUser: AuthenticatedRequestUser) {
    await this.ensureFixedAssetChartSetup(currentUser);
    const assets = await this.prisma.fixedAsset.findMany({
      where: { companyId: currentUser.companyId },
      include: assetWithHistoryInclude,
      orderBy: { createdAt: "desc" },
    });
    return assets.map(withNetBookValue);
  }

  async create(currentUser: AuthenticatedRequestUser, dto: CreateFixedAssetDto) {
    await this.ensureWorkspaceAccess(currentUser, dto.workspaceId);

    const name = dto.name.trim();
    const purchaseCost = roundMoney(dto.purchaseCost);
    const transportationCost = roundMoney(dto.transportationCost);
    const installationCost = roundMoney(dto.installationCost);
    const importDuty = roundMoney(dto.importDuty);
    const registrationCost = roundMoney(dto.registrationCost);
    const otherCapitalizedCost = roundMoney(dto.otherCapitalizedCost);
    const discountAmount = roundMoney(dto.discountAmount);
    const capitalizedCost = sumMoney([
      purchaseCost,
      transportationCost,
      installationCost,
      importDuty,
      registrationCost,
      otherCapitalizedCost,
      -discountAmount,
    ]);
    const salvageValue = roundMoney(dto.salvageValue);
    if (capitalizedCost <= 0) {
      throw new BadRequestException("Capitalized cost must be greater than zero.");
    }
    if (salvageValue >= capitalizedCost) {
      throw new BadRequestException("Salvage value must be less than the capitalized cost.");
    }

    let category: { id: string; code: string; name: string } | null = null;
    if (dto.categoryId) {
      const found = await this.prisma.assetCategory.findFirst({ where: { id: dto.categoryId, companyId: currentUser.companyId } });
      if (!found) {
        throw new BadRequestException("Selected asset category was not found.");
      }
      category = found;
    }

    const fundingMode = dto.fundingMode ?? "CASH_BANK";
    // Cash/bank funding can be split across several money ledgers (e.g. part
    // cash, part bank, part cheque-drawn-on-a-bank, part MFS). Each split is a
    // real Cash/Bank/MFS ledger + amount; they flow straight into the asset
    // ledger's opening-balance sources, which AccountsService already supports
    // as an array and validates the sum of. Two splits pointing at the same
    // ledger (e.g. a direct bank transfer and a cheque drawn on that same bank)
    // are merged into one source line, since both simply reduce that ledger.
    let fundingSources: Array<{ accountId: string; amount: number }> = [];
    let supplier: { id: string; name: string; ledgerAccountId: string | null } | null = null;
    let supplierLedger: { id: string; name: string } | null = null;
    if (fundingMode === "CASH_BANK") {
      const rawSources = dto.fundingSources?.length
        ? dto.fundingSources
        : dto.fundingAccountId
          ? [{ accountId: dto.fundingAccountId, amount: capitalizedCost }]
          : [];
      if (!rawSources.length) {
        throw new BadRequestException("Select at least one ledger this asset was paid from.");
      }
      const mergedByLedger = new Map<string, number>();
      for (const source of rawSources) {
        const accountId = String(source?.accountId ?? "").trim();
        const amount = roundMoney(source?.amount);
        if (!accountId || !Number.isFinite(amount) || amount <= 0) {
          throw new BadRequestException("Every payment split needs a ledger and an amount greater than zero.");
        }
        mergedByLedger.set(accountId, sumMoney([mergedByLedger.get(accountId), amount]));
      }
      fundingSources = [...mergedByLedger.entries()].map(([accountId, amount]) => ({ accountId, amount }));
      const allocated = sumMoney(fundingSources.map((source) => source.amount));
      if (!moneyEquals(allocated, capitalizedCost)) {
        throw new BadRequestException(`Payment splits must total the capitalized cost (${capitalizedCost.toFixed(2)}).`);
      }
      for (const source of fundingSources) {
        const ledger = await this.prisma.account.findFirst({
          where: { id: source.accountId, companyId: currentUser.companyId, level: AccountLevel.LEDGER, status: "ACTIVE" },
        });
        if (!ledger) {
          throw new BadRequestException("One of the selected payment ledgers is invalid or inactive.");
        }
      }
    } else {
      if (!dto.supplierId) {
        throw new BadRequestException("Select the supplier this asset is payable to.");
      }
      supplier = await this.prisma.party.findFirst({
        where: { id: dto.supplierId, workspaceId: dto.workspaceId, type: PartyType.SUPPLIER },
        select: { id: true, name: true, ledgerAccountId: true },
      });
      if (!supplier) {
        throw new BadRequestException("Selected supplier was not found.");
      }
      if (!supplier.ledgerAccountId) {
        throw new BadRequestException("Selected supplier is not linked to an Accounts Payable ledger.");
      }
      supplierLedger = await this.prisma.account.findFirst({
        where: {
          id: supplier.ledgerAccountId,
          companyId: currentUser.companyId,
          level: AccountLevel.LEDGER,
          status: "ACTIVE",
          accountGroup: { code: "AP" },
        },
        select: { id: true, name: true },
      });
      if (!supplierLedger) {
        throw new BadRequestException("Selected supplier's Accounts Payable ledger is missing, inactive, or invalid.");
      }
    }

    const parentAccountId = category
      ? (await this.ensureCategoryLedgers(currentUser, category.id)).assetCategoryNodeId
      : (await this.ensureFixedAssetChartSetup(currentUser)).fixedAssetsCategoryId;

    // Reuses AccountsService.create() so the new asset gets a real, positionally-
    // coded ledger under Fixed Assets (or its category's own node), and — when
    // cash/bank funded — its opening balance is posted through the exact same
    // mechanism every other ledger's opening balance uses.
    const assetLedger = await this.accountsService.create(currentUser, {
      level: "LEDGER",
      parentId: parentAccountId,
      name,
      nature: "ASSET",
      requiresItemDetails: false,
      ...(fundingMode === "CASH_BANK"
        ? {
            openingBalance: capitalizedCost,
            openingBalanceDate: dto.purchaseDate,
            openingBalanceSources: fundingSources,
          }
        : {}),
    });

    const existingCodes = await this.prisma.fixedAsset.findMany({
      where: { companyId: currentUser.companyId },
      select: { assetCode: true },
    });
    const assetCode = this.nextAssetCode(category?.code ?? null, existingCodes.map((row) => row.assetCode));

    const asset = await this.prisma.fixedAsset.create({
      data: {
        tenantId: currentUser.tenantId,
        companyId: currentUser.companyId,
        workspaceId: dto.workspaceId,
        assetLedgerId: assetLedger.id,
        assetCode,
        categoryId: category?.id ?? null,
        supplierId: supplier?.id ?? null,
        name,
        category: dto.category?.trim() || category?.name || null,
        location: dto.location?.trim() || null,
        department: dto.department?.trim() || null,
        assignedToName: dto.assignedToName?.trim() || null,
        brand: dto.brand?.trim() || null,
        model: dto.model?.trim() || null,
        manufacturer: dto.manufacturer?.trim() || null,
        serialNumber: dto.serialNumber?.trim() || null,
        registrationNumber: dto.registrationNumber?.trim() || null,
        condition: dto.condition ?? "GOOD",
        operationalStatus: dto.operationalStatus ?? "AVAILABLE",
        acquisitionType: dto.acquisitionType ?? (fundingMode === "CREDIT" ? "PURCHASE_ORDER" : "DIRECT_PURCHASE"),
        notes: dto.notes?.trim() || null,
        purchaseDate: toDateOnly(dto.purchaseDate),
        purchaseCost,
        transportationCost,
        installationCost,
        importDuty,
        registrationCost,
        otherCapitalizedCost,
        discountAmount,
        capitalizedCost,
        salvageValue,
        usefulLifeMonths: dto.usefulLifeMonths,
        depreciationMethod: (dto.depreciationMethod as "STRAIGHT_LINE") ?? "STRAIGHT_LINE",
        useManualDepreciation: dto.useManualDepreciation ?? false,
        manualDepreciationAmount:
          dto.manualDepreciationAmount === null || dto.manualDepreciationAmount === undefined
            ? null
            : roundMoney(dto.manualDepreciationAmount),
        createdByUserId: currentUser.id,
      },
      include: assetWithHistoryInclude,
    });

    // Credit-funded assets book the liability via a real journal entry (Dr the
    // new asset ledger / Cr the supplier) instead of an opening-balance source,
    // since a supplier is a Party, not a chart-of-accounts Ledger the opening
    // balance mechanism can point at. The Party-owned AP account id is the
    // accounting identity; its current name is persisted only as a display
    // snapshot.
    if (fundingMode === "CREDIT" && supplier && supplierLedger) {
      const voucher = await this.vouchersService.create(currentUser, {
        workspaceId: dto.workspaceId,
        voucherType: "journal",
        voucherDate: dto.purchaseDate,
        partyName: supplier.name,
        narration: `Acquired ${name} on credit from ${supplier.name}`,
        status: "draft",
        totalAmount: capitalizedCost,
        lines: [
          {
            id: "asset-acquisition",
            accountId: assetLedger.id,
            ledger: name,
            description: `Acquisition - ${name}`,
            debit: capitalizedCost,
            credit: 0,
          },
          {
            id: "asset-acquisition-payable",
            accountId: supplierLedger.id,
            ledger: supplierLedger.name,
            description: `Acquisition - ${name}`,
            debit: 0,
            credit: capitalizedCost,
          },
        ],
      });
      await this.postingEngine.transitionStatus(currentUser, voucher.id, VoucherEntryStatus.PENDING);
      await this.postingEngine.transitionStatus(currentUser, voucher.id, VoucherEntryStatus.POSTED);
    }

    return withNetBookValue(asset);
  }

  /** The straight-line monthly amount, and how much room is left before
   * hitting salvage value — used both to preview and to actually post. */
  private async computeNextDepreciation(currentUser: AuthenticatedRequestUser, assetId: string) {
    const asset = await this.prisma.fixedAsset.findFirst({
      where: { id: assetId, companyId: currentUser.companyId },
      include: { depreciationEntries: { orderBy: { periodEnd: "desc" }, take: 1 } },
    });
    if (!asset) {
      throw new NotFoundException("Fixed asset not found");
    }
    if (asset.status === "DISPOSED") {
      throw new BadRequestException("This asset has been disposed and can no longer be depreciated.");
    }

    const depreciableBase = sumMoney([asset.capitalizedCost, new Prisma.Decimal(asset.salvageValue).negated()]);
    const monthlyAmount = roundMoney(
      asset.useManualDepreciation && asset.manualDepreciationAmount
        ? Number(asset.manualDepreciationAmount) / 12
        : depreciableBase / asset.usefulLifeMonths,
    );
    const alreadyPosted = await this.prisma.fixedAssetDepreciationEntry.aggregate({
      where: { fixedAssetId: asset.id },
      _sum: { amount: true },
    });
    const postedSoFar = roundMoney(alreadyPosted._sum.amount);
    const remaining = Math.max(0, sumMoney([depreciableBase, -postedSoFar]));
    const lastEntry = asset.depreciationEntries[0];
    const periodStart = lastEntry ? addDays(toDateOnly(lastEntry.periodEnd), 1) : toDateOnly(asset.purchaseDate);

    return { asset, monthlyAmount, remaining, periodStart };
  }

  async previewDepreciation(currentUser: AuthenticatedRequestUser, assetId: string) {
    const { monthlyAmount, remaining, periodStart } = await this.computeNextDepreciation(currentUser, assetId);
    return {
      suggestedAmount: roundMoney(Math.min(monthlyAmount, remaining)),
      remaining,
      periodStart,
      fullyDepreciated: toPaisa(remaining) <= 0n,
    };
  }

  async postDepreciation(currentUser: AuthenticatedRequestUser, assetId: string, dto: PostDepreciationDto) {
    await this.ensureWorkspaceAccess(currentUser, dto.workspaceId);
    const { asset, monthlyAmount, remaining, periodStart } = await this.computeNextDepreciation(currentUser, assetId);
    if (toPaisa(remaining) <= 0n) {
      throw new BadRequestException("This asset is already fully depreciated.");
    }

    const periodEnd = toDateOnly(dto.periodEnd);
    if (periodEnd < periodStart) {
      throw new BadRequestException(`Period end must be on or after ${periodStart.toISOString().slice(0, 10)}.`);
    }

    const duplicate = await this.prisma.fixedAssetDepreciationEntry.findUnique({
      where: { fixedAssetId_periodEnd: { fixedAssetId: asset.id, periodEnd } },
    });
    if (duplicate) {
      throw new BadRequestException("Depreciation for this period has already been posted.");
    }

    // Allow custom amount if provided (useful for accelerated depreciation,
    // adjustments, or catch-up entries). Otherwise use the standard monthly amount.
    const customAmount = (dto as PostDepreciationDto & { customAmount?: number }).customAmount;
    const amount = roundMoney(
      customAmount !== undefined && customAmount > 0 ? customAmount : Math.min(monthlyAmount, remaining),
    );
    if (toPaisa(amount) > toPaisa(remaining)) {
      throw new BadRequestException(
        `Depreciation amount (${amount.toFixed(2)}) exceeds remaining depreciable amount (${remaining.toFixed(2)}).`,
      );
    }
    const {
      accumulatedDepreciationLedgerId,
      accumulatedDepreciationLedgerName,
      depreciationExpenseLedgerId,
      depreciationExpenseLedgerName,
    } = asset.categoryId
      ? await this.ensureCategoryLedgers(currentUser, asset.categoryId)
      : await this.ensureFixedAssetChartSetup(currentUser);

    const voucher = await this.vouchersService.create(currentUser, {
      workspaceId: dto.workspaceId,
      voucherType: "expense",
      voucherDate: periodEnd.toISOString().slice(0, 10),
      partyName: asset.name,
      narration: `Depreciation - ${asset.name} for period ending ${periodEnd.toISOString().slice(0, 10)}`,
      status: "draft",
      totalAmount: amount,
      lines: [
        {
          id: "depreciation-expense",
          accountId: depreciationExpenseLedgerId,
          ledger: depreciationExpenseLedgerName,
          description: `Depreciation - ${asset.name}`,
          debit: amount,
          credit: 0,
        },
        {
          id: "accumulated-depreciation",
          accountId: accumulatedDepreciationLedgerId,
          ledger: accumulatedDepreciationLedgerName,
          description: `Depreciation - ${asset.name}`,
          debit: 0,
          credit: amount,
        },
      ],
    });

    await this.postingEngine.transitionStatus(currentUser, voucher.id, VoucherEntryStatus.PENDING);
    await this.postingEngine.transitionStatus(currentUser, voucher.id, VoucherEntryStatus.POSTED);

    await this.prisma.fixedAssetDepreciationEntry.create({
      data: {
        fixedAssetId: asset.id,
        periodStart,
        periodEnd,
        amount,
        voucherEntryId: voucher.id,
      },
    });

    const fullyDepreciated = toPaisa(remaining) - toPaisa(amount) <= 0n;
    if (fullyDepreciated) {
      await this.prisma.fixedAsset.update({ where: { id: asset.id }, data: { status: "FULLY_DEPRECIATED" } });
    }

    const updated = await this.prisma.fixedAsset.findUniqueOrThrow({
      where: { id: asset.id },
      include: assetWithHistoryInclude,
    });
    return withNetBookValue(updated);
  }

  /**
   * Update asset details. Editable fields: name (also renames the GL ledger),
   * descriptive fields (location, department, assigned-to, brand/model/serial,
   * condition, operational-status), and depreciation estimates (salvage value,
   * useful-life months). Purchase cost, cost components, and funding are NOT
   * editable — changing a posted acquisition amount requires delete + re-create.
   */
  async update(currentUser: AuthenticatedRequestUser, assetId: string, dto: UpdateFixedAssetDto) {
    const asset = await this.prisma.fixedAsset.findFirst({
      where: { id: assetId, companyId: currentUser.companyId },
      include: { assetLedger: true },
    });

    if (!asset) {
      throw new NotFoundException("Fixed Asset not found");
    }

    const updates: Prisma.FixedAssetUpdateInput = {};

    // Rename the asset — also renames its GL ledger so charts stay consistent.
    if (dto.name !== undefined) {
      const nextName = dto.name.trim();
      if (nextName !== asset.name) {
        await this.accountsService.update(currentUser, asset.assetLedgerId, { name: nextName });
        updates.name = nextName;
      }
    }

    // Editable descriptive fields.
    if (dto.location !== undefined) updates.location = dto.location?.trim() || null;
    if (dto.department !== undefined) updates.department = dto.department?.trim() || null;
    if (dto.assignedToName !== undefined) updates.assignedToName = dto.assignedToName?.trim() || null;
    if (dto.brand !== undefined) updates.brand = dto.brand?.trim() || null;
    if (dto.model !== undefined) updates.model = dto.model?.trim() || null;
    if (dto.manufacturer !== undefined) updates.manufacturer = dto.manufacturer?.trim() || null;
    if (dto.serialNumber !== undefined) updates.serialNumber = dto.serialNumber?.trim() || null;
    if (dto.registrationNumber !== undefined) updates.registrationNumber = dto.registrationNumber?.trim() || null;
    if (dto.condition !== undefined) updates.condition = dto.condition;
    if (dto.operationalStatus !== undefined) updates.operationalStatus = dto.operationalStatus;
    if (dto.notes !== undefined) updates.notes = dto.notes?.trim() || null;

    // Depreciation estimates.
    if (dto.salvageValue !== undefined) updates.salvageValue = roundMoney(dto.salvageValue);
    if (dto.usefulLifeMonths !== undefined) updates.usefulLifeMonths = dto.usefulLifeMonths;
    if (dto.depreciationMethod !== undefined) updates.depreciationMethod = dto.depreciationMethod;
    if (dto.useManualDepreciation !== undefined) updates.useManualDepreciation = dto.useManualDepreciation;
    if (dto.manualDepreciationAmount !== undefined) {
      updates.manualDepreciationAmount =
        dto.manualDepreciationAmount === null ? null : roundMoney(dto.manualDepreciationAmount);
    }

    const updated = await this.prisma.fixedAsset.update({
      where: { id: assetId },
      data: updates,
      include: assetWithHistoryInclude,
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      companyId: currentUser.companyId,
      userId: currentUser.id,
      action: "FIXED_ASSET_UPDATED",
      entityType: "FixedAsset",
      entityId: assetId,
      oldValues: { name: asset.name },
      newValues: { name: updated.name },
    });

    return withNetBookValue(updated);
  }

  /**
   * Delete a fixed asset and retire its custom GL ledger. If the opening-balance
   * voucher is posted, automatically reverse it first. A protected system
   * account is never mutated even if historical/corrupt data links one here.
   */
  async delete(currentUser: AuthenticatedRequestUser, assetId: string) {
    const asset = await this.prisma.fixedAsset.findFirst({
      where: { id: assetId, companyId: currentUser.companyId },
      include: { assetLedger: { include: { voucherEntryLines: { take: 1 } } } },
    });

    if (!asset) {
      throw new NotFoundException("Fixed Asset not found");
    }

    // Check if the opening-balance voucher exists.
    const openingVoucher = await this.prisma.voucherEntry.findFirst({
      where: {
        companyId: currentUser.companyId,
        sourceType: "ACCOUNT_OPENING_BALANCE",
        sourceId: asset.assetLedgerId,
        reversalOfId: null,
      },
      include: { lines: true },
      orderBy: [{ postingVersion: "desc" }, { createdAt: "desc" }],
    });

    // Preserve posted GL history. PostingEngine is idempotent and keeps the
    // original plus its linked mirror instead of creating an unrelated journal.
    if (openingVoucher?.status === VoucherEntryStatus.POSTED) {
      await this.postingEngine.reverseVoucher(
        currentUser,
        openingVoucher.id,
        `Fixed Asset deleted — ${asset.name}`,
      );
    }

    // Delete the register row, but retain/deactivate its ledger whenever any GL
    // history references it. Only genuinely unused ledgers can be hard-deleted.
    await this.prisma.$transaction(async (tx) => {
      const postingCount = await tx.voucherEntryLine.count({
        where: {
          voucher: { companyId: currentUser.companyId },
          OR: [
            { accountId: asset.assetLedgerId },
            { accountId: null, ledger: asset.assetLedger.name },
          ],
        },
      });

      // Remove the FK owner before deleting an unused account.
      await tx.fixedAsset.delete({ where: { id: assetId } });
      if (asset.assetLedger.isSystem) {
        return;
      }
      if (postingCount === 0) {
        await tx.account.delete({ where: { id: asset.assetLedgerId } });
      } else {
        await tx.account.update({ where: { id: asset.assetLedgerId }, data: { status: "INACTIVE" } });
      }
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      companyId: currentUser.companyId,
      userId: currentUser.id,
      action: "FIXED_ASSET_DELETED",
      entityType: "FixedAsset",
      entityId: assetId,
      oldValues: { name: asset.name, assetCode: asset.assetCode },
    });

    return { success: true, id: assetId };
  }

}
