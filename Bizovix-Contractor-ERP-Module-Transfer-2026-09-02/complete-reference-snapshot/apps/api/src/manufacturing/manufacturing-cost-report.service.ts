import { createHash } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import {
  moneyEquals,
  roundMoneyDecimal,
  toPaisa,
} from "../accounting/money.util.js";
import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import { PermissionsService } from "../common/services/permissions.service.js";
import {
  ManufacturingCostType,
  ManufacturingOrderStatus,
  ManufacturingPackagingOrderStatus,
  ManufacturingQualityStatus,
  ManufacturingStandardCostStatus,
  Prisma,
  VoucherEntryStatus,
  type ManufacturingActualCostPosting,
  type ManufacturingCostDriver,
  type ManufacturingStandardCostVersion,
} from "../generated/prisma/index.js";
import { InventoryService } from "../inventory/inventory.service.js";
import { rebuildMovingAverageCosts } from "../inventory/moving-average.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  allocatePaisaByWeight,
  assertPostableCostType,
  calculateCostDriverAmount,
  calculateFinalSnapshot,
} from "./manufacturing-cost-report.domain.js";
import { evaluatePackagingHierarchy } from "./manufacturing-packaging.domain.js";
import type {
  ApproveManufacturingStandardCostDto,
  CreateManufacturingCostDriverDto,
  CreateManufacturingStandardCostDto,
  FinalizeManufacturingActualCostDto,
  PostManufacturingActualCostDto,
  UpdateManufacturingCostDriverDto,
} from "./manufacturing-cost-report.dto.js";

type Db = Prisma.TransactionClient | PrismaService;
type Query = Record<string, string | undefined>;
type Scope = { id: string; tenantId: string; companyId: string };
type LedgerSummary = {
  id: string;
  code: string;
  name: string;
  nature: string;
  isSystem: boolean;
};
type CostDriverWithAccount = ManufacturingCostDriver & {
  clearingAccount?: LedgerSummary | null;
};

const INVENTORY_CONTROL_ACCOUNT_CODE = "1210001";

const REPORT_NAMES = [
  "production-orders",
  "material-movements",
  "wip",
  "finished-receipts",
  "actual-costs",
  "cost-variance",
  "quality",
  "packaging",
  "traceability",
  "manufacturing-journals",
] as const;
type ReportName = (typeof REPORT_NAMES)[number];

function decimal(value: Prisma.Decimal.Value | null | undefined) {
  return new Prisma.Decimal(value ?? 0);
}

function decimalNumber(value: Prisma.Decimal.Value | null | undefined) {
  return decimal(value).toNumber();
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function jsonObject(
  value: Prisma.JsonValue | null | undefined,
): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function queryEnum<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  label: string,
) {
  if (!value) return undefined;
  if (!allowed.includes(value as T)) {
    throw new BadRequestException(`${label} is invalid.`);
  }
  return value as T;
}

function asDate(value: string, label = "date") {
  const result = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00.000Z`)
    : new Date(value);
  if (Number.isNaN(result.getTime()))
    throw new BadRequestException(`${label} is invalid.`);
  return result;
}

function dateOnly(value: Date | string | null | undefined) {
  return value ? new Date(value).toISOString().slice(0, 10) : null;
}

function iso(value: Date | string | null | undefined) {
  return value ? new Date(value).toISOString() : null;
}

function normalizeCode(value: string) {
  const code = value.trim().toUpperCase().replace(/\s+/g, "-");
  if (!code || code.length > 80 || !/^[A-Z0-9][A-Z0-9._/-]*$/.test(code)) {
    throw new BadRequestException(
      "Cost-driver code may contain letters, numbers, dot, underscore, slash and hyphen only.",
    );
  }
  return code;
}

function reference(prefix: string, seed: string) {
  return `${prefix}-${createHash("sha256").update(seed).digest("hex").slice(0, 16).toUpperCase()}`;
}

function isUniqueError(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "P2002",
  );
}

@Injectable()
export class ManufacturingCostReportService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PermissionsService)
    private readonly permissions: PermissionsService,
    @Inject(InventoryService)
    private readonly inventoryService?: InventoryService,
  ) {}

  private requireInventoryService() {
    if (!this.inventoryService) {
      throw new Error(
        "InventoryService is required for manufacturing cost valuation reconciliation",
      );
    }
    return this.inventoryService;
  }

  private async scope(
    currentUser: AuthenticatedRequestUser,
    requestedWorkspaceId?: string,
  ): Promise<Scope> {
    const workspaceId = requestedWorkspaceId || currentUser.workspaceId;
    if (!workspaceId || !currentUser.workspaceId)
      throw new BadRequestException("An active workspace is required.");
    if (workspaceId !== currentUser.workspaceId)
      throw new ForbiddenException(
        "Cross-workspace manufacturing access is not allowed.",
      );
    const workspace = await this.prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        tenantId: currentUser.tenantId,
        companyId: currentUser.companyId,
      },
      select: { id: true, tenantId: true, companyId: true },
    });
    if (!workspace) throw new NotFoundException("Workspace not found.");
    return workspace;
  }

  private async requirePermission(
    currentUser: AuthenticatedRequestUser,
    key: string,
  ) {
    const granted = await this.permissions.getGrantedKeys(currentUser);
    if (!granted.has(key))
      throw new ForbiddenException(`Permission required: ${key}`);
  }

  private async activeLedger(
    db: Db,
    companyId: string,
    accountId: string,
    label: string,
    expectedNature?: string,
  ) {
    const account = await db.account.findFirst({
      where: {
        id: accountId,
        companyId,
        status: "ACTIVE",
        level: "LEDGER",
        isControlAccount: false,
      },
      select: {
        id: true,
        code: true,
        name: true,
        nature: true,
        isSystem: true,
      },
    });
    if (!account)
      throw new BadRequestException(
        `${label} must be an existing active, non-control LEDGER account.`,
      );
    if (expectedNature && account.nature !== expectedNature)
      throw new BadRequestException(
        `${label} must be an active ${expectedNature} LEDGER account in this company.`,
      );
    return account;
  }

  private async protectedInventoryControlLedger(
    db: Db,
    companyId: string,
    accountId: string,
    label: string,
  ) {
    const account = await db.account.findFirst({
      where: {
        id: accountId,
        companyId,
        code: INVENTORY_CONTROL_ACCOUNT_CODE,
        status: "ACTIVE",
        level: "LEDGER",
        nature: "ASSET",
        isSystem: true,
        isControlAccount: true,
      },
      select: {
        id: true,
        code: true,
        name: true,
        nature: true,
        isSystem: true,
      },
    });
    if (!account)
      throw new BadRequestException(
        `${label} must reference this company's active protected Inventory Control ledger (${INVENTORY_CONTROL_ACCOUNT_CODE}).`,
      );
    return account;
  }

  private async assertPeriodOpen(db: Db, workspaceId: string, when: Date) {
    const postingDay = new Date(
      Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), when.getUTCDate()),
    );
    const period = await db.manufacturingPeriod.findFirst({
      where: {
        workspaceId,
        periodStart: { lte: postingDay },
        periodEnd: { gte: postingDay },
        status: { in: ["LOCKED", "ARCHIVED"] },
      },
      select: { periodYear: true, periodMonth: true, status: true },
    });
    if (period)
      throw new BadRequestException(
        `Manufacturing period ${period.periodYear}-${String(period.periodMonth).padStart(2, "0")} is ${period.status}.`,
      );
  }

  private async openFiscalYear(db: Db, companyId: string, when: Date) {
    const fiscalYear = await db.fiscalYear.findFirst({
      where: {
        companyId,
        status: "OPEN",
        startDate: { lte: when },
        endDate: { gte: when },
      },
      orderBy: { startDate: "desc" },
      select: { id: true },
    });
    if (!fiscalYear)
      throw new BadRequestException(
        "Transaction date must be inside an open fiscal year.",
      );
    return fiscalYear;
  }

  private mapDriver(row: CostDriverWithAccount) {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      code: row.code,
      name: row.name,
      costType: row.costType,
      basis: row.basis,
      unit: row.unit,
      rate: decimalNumber(row.rate),
      clearingAccountId: row.clearingAccountId,
      clearingAccount: row.clearingAccount ?? null,
      effectiveFrom: dateOnly(row.effectiveFrom),
      effectiveTo: dateOnly(row.effectiveTo),
      isActive: row.isActive,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    };
  }

  private async driversWithAccounts(rows: ManufacturingCostDriver[]) {
    const accountIds = [...new Set(rows.map((row) => row.clearingAccountId))];
    const accounts = accountIds.length
      ? await this.prisma.account.findMany({
          where: { id: { in: accountIds } },
          select: {
            id: true,
            code: true,
            name: true,
            nature: true,
            isSystem: true,
          },
        })
      : [];
    const byId = new Map(accounts.map((account) => [account.id, account]));
    return rows.map((row) =>
      this.mapDriver({
        ...row,
        clearingAccount: byId.get(row.clearingAccountId) ?? null,
      }),
    );
  }

  async getConfiguration(
    currentUser: AuthenticatedRequestUser,
    workspaceId?: string,
  ) {
    const scope = await this.scope(currentUser, workspaceId);
    const [settings, ledgers] = await Promise.all([
      this.prisma.manufacturingSettings.findUnique({
        where: { workspaceId: scope.id },
      }),
      this.prisma.account.findMany({
        where: {
          companyId: scope.companyId,
          status: "ACTIVE",
          level: "LEDGER",
          isControlAccount: false,
        },
        select: {
          id: true,
          code: true,
          name: true,
          nature: true,
          isSystem: true,
        },
        orderBy: [{ code: "asc" }, { name: "asc" }],
      }),
    ]);
    return {
      workspaceId: scope.id,
      currency: settings?.currency ?? "BDT",
      wipInventoryAccountId: settings?.wipInventoryAccountId ?? null,
      finishedGoodsInventoryAccountId:
        settings?.finishedGoodsInventoryAccountId ?? null,
      manufacturingVarianceAccountId:
        settings?.manufacturingVarianceAccountId ?? null,
      ledgers,
      accountSafety:
        "Existing active ledger IDs only; this workflow never creates or mutates Chart of Accounts rows.",
    };
  }

  async listDrivers(currentUser: AuthenticatedRequestUser, query: Query) {
    const scope = await this.scope(currentUser, query.workspaceId);
    const search = text(query.search);
    const costType = queryEnum(
      query.costType,
      Object.values(ManufacturingCostType),
      "costType",
    );
    const rows = await this.prisma.manufacturingCostDriver.findMany({
      where: {
        workspaceId: scope.id,
        ...(query.active === "true"
          ? { isActive: true }
          : query.active === "false"
            ? { isActive: false }
            : {}),
        ...(costType ? { costType } : {}),
        ...(search
          ? {
              OR: [
                { code: { contains: search, mode: "insensitive" } },
                { name: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: [{ costType: "asc" }, { code: "asc" }],
    });
    return this.driversWithAccounts(rows);
  }

  async createDriver(
    currentUser: AuthenticatedRequestUser,
    dto: CreateManufacturingCostDriverDto,
  ) {
    await this.requirePermission(currentUser, "manufacturing.configure");
    const scope = await this.scope(currentUser, dto.workspaceId);
    try {
      assertPostableCostType(dto.costType);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    await this.activeLedger(
      this.prisma,
      scope.companyId,
      dto.clearingAccountId,
      "Clearing account",
    );
    const effectiveFrom = dto.effectiveFrom
      ? asDate(dto.effectiveFrom, "effectiveFrom")
      : null;
    const effectiveTo = dto.effectiveTo
      ? asDate(dto.effectiveTo, "effectiveTo")
      : null;
    if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom)
      throw new BadRequestException(
        "effectiveTo cannot precede effectiveFrom.",
      );
    try {
      const row = await this.prisma.manufacturingCostDriver.create({
        data: {
          tenantId: scope.tenantId,
          companyId: scope.companyId,
          workspaceId: scope.id,
          code: normalizeCode(dto.code),
          name: dto.name.trim(),
          costType: dto.costType,
          basis: dto.basis,
          unit: text(dto.unit),
          rate: decimal(dto.rate).toDecimalPlaces(
            8,
            Prisma.Decimal.ROUND_HALF_UP,
          ),
          clearingAccountId: dto.clearingAccountId,
          effectiveFrom,
          effectiveTo,
          isActive: dto.isActive ?? true,
          createdByUserId: currentUser.id,
        },
      });
      return (await this.driversWithAccounts([row]))[0];
    } catch (error) {
      if (isUniqueError(error))
        throw new ConflictException(
          "A manufacturing cost driver with this code already exists.",
        );
      throw error;
    }
  }

  async updateDriver(
    currentUser: AuthenticatedRequestUser,
    driverId: string,
    dto: UpdateManufacturingCostDriverDto,
  ) {
    await this.requirePermission(currentUser, "manufacturing.configure");
    const scope = await this.scope(currentUser, dto.workspaceId);
    const existing = await this.prisma.manufacturingCostDriver.findFirst({
      where: { id: driverId, workspaceId: scope.id },
    });
    if (!existing)
      throw new NotFoundException("Manufacturing cost driver not found.");
    const economicChange =
      dto.costType !== undefined ||
      dto.basis !== undefined ||
      dto.rate !== undefined ||
      dto.clearingAccountId !== undefined;
    if (economicChange) {
      const used = await this.prisma.manufacturingActualCostPosting.count({
        where: { costDriverId: driverId },
      });
      if (used)
        throw new BadRequestException(
          "A used cost driver's type, basis, rate or ledger cannot be rewritten. Retire it and create a new effective driver.",
        );
    }
    if (dto.costType) {
      try {
        assertPostableCostType(dto.costType);
      } catch (error) {
        throw new BadRequestException((error as Error).message);
      }
    }
    if (dto.clearingAccountId)
      await this.activeLedger(
        this.prisma,
        scope.companyId,
        dto.clearingAccountId,
        "Clearing account",
      );
    const effectiveFrom =
      dto.effectiveFrom === undefined
        ? existing.effectiveFrom
        : dto.effectiveFrom
          ? asDate(dto.effectiveFrom, "effectiveFrom")
          : null;
    const effectiveTo =
      dto.effectiveTo === undefined
        ? existing.effectiveTo
        : dto.effectiveTo
          ? asDate(dto.effectiveTo, "effectiveTo")
          : null;
    if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom)
      throw new BadRequestException(
        "effectiveTo cannot precede effectiveFrom.",
      );
    try {
      const row = await this.prisma.manufacturingCostDriver.update({
        where: { id: driverId },
        data: {
          ...(dto.code !== undefined ? { code: normalizeCode(dto.code) } : {}),
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.costType !== undefined ? { costType: dto.costType } : {}),
          ...(dto.basis !== undefined ? { basis: dto.basis } : {}),
          ...(dto.unit !== undefined ? { unit: text(dto.unit) } : {}),
          ...(dto.rate !== undefined
            ? {
                rate: decimal(dto.rate).toDecimalPlaces(
                  8,
                  Prisma.Decimal.ROUND_HALF_UP,
                ),
              }
            : {}),
          ...(dto.clearingAccountId !== undefined
            ? { clearingAccountId: dto.clearingAccountId }
            : {}),
          effectiveFrom,
          effectiveTo,
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });
      return (await this.driversWithAccounts([row]))[0];
    } catch (error) {
      if (isUniqueError(error))
        throw new ConflictException(
          "A manufacturing cost driver with this code already exists.",
        );
      throw error;
    }
  }

  private async mapStandardVersions(rows: ManufacturingStandardCostVersion[]) {
    const versionIds = rows.map((row) => row.id);
    const itemIds = [...new Set(rows.map((row) => row.inventoryItemId))];
    const [lines, items] = await Promise.all([
      versionIds.length
        ? this.prisma.manufacturingStandardCostLine.findMany({
            where: { versionId: { in: versionIds } },
            orderBy: [{ versionId: "asc" }, { sequence: "asc" }],
          })
        : [],
      itemIds.length
        ? this.prisma.inventoryItem.findMany({
            where: { id: { in: itemIds } },
            select: { id: true, itemCode: true, itemName: true, unit: true },
          })
        : [],
    ]);
    const itemById = new Map(items.map((item) => [item.id, item]));
    return rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspaceId,
      inventoryItemId: row.inventoryItemId,
      inventoryItem: itemById.get(row.inventoryItemId) ?? null,
      versionNumber: row.versionNumber,
      status: row.status,
      currency: row.currency,
      totalUnitCost: decimalNumber(row.totalUnitCost),
      effectiveFrom: dateOnly(row.effectiveFrom),
      effectiveTo: dateOnly(row.effectiveTo),
      notes: row.notes,
      approvedAt: iso(row.approvedAt),
      createdAt: iso(row.createdAt),
      lines: lines
        .filter((line) => line.versionId === row.id)
        .map((line) => ({
          id: line.id,
          sequence: line.sequence,
          costType: line.costType,
          description: line.description,
          quantity: decimalNumber(line.quantity),
          rate: decimalNumber(line.rate),
          amount: decimalNumber(line.amount),
          costDriverId: line.costDriverId,
          clearingAccountId: line.clearingAccountId,
        })),
    }));
  }

  async listStandardCosts(currentUser: AuthenticatedRequestUser, query: Query) {
    const scope = await this.scope(currentUser, query.workspaceId);
    const status = queryEnum(
      query.status,
      Object.values(ManufacturingStandardCostStatus),
      "status",
    );
    const rows = await this.prisma.manufacturingStandardCostVersion.findMany({
      where: {
        workspaceId: scope.id,
        ...(query.inventoryItemId
          ? { inventoryItemId: query.inventoryItemId }
          : {}),
        ...(status ? { status } : {}),
      },
      orderBy: [{ inventoryItemId: "asc" }, { versionNumber: "desc" }],
    });
    return this.mapStandardVersions(rows);
  }

  async createStandardCost(
    currentUser: AuthenticatedRequestUser,
    dto: CreateManufacturingStandardCostDto,
  ) {
    await this.requirePermission(currentUser, "manufacturing.cost.post");
    const scope = await this.scope(currentUser, dto.workspaceId);
    const item = await this.prisma.inventoryItem.findFirst({
      where: {
        id: dto.inventoryItemId,
        workspaceId: scope.id,
        status: "ACTIVE",
      },
    });
    if (!item)
      throw new BadRequestException(
        "Standard cost requires an existing active inventory item in this workspace.",
      );
    const sequences = new Set(dto.lines.map((line) => line.sequence));
    if (sequences.size !== dto.lines.length)
      throw new BadRequestException(
        "Standard-cost line sequences must be unique.",
      );
    const driverIds = [
      ...new Set(
        dto.lines
          .map((line) => line.costDriverId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const drivers = driverIds.length
      ? await this.prisma.manufacturingCostDriver.findMany({
          where: { id: { in: driverIds }, workspaceId: scope.id },
        })
      : [];
    if (drivers.length !== driverIds.length)
      throw new BadRequestException(
        "Every standard-cost driver must belong to this workspace.",
      );
    const driverById = new Map(drivers.map((driver) => [driver.id, driver]));
    const accountIds = [
      ...new Set(
        dto.lines
          .flatMap((line) => [
            line.clearingAccountId,
            line.costDriverId
              ? driverById.get(line.costDriverId)?.clearingAccountId
              : null,
          ])
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    for (const accountId of accountIds)
      await this.activeLedger(
        this.prisma,
        scope.companyId,
        accountId,
        "Standard-cost clearing account",
      );
    const normalizedLines = dto.lines.map((line) => {
      const quantity = decimal(line.quantity ?? 1).toDecimalPlaces(
        6,
        Prisma.Decimal.ROUND_HALF_UP,
      );
      const rate = decimal(line.rate ?? 0).toDecimalPlaces(
        8,
        Prisma.Decimal.ROUND_HALF_UP,
      );
      const amount = decimal(line.amount ?? quantity.mul(rate)).toDecimalPlaces(
        6,
        Prisma.Decimal.ROUND_HALF_UP,
      );
      if (
        quantity.lessThanOrEqualTo(0) ||
        rate.lessThan(0) ||
        amount.lessThan(0)
      )
        throw new BadRequestException(
          "Standard-cost quantity must be positive and rate/amount cannot be negative.",
        );
      const driver = line.costDriverId
        ? driverById.get(line.costDriverId)
        : null;
      if (driver && driver.costType !== line.costType)
        throw new BadRequestException(
          `Driver ${driver.code} does not match line cost type ${line.costType}.`,
        );
      return {
        ...line,
        quantity,
        rate,
        amount,
        clearingAccountId:
          line.clearingAccountId ?? driver?.clearingAccountId ?? null,
      };
    });
    const totalUnitCost = normalizedLines
      .reduce((sum, line) => sum.add(line.amount), decimal(0))
      .toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
    if (totalUnitCost.lessThanOrEqualTo(0))
      throw new BadRequestException(
        "Standard unit cost must be greater than zero.",
      );
    const effectiveFrom = dto.effectiveFrom
      ? asDate(dto.effectiveFrom, "effectiveFrom")
      : null;
    const effectiveTo = dto.effectiveTo
      ? asDate(dto.effectiveTo, "effectiveTo")
      : null;
    if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom)
      throw new BadRequestException(
        "effectiveTo cannot precede effectiveFrom.",
      );
    const row = await this.prisma.$transaction(
      async (tx) => {
        const latest = await tx.manufacturingStandardCostVersion.findFirst({
          where: {
            workspaceId: scope.id,
            inventoryItemId: dto.inventoryItemId,
          },
          orderBy: { versionNumber: "desc" },
          select: { versionNumber: true },
        });
        const version = await tx.manufacturingStandardCostVersion.create({
          data: {
            tenantId: scope.tenantId,
            companyId: scope.companyId,
            workspaceId: scope.id,
            inventoryItemId: dto.inventoryItemId,
            versionNumber: (latest?.versionNumber ?? 0) + 1,
            currency: text(dto.currency)?.toUpperCase() ?? "BDT",
            totalUnitCost,
            effectiveFrom,
            effectiveTo,
            notes: text(dto.notes),
            createdByUserId: currentUser.id,
          },
        });
        await tx.manufacturingStandardCostLine.createMany({
          data: normalizedLines.map((line) => ({
            versionId: version.id,
            sequence: line.sequence,
            costType: line.costType,
            description: line.description.trim(),
            quantity: line.quantity,
            rate: line.rate,
            amount: line.amount,
            costDriverId: line.costDriverId ?? null,
            clearingAccountId: line.clearingAccountId,
          })),
        });
        return version;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return (await this.mapStandardVersions([row]))[0];
  }

  async approveStandardCost(
    currentUser: AuthenticatedRequestUser,
    versionId: string,
    dto: ApproveManufacturingStandardCostDto,
  ) {
    await this.requirePermission(currentUser, "manufacturing.cost.post");
    const scope = await this.scope(currentUser, dto.workspaceId);
    const when = asDate(dto.transactionDate, "transactionDate");
    const row = await this.prisma.$transaction(
      async (tx) => {
        await this.assertPeriodOpen(tx, scope.id, when);
        const existingAudit = await tx.manufacturingWorkflowReview.findUnique({
          where: {
            workspaceId_idempotencyKey: {
              workspaceId: scope.id,
              idempotencyKey: dto.idempotencyKey,
            },
          },
        });
        if (existingAudit) {
          if (
            existingAudit.entityId !== versionId ||
            existingAudit.workflowCode !== "STANDARD_COST_APPROVE"
          )
            throw new ConflictException(
              "Idempotency key is already used by a different manufacturing action.",
            );
          const existing = await tx.manufacturingStandardCostVersion.findUnique(
            { where: { id: versionId } },
          );
          if (!existing)
            throw new NotFoundException("Standard cost version not found.");
          return existing;
        }
        const version = await tx.manufacturingStandardCostVersion.findFirst({
          where: { id: versionId, workspaceId: scope.id },
        });
        if (!version)
          throw new NotFoundException("Standard cost version not found.");
        if (version.status !== "DRAFT")
          throw new BadRequestException(
            "Only a draft standard-cost version can be approved.",
          );
        const lineCount = await tx.manufacturingStandardCostLine.count({
          where: { versionId },
        });
        if (!lineCount || decimal(version.totalUnitCost).lessThanOrEqualTo(0))
          throw new BadRequestException(
            "A positive standard-cost detail is required before approval.",
          );
        await tx.manufacturingStandardCostVersion.updateMany({
          where: {
            workspaceId: scope.id,
            inventoryItemId: version.inventoryItemId,
            status: "APPROVED",
            id: { not: versionId },
          },
          data: { status: "RETIRED", retiredAt: when },
        });
        const approved = await tx.manufacturingStandardCostVersion.update({
          where: { id: versionId },
          data: {
            status: "APPROVED",
            approvedByUserId: currentUser.id,
            approvedAt: when,
            ...(text(dto.note) ? { notes: text(dto.note) } : {}),
          },
        });
        await tx.manufacturingWorkflowReview.create({
          data: {
            tenantId: scope.tenantId,
            companyId: scope.companyId,
            workspaceId: scope.id,
            workflowGroup: "COSTING_ACCOUNTS",
            workflowCode: "STANDARD_COST_APPROVE",
            entityType: "MANUFACTURING_STANDARD_COST",
            entityId: versionId,
            transactionDate: when,
            idempotencyKey: dto.idempotencyKey,
            title: `Approve standard cost v${version.versionNumber}`,
            outcome: "EXECUTED",
            status: "APPROVED",
            note: text(dto.note),
            approvedByUserId: currentUser.id,
            approvedAt: when,
            createdByUserId: currentUser.id,
          },
        });
        return approved;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return (await this.mapStandardVersions([row]))[0];
  }

  private async mapActualPostings(rows: ManufacturingActualCostPosting[]) {
    const driverIds = [...new Set(rows.map((row) => row.costDriverId))];
    const drivers = driverIds.length
      ? await this.prisma.manufacturingCostDriver.findMany({
          where: { id: { in: driverIds } },
          select: { id: true, code: true, name: true },
        })
      : [];
    const byId = new Map(drivers.map((driver) => [driver.id, driver]));
    return rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspaceId,
      orderId: row.orderId,
      costDriverId: row.costDriverId,
      driver: byId.get(row.costDriverId) ?? null,
      costType: row.costType,
      driverBasis: row.driverBasis,
      description: row.description,
      basisQuantity: decimalNumber(row.basisQuantity),
      rate: decimalNumber(row.rate),
      amount: decimalNumber(row.amount),
      wipAccountId: row.wipAccountId,
      clearingAccountId: row.clearingAccountId,
      voucherEntryId: row.voucherEntryId,
      finalizedSnapshotId: row.finalizedSnapshotId,
      transactionDate: iso(row.transactionDate),
      referenceNo: row.referenceNo,
      note: row.note,
      idempotencyKey: row.idempotencyKey,
      createdAt: iso(row.createdAt),
    }));
  }

  async getOrderCosting(
    currentUser: AuthenticatedRequestUser,
    orderId: string,
    workspaceId?: string,
  ) {
    const scope = await this.scope(currentUser, workspaceId);
    const order = await this.prisma.manufacturingOrder.findFirst({
      where: { id: orderId, workspaceId: scope.id },
      include: {
        finishedProduct: true,
        costSnapshots: {
          orderBy: { versionNumber: "asc" },
          include: { lines: true, voucherEntry: { include: { lines: true } } },
        },
      },
    });
    if (!order) throw new NotFoundException("Manufacturing order not found.");
    const postings = await this.prisma.manufacturingActualCostPosting.findMany({
      where: { workspaceId: scope.id, orderId },
      orderBy: [{ transactionDate: "asc" }, { createdAt: "asc" }],
    });
    const standards =
      await this.prisma.manufacturingStandardCostVersion.findMany({
        where: {
          workspaceId: scope.id,
          inventoryItemId: order.finishedProductId,
        },
        orderBy: { versionNumber: "desc" },
      });
    return {
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        plannedQuantity: decimalNumber(order.plannedQuantity),
        completedQuantity: decimalNumber(order.completedQuantity),
        unit: order.unit,
        finishedProduct: {
          id: order.finishedProduct.id,
          code: order.finishedProduct.itemCode,
          name: order.finishedProduct.itemName,
        },
      },
      actualPostings: await this.mapActualPostings(postings),
      standardCosts: await this.mapStandardVersions(standards),
      snapshots: order.costSnapshots.map((snapshot) => ({
        id: snapshot.id,
        versionNumber: snapshot.versionNumber,
        status: snapshot.status,
        currency: snapshot.currency,
        materialCost: decimalNumber(snapshot.materialCost),
        labourCost: decimalNumber(snapshot.labourCost),
        machineCost: decimalNumber(snapshot.machineCost),
        overheadCost: decimalNumber(snapshot.overheadCost),
        packagingCost: decimalNumber(snapshot.packagingCost),
        subcontractCost: decimalNumber(snapshot.subcontractCost),
        otherCost: decimalNumber(snapshot.otherCost),
        scrapRecovery: decimalNumber(snapshot.scrapRecovery),
        varianceAmount: decimalNumber(snapshot.varianceAmount),
        totalCost: decimalNumber(snapshot.totalCost),
        completedQuantity: decimalNumber(snapshot.completedQuantity),
        unitCost: decimalNumber(snapshot.unitCost),
        voucherEntryId: snapshot.voucherEntryId,
        finalizedAt: iso(snapshot.finalizedAt),
      })),
    };
  }

  async postActualCost(
    currentUser: AuthenticatedRequestUser,
    orderId: string,
    dto: PostManufacturingActualCostDto,
  ) {
    await this.requirePermission(currentUser, "manufacturing.cost.post");
    const scope = await this.scope(currentUser, dto.workspaceId);
    const when = asDate(dto.transactionDate, "transactionDate");
    const posting = await this.prisma.$transaction(
      async (tx) => {
        await this.assertPeriodOpen(tx, scope.id, when);
        const duplicate = await tx.manufacturingActualCostPosting.findUnique({
          where: {
            workspaceId_idempotencyKey: {
              workspaceId: scope.id,
              idempotencyKey: dto.idempotencyKey,
            },
          },
        });
        if (duplicate) {
          if (
            duplicate.orderId !== orderId ||
            duplicate.costDriverId !== dto.costDriverId
          ) {
            throw new ConflictException(
              "Idempotency key is already used by a different actual-cost posting.",
            );
          }
          return duplicate;
        }
        const [order, driver, settings] = await Promise.all([
          tx.manufacturingOrder.findFirst({
            where: { id: orderId, workspaceId: scope.id },
            include: { costSnapshots: { orderBy: { versionNumber: "asc" } } },
          }),
          tx.manufacturingCostDriver.findFirst({
            where: { id: dto.costDriverId, workspaceId: scope.id },
          }),
          tx.manufacturingSettings.findUnique({
            where: { workspaceId: scope.id },
          }),
        ]);
        if (!order)
          throw new NotFoundException("Manufacturing order not found.");
        if (["DRAFT", "CANCELLED", "CLOSED"].includes(order.status)) {
          throw new BadRequestException(
            "Actual cost can be posted only to an active, approved production order before close.",
          );
        }
        if (order.costSnapshots.at(-1)?.status === "FINALIZED") {
          throw new BadRequestException(
            "Actual cost is finalized; additional postings require a controlled new-cost cycle, which is not open for this order.",
          );
        }
        if (!driver || !driver.isActive)
          throw new BadRequestException(
            "Select an active manufacturing cost driver from this workspace.",
          );
        if (driver.effectiveFrom && when < driver.effectiveFrom)
          throw new BadRequestException(
            "The cost driver is not effective on the transaction date.",
          );
        if (driver.effectiveTo && when > driver.effectiveTo)
          throw new BadRequestException(
            "The cost driver expired before the transaction date.",
          );
        try {
          assertPostableCostType(driver.costType);
        } catch (error) {
          throw new BadRequestException((error as Error).message);
        }
        if (!settings?.wipInventoryAccountId)
          throw new BadRequestException(
            "Configure the WIP inventory ledger before posting actual manufacturing costs.",
          );
        const [wipAccount, clearingAccount, fiscalYear] = await Promise.all([
          this.activeLedger(
            tx,
            scope.companyId,
            settings.wipInventoryAccountId,
            "WIP inventory account",
            "ASSET",
          ),
          this.activeLedger(
            tx,
            scope.companyId,
            driver.clearingAccountId,
            "Cost-driver clearing account",
          ),
          this.openFiscalYear(tx, scope.companyId, when),
        ]);
        if (wipAccount.id === clearingAccount.id)
          throw new BadRequestException(
            "WIP and clearing accounts must be different LEDGER accounts.",
          );
        const unfinalized = await tx.manufacturingActualCostPosting.findMany({
          where: { orderId, finalizedSnapshotId: null },
        });
        const latestSnapshot = order.costSnapshots.at(-1);
        const materialCost = decimal(latestSnapshot?.materialCost).add(
          latestSnapshot?.packagingCost ?? 0,
        );
        const labourCost = unfinalized
          .filter((row) => row.costType === "LABOUR")
          .reduce((sum, row) => sum.add(row.amount), decimal(0));
        const machineCost = unfinalized
          .filter((row) => row.costType === "MACHINE")
          .reduce((sum, row) => sum.add(row.amount), decimal(0));
        const needsExplicitBasis = ["LABOUR_HOURS", "MACHINE_HOURS"].includes(
          driver.basis,
        );
        if (needsExplicitBasis && dto.basisQuantity === undefined)
          throw new BadRequestException(
            `${driver.basis} requires basisQuantity.`,
          );
        const defaultOutput = decimal(order.completedQuantity).greaterThan(0)
          ? order.completedQuantity
          : order.plannedQuantity;
        let calculated;
        try {
          calculated = calculateCostDriverAmount({
            basis: driver.basis,
            rate: driver.rate,
            basisQuantity:
              dto.basisQuantity ??
              (driver.basis === "OUTPUT_QUANTITY" ? defaultOutput : 1),
            materialCost,
            postedLabourCost: labourCost,
            postedMachineCost: machineCost,
          });
        } catch (error) {
          throw new BadRequestException((error as Error).message);
        }
        const amount = calculated.postingAmount;
        const voucher = await tx.voucherEntry.create({
          data: {
            tenantId: scope.tenantId,
            companyId: scope.companyId,
            workspaceId: scope.id,
            createdByUserId: currentUser.id,
            voucherType: "JOURNAL",
            documentKind: "MANUFACTURING_ACTUAL_COST",
            voucherNumber: reference("JV-MAC", dto.idempotencyKey),
            voucherDate: when,
            partyName: "Manufacturing",
            reference: text(dto.referenceNo) ?? order.orderNumber,
            narration:
              text(dto.note) ??
              `${driver.name} actual cost for ${order.orderNumber}`,
            status: "POSTED",
            totalAmount: amount,
            debit: amount,
            credit: amount,
            currency: settings.currency,
            fiscalYearId: fiscalYear.id,
            sourceType: "MANUFACTURING_ACTUAL_COST",
            sourceId: order.id,
            approvedByUserId: currentUser.id,
            approvedAt: when,
            postedAt: when,
            idempotencyKey: `MFG:COST:${dto.idempotencyKey}:GL`,
            lines: {
              create: [
                {
                  accountId: wipAccount.id,
                  ledger: wipAccount.name,
                  description: `${driver.name} absorbed into WIP`,
                  debit: amount,
                  credit: 0,
                },
                {
                  accountId: clearingAccount.id,
                  ledger: clearingAccount.name,
                  description: `${driver.name} clearing`,
                  debit: 0,
                  credit: amount,
                },
              ],
            },
          },
        });
        const created = await tx.manufacturingActualCostPosting.create({
          data: {
            tenantId: scope.tenantId,
            companyId: scope.companyId,
            workspaceId: scope.id,
            orderId,
            costDriverId: driver.id,
            costType: driver.costType,
            driverBasis: driver.basis,
            description: text(dto.description) ?? driver.name,
            basisQuantity: decimal(
              dto.basisQuantity ??
                (driver.basis === "OUTPUT_QUANTITY" ? defaultOutput : 1),
            ).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP),
            rate: driver.rate,
            amount,
            wipAccountId: wipAccount.id,
            clearingAccountId: clearingAccount.id,
            voucherEntryId: voucher.id,
            transactionDate: when,
            referenceNo: text(dto.referenceNo),
            note: text(dto.note),
            idempotencyKey: dto.idempotencyKey,
            createdByUserId: currentUser.id,
          },
        });
        await tx.manufacturingWorkflowReview.create({
          data: {
            tenantId: scope.tenantId,
            companyId: scope.companyId,
            workspaceId: scope.id,
            orderId,
            workflowGroup: "COSTING_ACCOUNTS",
            workflowCode: "ACTUAL_COST_POST",
            entityType: "MANUFACTURING_ACTUAL_COST",
            entityId: created.id,
            transactionDate: when,
            idempotencyKey: dto.idempotencyKey,
            title: `${driver.name} actual cost for ${order.orderNumber}`,
            outcome: "EXECUTED",
            status: "APPROVED",
            note: text(dto.note),
            evidence: {
              costType: driver.costType,
              basis: driver.basis,
              basisQuantity: created.basisQuantity.toString(),
              rate: created.rate.toString(),
              amount: amount.toFixed(2),
              voucherEntryId: voucher.id,
            },
            approvedByUserId: currentUser.id,
            approvedAt: when,
            createdByUserId: currentUser.id,
          },
        });
        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return (await this.mapActualPostings([posting]))[0];
  }

  async finalizeActualCost(
    currentUser: AuthenticatedRequestUser,
    orderId: string,
    dto: FinalizeManufacturingActualCostDto,
  ) {
    await this.requirePermission(currentUser, "manufacturing.cost.post");
    const scope = await this.scope(currentUser, dto.workspaceId);
    const when = asDate(dto.transactionDate, "transactionDate");
    const snapshotId = await this.prisma.$transaction(
      async (tx) => {
        await this.assertPeriodOpen(tx, scope.id, when);
        const existingAudit = await tx.manufacturingWorkflowReview.findUnique({
          where: {
            workspaceId_idempotencyKey: {
              workspaceId: scope.id,
              idempotencyKey: dto.idempotencyKey,
            },
          },
        });
        if (existingAudit) {
          if (
            existingAudit.workflowCode !== "ACTUAL_COST_FINALIZE" ||
            existingAudit.entityType !== "MANUFACTURING_COST_SNAPSHOT" ||
            !existingAudit.entityId
          ) {
            throw new ConflictException(
              "Idempotency key is already used by a different manufacturing action.",
            );
          }
          return existingAudit.entityId;
        }
        const [order, settings, postings] = await Promise.all([
          tx.manufacturingOrder.findFirst({
            where: { id: orderId, workspaceId: scope.id },
            include: {
              finishedProduct: true,
              costSnapshots: {
                orderBy: { versionNumber: "asc" },
                include: { lines: true },
              },
              transactions: {
                where: { status: "POSTED" },
                include: {
                  lines: {
                    include: {
                      stockMovements: { where: { voidedAt: null } },
                      destinationInventoryLot: true,
                    },
                  },
                },
              },
            },
          }),
          tx.manufacturingSettings.findUnique({
            where: { workspaceId: scope.id },
          }),
          tx.manufacturingActualCostPosting.findMany({
            where: {
              workspaceId: scope.id,
              orderId,
              finalizedSnapshotId: null,
            },
            orderBy: [{ transactionDate: "asc" }, { createdAt: "asc" }],
          }),
        ]);
        if (!order)
          throw new NotFoundException("Manufacturing order not found.");
        if (["DRAFT", "CANCELLED", "CLOSED"].includes(order.status))
          throw new BadRequestException(
            "Actual costing can be finalized only before order close.",
          );
        const latestSnapshot = order.costSnapshots.at(-1);
        if (!latestSnapshot || latestSnapshot.status !== "PROVISIONAL")
          throw new BadRequestException(
            "A latest PROVISIONAL receipt-cost snapshot is required before actual-cost finalization.",
          );
        if (!postings.length)
          throw new BadRequestException(
            "Post at least one labour, machine, overhead, subcontract or other actual cost before finalization.",
          );
        if (
          !settings?.wipInventoryAccountId ||
          !settings.finishedGoodsInventoryAccountId
        ) {
          throw new BadRequestException(
            "Configure WIP and finished-goods inventory ledgers before cost finalization.",
          );
        }
        const [wipAccount, fgAccount, fiscalYear] = await Promise.all([
          this.activeLedger(
            tx,
            scope.companyId,
            settings.wipInventoryAccountId,
            "WIP inventory account",
            "ASSET",
          ),
          this.protectedInventoryControlLedger(
            tx,
            scope.companyId,
            settings.finishedGoodsInventoryAccountId,
            "Finished-goods inventory account",
          ),
          this.openFiscalYear(tx, scope.companyId, when),
        ]);
        if (wipAccount.id === fgAccount.id)
          throw new BadRequestException(
            "WIP and finished-goods accounts must be different LEDGER accounts.",
          );

        const receiptRows = order.transactions
          .filter(
            (transaction) =>
              transaction.transactionType === "PRODUCTION_RECEIPT",
          )
          .flatMap((transaction) =>
            transaction.lines
              .filter(
                (line) =>
                  !line.orderMaterialId &&
                  line.inventoryItemId === order.finishedProductId,
              )
              .flatMap((line) =>
                line.stockMovements
                  .filter(
                    (movement) =>
                      movement.movementType === "IN" &&
                      movement.transactionType === "PRODUCTION_RECEIPT",
                  )
                  .map((movement) => ({
                    transaction,
                    line,
                    movement,
                    inventoryLot: line.destinationInventoryLot,
                  })),
              ),
          );
        if (!receiptRows.length)
          throw new BadRequestException(
            "No posted finished-goods receipt movement is available for actual-cost allocation.",
          );
        const completedQuantity = receiptRows.reduce(
          (sum, row) => sum.add(row.movement.quantity),
          decimal(0),
        );
        if (
          completedQuantity.lessThanOrEqualTo(0) ||
          !decimal(order.completedQuantity).equals(completedQuantity)
        ) {
          throw new BadRequestException(
            "Finished-goods receipt quantity must reconcile to the completed order quantity before cost finalization.",
          );
        }
        const earliestReceipt = receiptRows.reduce(
          (minimum, row) =>
            row.movement.transactionDate < minimum
              ? row.movement.transactionDate
              : minimum,
          receiptRows[0].movement.transactionDate,
        );
        const allowedLineIds = order.transactions.flatMap((transaction) =>
          transaction.lines.map((line) => line.id),
        );
        const downstream = await tx.stockMovement.findFirst({
          where: {
            workspaceId: scope.id,
            inventoryItemId: order.finishedProductId,
            voidedAt: null,
            transactionDate: { gte: earliestReceipt },
            OR: [
              { manufacturingTransactionLineId: null },
              { manufacturingTransactionLineId: { notIn: allowedLineIds } },
            ],
          },
          orderBy: [{ transactionDate: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            transactionType: true,
            transactionDate: true,
            referenceNo: true,
          },
        });
        if (downstream)
          throw new BadRequestException(
            `Actual cost cannot be finalized after downstream finished-goods movement ${downstream.transactionType} (${downstream.referenceNo ?? downstream.id}). Finalize before sale/transfer/another order affects moving-average cost.`,
          );
        const totalActualPaisa = postings.reduce(
          (sum, posting) => sum + toPaisa(posting.amount),
          0n,
        );
        const allocations = allocatePaisaByWeight(
          totalActualPaisa,
          receiptRows.map((row) => ({
            id: row.movement.id,
            weight: row.movement.quantity,
          })),
        );
        const allocatedByMovement = new Map(
          allocations.map((allocation) => [
            allocation.id,
            allocation.amountPaisa,
          ]),
        );
        const beforeByMovement = new Map(
          receiptRows.map((row) => [
            row.movement.id,
            {
              movementValue: decimal(row.movement.movementValue),
              unitCost: decimal(row.movement.unitCost),
            },
          ]),
        );
        for (const row of receiptRows) {
          const allocationPaisa = allocatedByMovement.get(row.movement.id)!;
          const targetValue = decimal(row.movement.movementValue).add(
            decimal(allocationPaisa.toString()).div(100),
          );
          const revisedInputUnitCost = targetValue
            .div(row.movement.quantity)
            .toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
          await tx.stockMovement.update({
            where: { id: row.movement.id },
            data: { inputUnitCost: revisedInputUnitCost },
          });
        }
        const replay = await rebuildMovingAverageCosts(tx, scope.id, [
          order.finishedProductId,
        ]);
        const replayById = new Map(
          replay.movements.map((movement) => [movement.id, movement]),
        );
        let previousReceiptValue = decimal(0);
        let revisedReceiptValue = decimal(0);
        const allocationDetails: Array<{
          row: (typeof receiptRows)[number];
          previousUnitCost: Prisma.Decimal;
          revisedUnitCost: Prisma.Decimal;
          allocatedAmount: Prisma.Decimal;
        }> = [];
        for (const row of receiptRows) {
          const revised = replayById.get(row.movement.id);
          if (!revised)
            throw new BadRequestException(
              "Moving-average replay did not return a re-costed production receipt.",
            );
          const before = beforeByMovement.get(row.movement.id)!;
          const revisedValue = decimal(revised.movementValue);
          const allocatedAmount = revisedValue
            .sub(before.movementValue)
            .toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
          previousReceiptValue = previousReceiptValue.add(before.movementValue);
          revisedReceiptValue = revisedReceiptValue.add(revisedValue);
          await tx.manufacturingTransactionLine.update({
            where: { id: row.line.id },
            data: { unitCost: revised.unitCost, totalCost: revisedValue },
          });
          if (row.inventoryLot)
            await tx.manufacturingInventoryLot.update({
              where: { id: row.inventoryLot.id },
              data: { unitCost: revised.unitCost },
            });
          allocationDetails.push({
            row,
            previousUnitCost: before.unitCost,
            revisedUnitCost: decimal(revised.unitCost),
            allocatedAmount,
          });
        }
        previousReceiptValue = previousReceiptValue.toDecimalPlaces(
          6,
          Prisma.Decimal.ROUND_HALF_UP,
        );
        revisedReceiptValue = revisedReceiptValue.toDecimalPlaces(
          6,
          Prisma.Decimal.ROUND_HALF_UP,
        );
        const inventoryIncrement = revisedReceiptValue
          .sub(previousReceiptValue)
          .toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
        const inventoryIncrementPaisa = toPaisa(inventoryIncrement);
        if (inventoryIncrementPaisa <= 0n)
          throw new BadRequestException(
            "Actual-cost allocation did not increase finished-goods inventory value.",
          );
        const roundingPaisa = inventoryIncrementPaisa - totalActualPaisa;
        if (roundingPaisa > 1n || roundingPaisa < -1n)
          throw new BadRequestException(
            "Six-decimal inventory allocation differs from the posted actual cost by more than BDT 0.01; split the receipt quantity before finalization.",
          );
        let varianceAccount: {
          id: string;
          code: string;
          name: string;
          nature: string;
          isSystem: boolean;
        } | null = null;
        if (roundingPaisa !== 0n) {
          if (!settings.manufacturingVarianceAccountId)
            throw new BadRequestException(
              "Configure a manufacturing variance ledger for the one-paisa allocation residue.",
            );
          varianceAccount = await this.activeLedger(
            tx,
            scope.companyId,
            settings.manufacturingVarianceAccountId,
            "Manufacturing variance account",
          );
          if ([wipAccount.id, fgAccount.id].includes(varianceAccount.id))
            throw new BadRequestException(
              "Manufacturing variance, WIP and finished-goods ledgers must be distinct.",
            );
        }
        const inventoryPostingAmount = roundMoneyDecimal(inventoryIncrement);
        const wipPostingAmount = decimal(totalActualPaisa.toString()).div(100);
        const residueAmount = decimal(
          (roundingPaisa < 0n ? -roundingPaisa : roundingPaisa).toString(),
        ).div(100);
        const journalLines: Array<{
          accountId: string;
          ledger: string;
          description: string;
          debit: Prisma.Decimal | number;
          credit: Prisma.Decimal | number;
        }> = [
          {
            accountId: fgAccount.id,
            ledger: fgAccount.name,
            description: `Actual manufacturing cost capitalized for ${order.orderNumber}`,
            debit: inventoryPostingAmount,
            credit: 0,
          },
          {
            accountId: wipAccount.id,
            ledger: wipAccount.name,
            description: `Actual manufacturing cost cleared from WIP for ${order.orderNumber}`,
            debit: 0,
            credit: wipPostingAmount,
          },
        ];
        if (roundingPaisa < 0n && varianceAccount)
          journalLines.push({
            accountId: varianceAccount.id,
            ledger: varianceAccount.name,
            description: "Inventory allocation rounding variance",
            debit: residueAmount,
            credit: 0,
          });
        if (roundingPaisa > 0n && varianceAccount)
          journalLines.push({
            accountId: varianceAccount.id,
            ledger: varianceAccount.name,
            description: "Inventory allocation rounding variance",
            debit: 0,
            credit: residueAmount,
          });
        const debitTotal = journalLines.reduce(
          (sum, line) => sum.add(line.debit),
          decimal(0),
        );
        const creditTotal = journalLines.reduce(
          (sum, line) => sum.add(line.credit),
          decimal(0),
        );
        if (!moneyEquals(debitTotal, creditTotal))
          throw new BadRequestException(
            "Actual-cost finalization journal is not balanced to exact paisa.",
          );
        await this.requireInventoryService().reconcileMovingAverageLedger(
          tx,
          scope.id,
          replay.movements,
          currentUser.id,
        );
        const voucher = await tx.voucherEntry.create({
          data: {
            tenantId: scope.tenantId,
            companyId: scope.companyId,
            workspaceId: scope.id,
            createdByUserId: currentUser.id,
            voucherType: "JOURNAL",
            documentKind: "MANUFACTURING_COST_FINALIZATION",
            voucherNumber: reference("JV-MCF", dto.idempotencyKey),
            voucherDate: when,
            partyName: "Manufacturing",
            reference: order.orderNumber,
            narration:
              text(dto.note) ??
              `Actual manufacturing cost finalization for ${order.orderNumber}`,
            status: "POSTED",
            totalAmount: roundMoneyDecimal(debitTotal),
            debit: roundMoneyDecimal(debitTotal),
            credit: roundMoneyDecimal(creditTotal),
            currency: settings.currency,
            fiscalYearId: fiscalYear.id,
            sourceType: "MANUFACTURING_COST_FINALIZATION",
            sourceId: order.id,
            approvedByUserId: currentUser.id,
            approvedAt: when,
            postedAt: when,
            idempotencyKey: `MFG:COST:${dto.idempotencyKey}:FINALIZE:GL`,
            lines: { create: journalLines },
          },
        });

        const component = (costType: string) =>
          postings
            .filter((posting) => posting.costType === costType)
            .reduce((sum, posting) => sum.add(posting.amount), decimal(0));
        const rawComponentTotal = decimal(latestSnapshot.materialCost)
          .add(latestSnapshot.packagingCost)
          .add(component("LABOUR"))
          .add(component("MACHINE"))
          .add(component("OVERHEAD"))
          .add(component("SUBCONTRACT"))
          .add(component("OTHER"))
          .sub(latestSnapshot.scrapRecovery);
        const allocationVariance = revisedReceiptValue
          .sub(rawComponentTotal)
          .toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
        const standardVersion = dto.standardCostVersionId
          ? await tx.manufacturingStandardCostVersion.findFirst({
              where: {
                id: dto.standardCostVersionId,
                workspaceId: scope.id,
                inventoryItemId: order.finishedProductId,
                status: "APPROVED",
              },
            })
          : await tx.manufacturingStandardCostVersion.findFirst({
              where: {
                workspaceId: scope.id,
                inventoryItemId: order.finishedProductId,
                status: "APPROVED",
                AND: [
                  {
                    OR: [
                      { effectiveFrom: null },
                      { effectiveFrom: { lte: when } },
                    ],
                  },
                  {
                    OR: [{ effectiveTo: null }, { effectiveTo: { gte: when } }],
                  },
                ],
              },
              orderBy: [{ effectiveFrom: "desc" }, { versionNumber: "desc" }],
            });
        if (dto.standardCostVersionId && !standardVersion)
          throw new BadRequestException(
            "Selected standard cost version must be approved for this finished product.",
          );
        const standardOrderCost = standardVersion
          ? decimal(standardVersion.totalUnitCost).mul(completedQuantity)
          : null;
        const calculated = calculateFinalSnapshot(
          {
            materialCost: latestSnapshot.materialCost,
            packagingCost: latestSnapshot.packagingCost,
            labourCost: component("LABOUR"),
            machineCost: component("MACHINE"),
            overheadCost: component("OVERHEAD"),
            subcontractCost: component("SUBCONTRACT"),
            otherCost: component("OTHER"),
            scrapRecovery: latestSnapshot.scrapRecovery,
            allocationVariance,
          },
          standardOrderCost,
        );
        if (!calculated.totalCost.equals(revisedReceiptValue))
          throw new BadRequestException(
            "Final cost components do not reconcile to the re-costed finished-goods receipts.",
          );
        const versionNumber = latestSnapshot.versionNumber + 1;
        const created = await tx.manufacturingCostSnapshot.create({
          data: {
            tenantId: scope.tenantId,
            companyId: scope.companyId,
            workspaceId: scope.id,
            orderId,
            versionNumber,
            status: "FINALIZED",
            currency: settings.currency,
            materialCost: calculated.materialCost,
            labourCost: calculated.labourCost,
            machineCost: calculated.machineCost,
            overheadCost: calculated.overheadCost,
            packagingCost: calculated.packagingCost,
            subcontractCost: calculated.subcontractCost,
            otherCost: calculated.otherCost,
            scrapRecovery: calculated.scrapRecovery,
            varianceAmount: calculated.varianceAmount,
            totalCost: calculated.totalCost,
            completedQuantity,
            unitCost: calculated.totalCost
              .div(completedQuantity)
              .toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP),
            voucherEntryId: voucher.id,
            createdByUserId: currentUser.id,
            finalizedByUserId: currentUser.id,
            finalizedAt: when,
            lines: {
              create: [
                ...latestSnapshot.lines
                  .filter((line) =>
                    ["MATERIAL", "PACKAGING", "SCRAP_RECOVERY"].includes(
                      line.costType,
                    ),
                  )
                  .map((line) => ({
                    costType: line.costType,
                    description: line.description,
                    inventoryItemId: line.inventoryItemId,
                    transactionLineId: line.transactionLineId,
                    accountId: line.accountId,
                    quantity: line.quantity,
                    rate: line.rate,
                    amount: line.amount,
                    metadata: line.metadata ?? undefined,
                  })),
                ...postings.map((posting) => ({
                  costType: posting.costType,
                  description: posting.description,
                  accountId: posting.clearingAccountId,
                  quantity: posting.basisQuantity,
                  rate: posting.rate,
                  amount: posting.amount,
                  metadata: {
                    source: "POSTED_ACTUAL_COST",
                    postingId: posting.id,
                    voucherEntryId: posting.voucherEntryId,
                    driverId: posting.costDriverId,
                  },
                })),
                ...(allocationVariance.isZero()
                  ? []
                  : [
                      {
                        costType: "VARIANCE" as const,
                        description:
                          "Six-decimal finished-goods allocation reconciliation",
                        amount: allocationVariance,
                        metadata: {
                          source: "INVENTORY_COST_ALLOCATION",
                          standardCostVersionId: standardVersion?.id ?? null,
                        },
                      },
                    ]),
              ],
            },
          },
        });
        await tx.manufacturingActualCostPosting.updateMany({
          where: { id: { in: postings.map((posting) => posting.id) } },
          data: { finalizedSnapshotId: created.id },
        });
        await tx.manufacturingCostAllocation.createMany({
          data: allocationDetails.map((detail) => ({
            workspaceId: scope.id,
            costSnapshotId: created.id,
            stockMovementId: detail.row.movement.id,
            inventoryLotId: detail.row.inventoryLot?.id ?? null,
            quantity: detail.row.movement.quantity,
            previousUnitCost: detail.previousUnitCost,
            revisedUnitCost: detail.revisedUnitCost,
            allocatedAmount: detail.allocatedAmount,
          })),
        });
        await tx.manufacturingWorkflowReview.create({
          data: {
            tenantId: scope.tenantId,
            companyId: scope.companyId,
            workspaceId: scope.id,
            orderId,
            workflowGroup: "COSTING_ACCOUNTS",
            workflowCode: "ACTUAL_COST_FINALIZE",
            entityType: "MANUFACTURING_COST_SNAPSHOT",
            entityId: created.id,
            transactionDate: when,
            idempotencyKey: dto.idempotencyKey,
            title: `Finalize actual manufacturing cost for ${order.orderNumber}`,
            outcome: "EXECUTED",
            status: "APPROVED",
            note: text(dto.note),
            evidence: {
              sourceSnapshotId: latestSnapshot.id,
              postingIds: postings.map((posting) => posting.id),
              standardCostVersionId: standardVersion?.id ?? null,
              previousReceiptValue: previousReceiptValue.toString(),
              revisedReceiptValue: revisedReceiptValue.toString(),
              allocationRoundingPaisa: roundingPaisa.toString(),
              voucherEntryId: voucher.id,
            },
            approvedByUserId: currentUser.id,
            approvedAt: when,
            createdByUserId: currentUser.id,
          },
        });
        return created.id;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 30_000,
      },
    );
    return this.getOrderCosting(currentUser, orderId, scope.id).then(
      (result) => ({
        snapshot:
          result.snapshots.find((snapshot) => snapshot.id === snapshotId) ??
          null,
        order: result.order,
      }),
    );
  }

  private reportRange(query: Query) {
    const from = query.from ? asDate(query.from, "from") : undefined;
    const to = query.to ? asDate(query.to, "to") : undefined;
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(query.to!))
      to.setUTCHours(23, 59, 59, 999);
    if (from && to && to < from)
      throw new BadRequestException("Report date 'to' cannot precede 'from'.");
    return { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  }

  private reportLimit(query: Query) {
    const requested = Number(query.limit ?? 1000);
    return Number.isInteger(requested) && requested > 0
      ? Math.min(requested, 5000)
      : 1000;
  }

  private envelope(
    report: ReportName,
    query: Query,
    columns: Array<{ key: string; label: string; type?: string }>,
    rows: Array<Record<string, unknown>>,
    totals: Record<string, number> = {},
    truncated = false,
  ) {
    return {
      report,
      columns,
      rows,
      totals,
      filters: {
        from: query.from ?? null,
        to: query.to ?? null,
        orderId: query.orderId ?? null,
        inventoryItemId: query.inventoryItemId ?? null,
        warehouseId: query.warehouseId ?? null,
        status: query.status ?? null,
        lotNumber: query.lotNumber ?? null,
        serialNumber: query.serialNumber ?? null,
        search: query.search ?? null,
      },
      generatedAt: new Date().toISOString(),
      exportReady: true,
      truncated,
      rowCount: rows.length,
    };
  }

  private normalizeReportName(value: string): ReportName {
    const aliases: Record<string, ReportName> = {
      "production-reports": "production-orders",
      "material-reports": "material-movements",
      "wip-reports": "wip",
      "batch-and-lot-reports": "finished-receipts",
      "costing-reports": "actual-costs",
      "quality-reports": "quality",
      "compliance-reports": "quality",
      "packaging-reports": "packaging",
      "traceability-reports": "traceability",
      "executive-analytics": "production-orders",
      "estimated-production-cost": "cost-variance",
      "standard-cost": "cost-variance",
      "actual-batch-cost": "actual-costs",
      "material-consumption-cost": "material-movements",
      "labour-cost": "actual-costs",
      "machine-cost": "actual-costs",
      "factory-overhead": "actual-costs",
      "packaging-cost": "packaging",
      "subcontract-cost": "actual-costs",
      "wip-valuation": "wip",
      "production-variance": "cost-variance",
      "yield-loss-cost": "cost-variance",
      "scrap-and-rejection-cost": "cost-variance",
      "cost-of-goods-manufactured": "cost-variance",
      "accounting-journal-preview": "manufacturing-journals",
      "posted-manufacturing-journals": "manufacturing-journals",
    };
    const normalized = aliases[value] ?? value;
    if (!(REPORT_NAMES as readonly string[]).includes(normalized)) {
      throw new BadRequestException(`Unknown manufacturing report '${value}'.`);
    }
    return normalized as ReportName;
  }

  async getReport(
    currentUser: AuthenticatedRequestUser,
    requestedReport: string,
    query: Query,
  ) {
    await this.requirePermission(currentUser, "manufacturing.reports.view");
    const scope = await this.scope(currentUser, query.workspaceId);
    const report = this.normalizeReportName(requestedReport);
    switch (report) {
      case "production-orders":
        return this.productionOrderReport(scope, query);
      case "material-movements":
        return this.materialMovementReport(scope, query);
      case "wip":
        return this.wipReport(scope, query);
      case "finished-receipts":
        return this.finishedReceiptReport(scope, query);
      case "actual-costs":
        return this.actualCostReport(scope, query);
      case "cost-variance":
        return this.costVarianceReport(scope, query);
      case "quality":
        return this.qualityReport(scope, query);
      case "packaging":
        return this.packagingReport(scope, query);
      case "traceability":
        return this.traceabilityReport(scope, query);
      case "manufacturing-journals":
        return this.manufacturingJournalReport(scope, query);
    }
  }

  private async productionOrderReport(scope: Scope, query: Query) {
    const limit = this.reportLimit(query);
    const range = this.reportRange(query);
    const search = text(query.search);
    const status = queryEnum(
      query.status,
      Object.values(ManufacturingOrderStatus),
      "status",
    );
    const combinedFilters: Prisma.ManufacturingOrderWhereInput[] = [];
    if (query.warehouseId) {
      combinedFilters.push({
        OR: [
          { issueWarehouseId: query.warehouseId },
          { receiptWarehouseId: query.warehouseId },
        ],
      });
    }
    if (search) {
      combinedFilters.push({
        OR: [
          { orderNumber: { contains: search, mode: "insensitive" } },
          {
            finishedProduct: {
              itemName: { contains: search, mode: "insensitive" },
            },
          },
          {
            finishedProduct: {
              itemCode: { contains: search, mode: "insensitive" },
            },
          },
        ],
      });
    }
    const rows = await this.prisma.manufacturingOrder.findMany({
      where: {
        workspaceId: scope.id,
        ...(Object.keys(range).length ? { createdAt: range } : {}),
        ...(query.orderId ? { id: query.orderId } : {}),
        ...(status ? { status } : {}),
        ...(query.inventoryItemId
          ? { finishedProductId: query.inventoryItemId }
          : {}),
        ...(combinedFilters.length ? { AND: combinedFilters } : {}),
      },
      include: {
        finishedProduct: true,
        bomVersion: { include: { bom: true } },
        issueWarehouse: true,
        receiptWarehouse: true,
      },
      orderBy: [{ createdAt: "desc" }, { orderNumber: "desc" }],
      take: limit + 1,
    });
    const truncated = rows.length > limit;
    const result = rows.slice(0, limit).map((row) => ({
      orderId: row.id,
      orderNumber: row.orderNumber,
      type: row.type,
      status: row.status,
      productCode: row.finishedProduct.itemCode,
      productName: row.finishedProduct.itemName,
      bom: `${row.bomVersion.bom.code} v${row.bomVersion.versionNumber}`,
      plannedQuantity: decimalNumber(row.plannedQuantity),
      completedQuantity: decimalNumber(row.completedQuantity),
      rejectedQuantity: decimalNumber(row.rejectedQuantity),
      unit: row.unit,
      issueWarehouse: row.issueWarehouse.name,
      receiptWarehouse: row.receiptWarehouse.name,
      plannedStartDate: dateOnly(row.plannedStartDate),
      plannedEndDate: dateOnly(row.plannedEndDate),
      actualStartAt: iso(row.actualStartAt),
      actualEndAt: iso(row.actualEndAt),
    }));
    return this.envelope(
      "production-orders",
      query,
      [
        { key: "orderNumber", label: "Production No." },
        { key: "type", label: "Type" },
        { key: "productName", label: "Finished Product" },
        { key: "bom", label: "BOM / Formula" },
        { key: "plannedQuantity", label: "Planned Qty", type: "quantity" },
        { key: "completedQuantity", label: "Completed Qty", type: "quantity" },
        { key: "rejectedQuantity", label: "Rejected Qty", type: "quantity" },
        { key: "issueWarehouse", label: "Issue Warehouse" },
        { key: "receiptWarehouse", label: "Receipt Warehouse" },
        { key: "status", label: "Status" },
      ],
      result,
      {
        plannedQuantity: result.reduce(
          (sum, row) => sum + row.plannedQuantity,
          0,
        ),
        completedQuantity: result.reduce(
          (sum, row) => sum + row.completedQuantity,
          0,
        ),
        rejectedQuantity: result.reduce(
          (sum, row) => sum + row.rejectedQuantity,
          0,
        ),
      },
      truncated,
    );
  }

  private async materialMovementReport(scope: Scope, query: Query) {
    const limit = this.reportLimit(query);
    const range = this.reportRange(query);
    const search = text(query.search);
    const transactions = await this.prisma.manufacturingTransaction.findMany({
      where: {
        workspaceId: scope.id,
        status: "POSTED",
        transactionType: {
          in: [
            "MATERIAL_ISSUE",
            "MATERIAL_RETURN",
            "PACKAGING_ISSUE",
            "PACKAGING_RETURN",
            "PRODUCTION_RECEIPT",
          ],
        },
        ...(Object.keys(range).length ? { transactionDate: range } : {}),
        ...(query.orderId ? { orderId: query.orderId } : {}),
        ...(query.warehouseId
          ? {
              OR: [
                { fromWarehouseId: query.warehouseId },
                { toWarehouseId: query.warehouseId },
              ],
            }
          : {}),
      },
      include: {
        order: true,
        fromWarehouse: true,
        toWarehouse: true,
        lines: {
          include: {
            inventoryItem: true,
            sourceInventoryLot: true,
            destinationInventoryLot: true,
          },
        },
      },
      orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
    });
    const flattened = transactions
      .flatMap((transaction) =>
        transaction.lines
          .filter((line) => line.orderMaterialId)
          .map((line) => ({
            transactionId: transaction.id,
            transactionNumber: transaction.transactionNumber,
            transactionDate: iso(transaction.transactionDate),
            transactionType: transaction.transactionType,
            orderNumber: transaction.order.orderNumber,
            itemCode: line.inventoryItem.itemCode,
            itemName: line.inventoryItem.itemName,
            inventoryItemId: line.inventoryItemId,
            lotNumber:
              line.sourceInventoryLot?.lotNumber ??
              line.destinationInventoryLot?.lotNumber ??
              null,
            quantity: decimalNumber(line.quantity),
            unit: line.unit,
            unitCost: decimalNumber(line.unitCost),
            totalCost: decimalNumber(line.totalCost),
            fromWarehouse: transaction.fromWarehouse?.name ?? null,
            toWarehouse: transaction.toWarehouse?.name ?? null,
          })),
      )
      .filter(
        (row) =>
          (!query.inventoryItemId ||
            row.inventoryItemId === query.inventoryItemId) &&
          (!query.lotNumber ||
            row.lotNumber
              ?.toLowerCase()
              .includes(query.lotNumber.toLowerCase())) &&
          (!search ||
            [
              row.transactionNumber,
              row.orderNumber,
              row.itemCode,
              row.itemName,
              row.lotNumber ?? "",
            ].some((value) =>
              value.toLowerCase().includes(search.toLowerCase()),
            )),
      );
    const truncated = flattened.length > limit;
    const result = flattened.slice(0, limit);
    return this.envelope(
      "material-movements",
      query,
      [
        { key: "transactionDate", label: "Date", type: "date" },
        { key: "transactionNumber", label: "Document No." },
        { key: "transactionType", label: "Movement" },
        { key: "orderNumber", label: "Production No." },
        { key: "itemCode", label: "Item Code" },
        { key: "itemName", label: "Material" },
        { key: "lotNumber", label: "Lot / Batch" },
        { key: "quantity", label: "Quantity", type: "quantity" },
        { key: "unitCost", label: "Unit Cost", type: "money" },
        { key: "totalCost", label: "Total Cost", type: "money" },
        { key: "fromWarehouse", label: "From" },
        { key: "toWarehouse", label: "To" },
      ],
      result,
      {
        quantity: result.reduce((sum, row) => sum + row.quantity, 0),
        totalCost: result.reduce((sum, row) => sum + row.totalCost, 0),
      },
      truncated,
    );
  }

  private async wipReport(scope: Scope, query: Query) {
    const limit = this.reportLimit(query);
    const search = text(query.search);
    const status = queryEnum(
      query.status,
      Object.values(ManufacturingOrderStatus),
      "status",
    );
    const orders = await this.prisma.manufacturingOrder.findMany({
      where: {
        workspaceId: scope.id,
        status: { notIn: ["CLOSED", "CANCELLED"] },
        ...(query.orderId ? { id: query.orderId } : {}),
        ...(status ? { status } : {}),
      },
      include: {
        materials: { include: { inventoryItem: true } },
        transactions: { where: { status: "POSTED" }, include: { lines: true } },
      },
      orderBy: [{ createdAt: "desc" }, { orderNumber: "desc" }],
    });
    const rows = orders
      .flatMap((order) =>
        order.materials.map((material) => {
          const matching = order.transactions
            .flatMap((transaction) =>
              transaction.lines.map((line) => ({ transaction, line })),
            )
            .filter(({ line }) => line.orderMaterialId === material.id);
          const value = (types: string[]) =>
            matching
              .filter(({ transaction }) =>
                types.includes(transaction.transactionType),
              )
              .reduce(
                (sum, entry) => sum.add(entry.line.totalCost),
                decimal(0),
              );
          const issueValue = value(["MATERIAL_ISSUE", "PACKAGING_ISSUE"]);
          const returnValue = value(["MATERIAL_RETURN", "PACKAGING_RETURN"]);
          const consumedValue = value(["PRODUCTION_RECEIPT"]);
          return {
            orderId: order.id,
            orderNumber: order.orderNumber,
            orderStatus: order.status,
            inventoryItemId: material.inventoryItemId,
            itemCode: material.inventoryItem.itemCode,
            itemName: material.inventoryItem.itemName,
            unit: material.unit,
            issuedQuantity: decimalNumber(material.issuedQuantity),
            returnedQuantity: decimalNumber(material.returnedQuantity),
            consumedQuantity: decimalNumber(material.consumedQuantity),
            scrappedQuantity: decimalNumber(material.scrappedQuantity),
            wipQuantity: decimal(material.issuedQuantity)
              .sub(material.returnedQuantity)
              .sub(material.consumedQuantity)
              .sub(material.scrappedQuantity)
              .toNumber(),
            wipValue: issueValue
              .sub(returnValue)
              .sub(consumedValue)
              .toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP)
              .toNumber(),
          };
        }),
      )
      .filter(
        (row) =>
          (!query.inventoryItemId ||
            row.inventoryItemId === query.inventoryItemId) &&
          (!search ||
            [row.orderNumber, row.itemCode, row.itemName].some((value) =>
              value.toLowerCase().includes(search.toLowerCase()),
            )),
      );
    const truncated = rows.length > limit;
    const result = rows.slice(0, limit);
    return this.envelope(
      "wip",
      query,
      [
        { key: "orderNumber", label: "Production No." },
        { key: "orderStatus", label: "Status" },
        { key: "itemCode", label: "Item Code" },
        { key: "itemName", label: "Material" },
        { key: "issuedQuantity", label: "Issued", type: "quantity" },
        { key: "returnedQuantity", label: "Returned", type: "quantity" },
        { key: "consumedQuantity", label: "Consumed", type: "quantity" },
        { key: "scrappedQuantity", label: "Scrapped", type: "quantity" },
        { key: "wipQuantity", label: "WIP Qty", type: "quantity" },
        { key: "wipValue", label: "WIP Value", type: "money" },
      ],
      result,
      {
        wipQuantity: result.reduce((sum, row) => sum + row.wipQuantity, 0),
        wipValue: result.reduce((sum, row) => sum + row.wipValue, 0),
      },
      truncated,
    );
  }

  private async finishedReceiptReport(scope: Scope, query: Query) {
    const limit = this.reportLimit(query);
    const range = this.reportRange(query);
    const transactions = await this.prisma.manufacturingTransaction.findMany({
      where: {
        workspaceId: scope.id,
        status: "POSTED",
        transactionType: "PRODUCTION_RECEIPT",
        ...(Object.keys(range).length ? { transactionDate: range } : {}),
        ...(query.orderId ? { orderId: query.orderId } : {}),
        ...(query.warehouseId ? { toWarehouseId: query.warehouseId } : {}),
      },
      include: {
        order: { include: { finishedProduct: true } },
        orderLot: true,
        toWarehouse: true,
        lines: { include: { destinationInventoryLot: true } },
      },
      orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
    });
    const rows = transactions
      .flatMap((transaction) =>
        transaction.lines
          .filter(
            (line) =>
              !line.orderMaterialId &&
              line.inventoryItemId === transaction.order.finishedProductId,
          )
          .map((line) => ({
            transactionId: transaction.id,
            transactionNumber: transaction.transactionNumber,
            receiptDate: iso(transaction.transactionDate),
            orderNumber: transaction.order.orderNumber,
            orderLotNumber: transaction.orderLot?.lotNumber ?? null,
            inventoryItemId: line.inventoryItemId,
            itemCode: transaction.order.finishedProduct.itemCode,
            itemName: transaction.order.finishedProduct.itemName,
            outputLotNumber: line.destinationInventoryLot?.lotNumber ?? null,
            warehouse: transaction.toWarehouse?.name ?? null,
            quantity: decimalNumber(line.quantity),
            unit: line.unit,
            unitCost: decimalNumber(line.unitCost),
            totalCost: decimalNumber(line.totalCost),
          })),
      )
      .filter(
        (row) =>
          (!query.inventoryItemId ||
            row.inventoryItemId === query.inventoryItemId) &&
          (!query.lotNumber ||
            row.outputLotNumber
              ?.toLowerCase()
              .includes(query.lotNumber.toLowerCase())) &&
          (!query.search ||
            [
              row.orderNumber,
              row.transactionNumber,
              row.itemName,
              row.itemCode,
              row.outputLotNumber ?? "",
            ].some((value) =>
              value.toLowerCase().includes(query.search!.toLowerCase()),
            )),
      );
    const truncated = rows.length > limit;
    const result = rows.slice(0, limit);
    return this.envelope(
      "finished-receipts",
      query,
      [
        { key: "receiptDate", label: "Receipt Date", type: "date" },
        { key: "transactionNumber", label: "Receipt No." },
        { key: "orderNumber", label: "Production No." },
        { key: "itemCode", label: "Item Code" },
        { key: "itemName", label: "Finished Product" },
        { key: "orderLotNumber", label: "Order Lot" },
        { key: "outputLotNumber", label: "Output Lot" },
        { key: "warehouse", label: "Warehouse" },
        { key: "quantity", label: "Quantity", type: "quantity" },
        { key: "unitCost", label: "Unit Cost", type: "money" },
        { key: "totalCost", label: "Total Cost", type: "money" },
      ],
      result,
      {
        quantity: result.reduce((sum, row) => sum + row.quantity, 0),
        totalCost: result.reduce((sum, row) => sum + row.totalCost, 0),
      },
      truncated,
    );
  }

  private async actualCostReport(scope: Scope, query: Query) {
    const limit = this.reportLimit(query);
    const range = this.reportRange(query);
    const postings = await this.prisma.manufacturingActualCostPosting.findMany({
      where: {
        workspaceId: scope.id,
        ...(Object.keys(range).length ? { transactionDate: range } : {}),
        ...(query.orderId ? { orderId: query.orderId } : {}),
        ...(query.status === "finalized"
          ? { finalizedSnapshotId: { not: null } }
          : query.status === "unfinalized"
            ? { finalizedSnapshotId: null }
            : {}),
        ...(query.search
          ? { description: { contains: query.search, mode: "insensitive" } }
          : {}),
      },
      orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
      take: limit + 1,
    });
    const orderIds = [...new Set(postings.map((posting) => posting.orderId))];
    const driverIds = [
      ...new Set(postings.map((posting) => posting.costDriverId)),
    ];
    const [orders, drivers] = await Promise.all([
      orderIds.length
        ? this.prisma.manufacturingOrder.findMany({
            where: { id: { in: orderIds } },
            select: { id: true, orderNumber: true },
          })
        : [],
      driverIds.length
        ? this.prisma.manufacturingCostDriver.findMany({
            where: { id: { in: driverIds } },
            select: { id: true, code: true, name: true },
          })
        : [],
    ]);
    const orderById = new Map(orders.map((order) => [order.id, order]));
    const driverById = new Map(drivers.map((driver) => [driver.id, driver]));
    const truncated = postings.length > limit;
    const rows = postings.slice(0, limit).map((posting) => ({
      postingId: posting.id,
      transactionDate: iso(posting.transactionDate),
      orderNumber:
        orderById.get(posting.orderId)?.orderNumber ?? posting.orderId,
      driverCode: driverById.get(posting.costDriverId)?.code ?? null,
      driverName:
        driverById.get(posting.costDriverId)?.name ?? posting.description,
      costType: posting.costType,
      basis: posting.driverBasis,
      basisQuantity: decimalNumber(posting.basisQuantity),
      rate: decimalNumber(posting.rate),
      amount: decimalNumber(posting.amount),
      voucherEntryId: posting.voucherEntryId,
      status: posting.finalizedSnapshotId ? "FINALIZED" : "POSTED",
      finalizedSnapshotId: posting.finalizedSnapshotId,
      referenceNo: posting.referenceNo,
    }));
    return this.envelope(
      "actual-costs",
      query,
      [
        { key: "transactionDate", label: "Date", type: "date" },
        { key: "orderNumber", label: "Production No." },
        { key: "driverCode", label: "Driver" },
        { key: "driverName", label: "Cost" },
        { key: "costType", label: "Type" },
        { key: "basis", label: "Basis" },
        { key: "basisQuantity", label: "Basis Qty", type: "quantity" },
        { key: "rate", label: "Rate", type: "money" },
        { key: "amount", label: "Amount", type: "money" },
        { key: "status", label: "Status" },
      ],
      rows,
      { amount: rows.reduce((sum, row) => sum + row.amount, 0) },
      truncated,
    );
  }

  private async costVarianceReport(scope: Scope, query: Query) {
    const limit = this.reportLimit(query);
    const range = this.reportRange(query);
    const snapshots = await this.prisma.manufacturingCostSnapshot.findMany({
      where: {
        workspaceId: scope.id,
        status: "FINALIZED",
        ...(Object.keys(range).length ? { finalizedAt: range } : {}),
        ...(query.orderId ? { orderId: query.orderId } : {}),
        ...(query.inventoryItemId
          ? { order: { finishedProductId: query.inventoryItemId } }
          : {}),
      },
      include: { order: { include: { finishedProduct: true } } },
      orderBy: [{ finalizedAt: "desc" }, { createdAt: "desc" }],
      take: limit + 1,
    });
    const truncated = snapshots.length > limit;
    const rows = snapshots.slice(0, limit).map((snapshot) => ({
      snapshotId: snapshot.id,
      finalizedAt: iso(snapshot.finalizedAt),
      orderNumber: snapshot.order.orderNumber,
      itemCode: snapshot.order.finishedProduct.itemCode,
      itemName: snapshot.order.finishedProduct.itemName,
      completedQuantity: decimalNumber(snapshot.completedQuantity),
      materialCost: decimalNumber(snapshot.materialCost),
      packagingCost: decimalNumber(snapshot.packagingCost),
      labourCost: decimalNumber(snapshot.labourCost),
      machineCost: decimalNumber(snapshot.machineCost),
      overheadCost: decimalNumber(snapshot.overheadCost),
      subcontractCost: decimalNumber(snapshot.subcontractCost),
      otherCost: decimalNumber(snapshot.otherCost),
      scrapRecovery: decimalNumber(snapshot.scrapRecovery),
      totalCost: decimalNumber(snapshot.totalCost),
      unitCost: decimalNumber(snapshot.unitCost),
      varianceAmount: decimalNumber(snapshot.varianceAmount),
    }));
    return this.envelope(
      "cost-variance",
      query,
      [
        { key: "finalizedAt", label: "Finalized", type: "date" },
        { key: "orderNumber", label: "Production No." },
        { key: "itemCode", label: "Item Code" },
        { key: "itemName", label: "Finished Product" },
        { key: "completedQuantity", label: "Output Qty", type: "quantity" },
        { key: "materialCost", label: "Material", type: "money" },
        { key: "packagingCost", label: "Packaging", type: "money" },
        { key: "labourCost", label: "Labour", type: "money" },
        { key: "machineCost", label: "Machine", type: "money" },
        { key: "overheadCost", label: "Overhead", type: "money" },
        { key: "subcontractCost", label: "Subcontract", type: "money" },
        { key: "otherCost", label: "Other", type: "money" },
        { key: "totalCost", label: "Actual Cost", type: "money" },
        { key: "unitCost", label: "Actual Unit Cost", type: "money" },
        { key: "varianceAmount", label: "Standard Variance", type: "money" },
      ],
      rows,
      {
        totalCost: rows.reduce((sum, row) => sum + row.totalCost, 0),
        varianceAmount: rows.reduce((sum, row) => sum + row.varianceAmount, 0),
      },
      truncated,
    );
  }

  private async qualityReport(scope: Scope, query: Query) {
    const limit = this.reportLimit(query);
    const range = this.reportRange(query);
    const status = queryEnum(
      query.status,
      Object.values(ManufacturingQualityStatus),
      "status",
    );
    const rows = await this.prisma.manufacturingQualityInspection.findMany({
      where: {
        workspaceId: scope.id,
        ...(Object.keys(range).length ? { createdAt: range } : {}),
        ...(query.orderId ? { orderId: query.orderId } : {}),
        ...(query.inventoryItemId
          ? { inventoryItemId: query.inventoryItemId }
          : {}),
        ...(status ? { status } : {}),
        ...(query.serialNumber
          ? {
              serial: {
                serialNumber: {
                  contains: query.serialNumber,
                  mode: "insensitive",
                },
              },
            }
          : {}),
      },
      include: {
        order: true,
        orderLot: true,
        inventoryItem: true,
        serial: true,
        results: true,
      },
      orderBy: [{ inspectedAt: "desc" }, { createdAt: "desc" }],
      take: limit + 1,
    });
    const truncated = rows.length > limit;
    const result = rows.slice(0, limit).map((inspection) => ({
      inspectionId: inspection.id,
      inspectionNumber: inspection.inspectionNumber,
      inspectedAt: iso(inspection.inspectedAt),
      inspectionType: inspection.inspectionType,
      orderNumber: inspection.order.orderNumber,
      lotNumber: inspection.orderLot?.lotNumber ?? null,
      serialNumber: inspection.serial?.serialNumber ?? null,
      itemCode: inspection.inventoryItem.itemCode,
      itemName: inspection.inventoryItem.itemName,
      status: inspection.status,
      sampleQuantity: decimalNumber(inspection.sampleQuantity),
      acceptedQuantity: decimalNumber(inspection.acceptedQuantity),
      rejectedQuantity: decimalNumber(inspection.rejectedQuantity),
      holdQuantity: decimal(inspection.sampleQuantity)
        .sub(inspection.acceptedQuantity)
        .sub(inspection.rejectedQuantity)
        .toNumber(),
      failedParameters: inspection.results
        .filter((result) => result.passed === false)
        .map((result) => result.parameterName)
        .join(", "),
      holdReason: inspection.holdReason,
    }));
    return this.envelope(
      "quality",
      query,
      [
        { key: "inspectedAt", label: "Inspection Date", type: "date" },
        { key: "inspectionNumber", label: "Inspection No." },
        { key: "inspectionType", label: "Type" },
        { key: "orderNumber", label: "Production No." },
        { key: "lotNumber", label: "Lot / Batch" },
        { key: "serialNumber", label: "Serial" },
        { key: "itemName", label: "Item" },
        { key: "sampleQuantity", label: "Sample", type: "quantity" },
        { key: "acceptedQuantity", label: "Accepted", type: "quantity" },
        { key: "rejectedQuantity", label: "Rejected", type: "quantity" },
        { key: "holdQuantity", label: "Hold", type: "quantity" },
        { key: "status", label: "Status" },
        { key: "failedParameters", label: "Failed Parameters" },
      ],
      result,
      {
        sampleQuantity: result.reduce(
          (sum, row) => sum + row.sampleQuantity,
          0,
        ),
        acceptedQuantity: result.reduce(
          (sum, row) => sum + row.acceptedQuantity,
          0,
        ),
        rejectedQuantity: result.reduce(
          (sum, row) => sum + row.rejectedQuantity,
          0,
        ),
        holdQuantity: result.reduce((sum, row) => sum + row.holdQuantity, 0),
      },
      truncated,
    );
  }

  private async packagingReport(scope: Scope, query: Query) {
    const limit = this.reportLimit(query);
    const range = this.reportRange(query);
    const status = queryEnum(
      query.status,
      Object.values(ManufacturingPackagingOrderStatus),
      "status",
    );
    const rows = await this.prisma.manufacturingPackagingOrder.findMany({
      where: {
        workspaceId: scope.id,
        ...(Object.keys(range).length ? { createdAt: range } : {}),
        ...(query.orderId ? { orderId: query.orderId } : {}),
        ...(status ? { status } : {}),
        ...(query.search
          ? {
              packagingOrderNumber: {
                contains: query.search,
                mode: "insensitive",
              },
            }
          : {}),
      },
      include: {
        order: true,
        orderLot: true,
        reconciliations: true,
        labels: true,
        packageUnits: true,
      },
      orderBy: [{ createdAt: "desc" }, { packagingOrderNumber: "desc" }],
      take: limit + 1,
    });
    const truncated = rows.length > limit;
    const result = rows.slice(0, limit).map((packaging) => ({
      packagingOrderId: packaging.id,
      packagingOrderNumber: packaging.packagingOrderNumber,
      createdAt: iso(packaging.createdAt),
      orderNumber: packaging.order.orderNumber,
      lotNumber: packaging.orderLot?.lotNumber ?? null,
      status: packaging.status,
      plannedQuantity: decimalNumber(packaging.plannedQuantity),
      unit: packaging.unit,
      issuedQuantity: packaging.reconciliations.reduce(
        (sum, row) => sum + decimalNumber(row.issuedQuantity),
        0,
      ),
      usedQuantity: packaging.reconciliations.reduce(
        (sum, row) => sum + decimalNumber(row.usedQuantity),
        0,
      ),
      returnedQuantity: packaging.reconciliations.reduce(
        (sum, row) => sum + decimalNumber(row.returnedQuantity),
        0,
      ),
      rejectedQuantity: packaging.reconciliations.reduce(
        (sum, row) => sum + decimalNumber(row.rejectedQuantity),
        0,
      ),
      labelCount: packaging.labels.length,
      packageUnitCount: packaging.packageUnits.length,
      lineClearedAt: iso(packaging.lineClearedAt),
      reconciledAt: iso(packaging.reconciledAt),
      releaseReadyAt: iso(packaging.releaseReadyAt),
    }));
    return this.envelope(
      "packaging",
      query,
      [
        { key: "createdAt", label: "Date", type: "date" },
        { key: "packagingOrderNumber", label: "Packaging Order" },
        { key: "orderNumber", label: "Production No." },
        { key: "lotNumber", label: "Lot / Batch" },
        { key: "plannedQuantity", label: "Planned", type: "quantity" },
        { key: "issuedQuantity", label: "Issued", type: "quantity" },
        { key: "usedQuantity", label: "Used", type: "quantity" },
        { key: "returnedQuantity", label: "Returned", type: "quantity" },
        { key: "rejectedQuantity", label: "Rejected", type: "quantity" },
        { key: "labelCount", label: "Labels" },
        { key: "packageUnitCount", label: "Packages" },
        { key: "status", label: "Status" },
      ],
      result,
      {
        plannedQuantity: result.reduce(
          (sum, row) => sum + row.plannedQuantity,
          0,
        ),
        usedQuantity: result.reduce((sum, row) => sum + row.usedQuantity, 0),
      },
      truncated,
    );
  }

  private async manufacturingJournalReport(scope: Scope, query: Query) {
    const limit = this.reportLimit(query);
    const range = this.reportRange(query);
    const search = text(query.search);
    const status = queryEnum(
      query.status,
      Object.values(VoucherEntryStatus),
      "status",
    );
    const searchFilters: Prisma.VoucherEntryWhereInput[] = [];
    if (search) {
      searchFilters.push({
        OR: [
          { voucherNumber: { contains: search, mode: "insensitive" } },
          { reference: { contains: search, mode: "insensitive" } },
          { narration: { contains: search, mode: "insensitive" } },
          {
            lines: {
              some: {
                OR: [
                  { ledger: { contains: search, mode: "insensitive" } },
                  { description: { contains: search, mode: "insensitive" } },
                ],
              },
            },
          },
        ],
      });
    }
    const vouchers = await this.prisma.voucherEntry.findMany({
      where: {
        workspaceId: scope.id,
        sourceType: {
          in: ["MANUFACTURING_ACTUAL_COST", "MANUFACTURING_COST_FINALIZATION"],
        },
        ...(Object.keys(range).length ? { voucherDate: range } : {}),
        ...(query.orderId ? { sourceId: query.orderId } : {}),
        ...(status ? { status } : {}),
        ...(searchFilters.length ? { AND: searchFilters } : {}),
      },
      include: {
        lines: { include: { account: true }, orderBy: { createdAt: "asc" } },
      },
      orderBy: [{ voucherDate: "desc" }, { createdAt: "desc" }],
      take: limit + 1,
    });
    const flattened = vouchers.flatMap((voucher) =>
      voucher.lines.map((line) => ({
        voucherId: voucher.id,
        voucherDate: iso(voucher.voucherDate),
        voucherNumber: voucher.voucherNumber,
        documentKind: voucher.documentKind,
        productionReference: voucher.reference,
        sourceType: voucher.sourceType,
        status: voucher.status,
        accountCode: line.account?.code ?? null,
        ledger: line.ledger,
        description: line.description,
        debit: decimalNumber(line.debit),
        credit: decimalNumber(line.credit),
        voucherDebit: decimalNumber(voucher.debit),
        voucherCredit: decimalNumber(voucher.credit),
        balanced: moneyEquals(voucher.debit, voucher.credit),
      })),
    );
    const truncated = vouchers.length > limit || flattened.length > limit;
    const rows = flattened.slice(0, limit);
    return this.envelope(
      "manufacturing-journals",
      query,
      [
        { key: "voucherDate", label: "Voucher Date", type: "date" },
        { key: "voucherNumber", label: "Voucher No." },
        { key: "productionReference", label: "Production Reference" },
        { key: "documentKind", label: "Journal Type" },
        { key: "accountCode", label: "Account Code" },
        { key: "ledger", label: "Ledger" },
        { key: "description", label: "Description" },
        { key: "debit", label: "Debit", type: "money" },
        { key: "credit", label: "Credit", type: "money" },
        { key: "status", label: "Status" },
        { key: "balanced", label: "Balanced" },
      ],
      rows,
      {
        debit: rows.reduce((sum, row) => sum + row.debit, 0),
        credit: rows.reduce((sum, row) => sum + row.credit, 0),
      },
      truncated,
    );
  }

  private async traceabilityReport(scope: Scope, query: Query) {
    const limit = this.reportLimit(query);
    const range = this.reportRange(query);
    const search = text(query.search);
    const graphLimit = Math.min(Math.max(limit * 20, 5_000), 20_000);
    let graphTruncated = false;
    let seedTruncated = false;

    // Resolve the requested lot/serial first, then walk forward through the
    // persisted genealogy graph. This makes a raw-material lot filter return
    // the finished serials it actually fed instead of only its direct edge.
    const seedLotIds = new Set<string>();
    if (query.lotNumber) {
      const lots = await this.prisma.manufacturingInventoryLot.findMany({
        where: {
          workspaceId: scope.id,
          lotNumber: { contains: query.lotNumber, mode: "insensitive" },
        },
        select: { id: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
      });
      seedTruncated ||= lots.length > limit;
      for (const lot of lots.slice(0, limit)) seedLotIds.add(lot.id);
    }

    const seedSerialIds = new Set<string>();
    if (query.serialNumber) {
      const serials = await this.prisma.manufacturingSerial.findMany({
        where: {
          workspaceId: scope.id,
          serialNumber: {
            contains: query.serialNumber,
            mode: "insensitive",
          },
        },
        select: { id: true, inventoryLotId: true },
        orderBy: [{ serialNumber: "asc" }, { id: "asc" }],
        take: limit + 1,
      });
      seedTruncated ||= serials.length > limit;
      for (const serial of serials.slice(0, limit)) {
        seedSerialIds.add(serial.id);
        if (serial.inventoryLotId) seedLotIds.add(serial.inventoryLotId);
      }
    }

    const hasTraceSeed = Boolean(query.lotNumber || query.serialNumber);
    const reachableLotIds = new Set(seedLotIds);
    const expandedForwardLots = new Set<string>();
    const expandedForwardSerials = new Set<string>();
    const forwardEdgeIds = new Set<string>();
    let forwardLotFrontier = [...seedLotIds];
    let forwardSerialFrontier = [...seedSerialIds];
    for (
      let depth = 0;
      (forwardLotFrontier.length || forwardSerialFrontier.length) &&
      depth < 100;
      depth += 1
    ) {
      forwardLotFrontier = forwardLotFrontier.filter(
        (id) => !expandedForwardLots.has(id),
      );
      forwardSerialFrontier = forwardSerialFrontier.filter(
        (id) => !expandedForwardSerials.has(id),
      );
      if (!forwardLotFrontier.length && !forwardSerialFrontier.length) break;
      for (const id of forwardLotFrontier) expandedForwardLots.add(id);
      for (const id of forwardSerialFrontier) expandedForwardSerials.add(id);
      const remaining = graphLimit - forwardEdgeIds.size;
      if (remaining <= 0) {
        graphTruncated = true;
        break;
      }
      const page = await this.prisma.manufacturingGenealogy.findMany({
        where: {
          workspaceId: scope.id,
          OR: [
            ...(forwardLotFrontier.length
              ? [{ parentInventoryLotId: { in: forwardLotFrontier } }]
              : []),
            ...(forwardSerialFrontier.length
              ? [{ parentSerialId: { in: forwardSerialFrontier } }]
              : []),
          ],
        },
        select: {
          id: true,
          childInventoryLotId: true,
          childSerialId: true,
          childSerial: { select: { inventoryLotId: true } },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: remaining + 1,
      });
      if (page.length > remaining) graphTruncated = true;
      const nextLots = new Set<string>();
      const nextSerials = new Set<string>();
      for (const edge of page.slice(0, remaining)) {
        if (!forwardEdgeIds.add(edge.id)) continue;
        if (edge.childInventoryLotId) {
          reachableLotIds.add(edge.childInventoryLotId);
          nextLots.add(edge.childInventoryLotId);
        }
        if (edge.childSerialId) nextSerials.add(edge.childSerialId);
        if (edge.childSerial?.inventoryLotId) {
          reachableLotIds.add(edge.childSerial.inventoryLotId);
          nextLots.add(edge.childSerial.inventoryLotId);
        }
      }
      forwardLotFrontier = [...nextLots];
      forwardSerialFrontier = [...nextSerials];
      if (depth === 99 && (nextLots.size || nextSerials.size))
        graphTruncated = true;
    }

    const receiptFilters: Prisma.ManufacturingTransactionWhereInput[] = [];
    if (hasTraceSeed) {
      receiptFilters.push({
        lines: {
          some: {
            destinationInventoryLotId: { in: [...reachableLotIds] },
          },
        },
      });
    }
    if (query.serialNumber) {
      receiptFilters.push({
        lines: {
          some: {
            OR: [
              {
                serialMovements: {
                  some: {
                    serial: {
                      serialNumber: {
                        contains: query.serialNumber,
                        mode: "insensitive",
                      },
                    },
                  },
                },
              },
              {
                destinationInventoryLot: {
                  serials: {
                    some: {
                      serialNumber: {
                        contains: query.serialNumber,
                        mode: "insensitive",
                      },
                    },
                  },
                },
              },
            ],
          },
        },
      });
    }
    const inventoryLotInclude = {
      inventoryItem: true,
      warehouse: true,
      location: true,
      serials: {
        include: { warehouse: true, location: true },
        orderBy: [{ serialNumber: "asc" }, { id: "asc" }],
      },
    } satisfies Prisma.ManufacturingInventoryLotInclude;
    const genealogyInclude = {
      order: { include: { finishedProduct: true } },
      orderLot: true,
      transactionLine: { include: { inventoryItem: true } },
      parentInventoryLot: { include: inventoryLotInclude },
      childInventoryLot: { include: inventoryLotInclude },
      parentSerial: {
        include: {
          inventoryItem: true,
          inventoryLot: { include: inventoryLotInclude },
        },
      },
      childSerial: {
        include: {
          inventoryItem: true,
          inventoryLot: { include: inventoryLotInclude },
        },
      },
    } satisfies Prisma.ManufacturingGenealogyInclude;
    const releaseSettings = await this.prisma.manufacturingSettings.findUnique({
      where: { workspaceId: scope.id },
      select: {
        defaultFinishedGoodsReleasedWarehouseId: true,
        defaultFinishedGoodsReleaseLocationId: true,
      },
    });
    const receiptPage = await this.prisma.manufacturingTransaction.findMany({
      where: {
        workspaceId: scope.id,
        status: "POSTED",
        transactionType: "PRODUCTION_RECEIPT",
        ...(Object.keys(range).length ? { transactionDate: range } : {}),
        ...(query.orderId ? { orderId: query.orderId } : {}),
        ...(receiptFilters.length ? { AND: receiptFilters } : {}),
      },
      include: {
        order: {
          include: {
            finishedProduct: { include: { manufacturingProfile: true } },
          },
        },
        orderLot: true,
        toWarehouse: true,
        toLocation: true,
        lines: {
          include: {
            inventoryItem: true,
            destinationInventoryLot: { include: inventoryLotInclude },
            serialMovements: {
              include: {
                serial: {
                  include: { warehouse: true, location: true },
                },
              },
              orderBy: { createdAt: "asc" },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [
        { transactionDate: "desc" },
        { createdAt: "desc" },
        { id: "desc" },
      ],
      take: limit + 1,
    });
    const receiptTruncated = receiptPage.length > limit;
    const receipts = receiptPage.slice(0, limit);
    const receiptOutputLines = receipts.flatMap((transaction) =>
      transaction.lines
        .filter(
          (line) =>
            !line.orderMaterialId &&
            line.inventoryItemId === transaction.order.finishedProductId &&
            Boolean(line.destinationInventoryLotId),
        )
        .map((line) => ({ transaction, line })),
    );
    type TraceWorkflowRun = {
      id: string;
      productionOrderId: string;
      productId: string | null;
      status: string;
      workflowDefinitionId: string;
      workflowDefinitionVersion: number;
      createdAt: Date;
    };
    const receiptOrderIds = [
      ...new Set(receipts.map((receipt) => receipt.orderId)),
    ];
    let workflowSchemaUnavailable = false;
    let workflowRuns: TraceWorkflowRun[] = [];
    if (receiptOrderIds.length) {
      try {
        workflowRuns = await this.prisma.$queryRaw<TraceWorkflowRun[]>(
          Prisma.sql`
            SELECT
              r."id",
              r."productionOrderId",
              r."productId",
              r."status"::text AS "status",
              r."workflowDefinitionId",
              d."version" AS "workflowDefinitionVersion",
              r."createdAt"
            FROM "ManufacturingRun" r
            JOIN "ManufacturingWorkflowDefinition" d
              ON d."id" = r."workflowDefinitionId"
            WHERE r."workspaceId" = ${scope.id}
              AND r."productionOrderId" IN (${Prisma.join(receiptOrderIds)})
              AND r."status" <> 'CANCELLED'::"ManufacturingRunStatus"
            ORDER BY r."createdAt" DESC, r."id" DESC
            LIMIT ${graphLimit + 1}
          `,
        );
      } catch (error) {
        if (
          error instanceof Error &&
          /ManufacturingRun|ManufacturingWorkflowDefinition|does not exist/i.test(
            error.message,
          )
        )
          workflowSchemaUnavailable = true;
        else throw error;
      }
    }
    const workflowTruncated = workflowRuns.length > graphLimit;
    workflowRuns = workflowRuns.slice(0, graphLimit);
    const workflowRunsByOrder = new Map<string, TraceWorkflowRun[]>();
    for (const run of workflowRuns) {
      const orderRuns = workflowRunsByOrder.get(run.productionOrderId) ?? [];
      orderRuns.push(run);
      workflowRunsByOrder.set(run.productionOrderId, orderRuns);
    }
    const finishedLotIds = [
      ...new Set(
        receiptOutputLines.flatMap(({ line }) =>
          line.destinationInventoryLotId
            ? [line.destinationInventoryLotId]
            : [],
        ),
      ),
    ];

    const releasePage = finishedLotIds.length
      ? await this.prisma.manufacturingTransaction.findMany({
          where: {
            workspaceId: scope.id,
            status: "POSTED",
            transactionType: "QA_RELEASE",
            lines: {
              some: {
                OR: [
                  { sourceInventoryLotId: { in: finishedLotIds } },
                  { destinationInventoryLotId: { in: finishedLotIds } },
                ],
              },
            },
          },
          include: {
            order: { include: { finishedProduct: true } },
            orderLot: true,
            fromWarehouse: true,
            toWarehouse: true,
            fromLocation: true,
            toLocation: true,
            lines: {
              include: {
                sourceInventoryLot: true,
                destinationInventoryLot: true,
                serialMovements: {
                  include: {
                    serial: {
                      include: { warehouse: true, location: true },
                    },
                  },
                  orderBy: { createdAt: "asc" },
                },
              },
              orderBy: { createdAt: "asc" },
            },
          },
          orderBy: [
            { transactionDate: "desc" },
            { createdAt: "desc" },
            { id: "desc" },
          ],
          take: graphLimit + 1,
        })
      : [];
    const releaseTruncated = releasePage.length > graphLimit;
    const releases = releasePage.slice(0, graphLimit);
    const finishedSerialIds = [
      ...new Set(
        receiptOutputLines.flatMap(({ line }) => [
          ...(line.destinationInventoryLot?.serials.map(
            (serial) => serial.id,
          ) ?? []),
          ...line.serialMovements
            .filter((movement) => movement.role === "OUTPUT")
            .map((movement) => movement.serialId),
        ]),
      ),
    ];
    const packagingOrderSelect = {
      id: true,
      orderId: true,
      orderLotId: true,
      packagingOrderNumber: true,
      status: true,
    } satisfies Prisma.ManufacturingPackagingOrderSelect;
    const packagingLabelPage = finishedSerialIds.length
      ? await this.prisma.manufacturingPackagingLabel.findMany({
          where: {
            workspaceId: scope.id,
            serialId: { in: finishedSerialIds },
          },
          include: {
            packagingOrder: { select: packagingOrderSelect },
          },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          take: graphLimit + 1,
        })
      : [];
    const serialPackageUnitPage = finishedSerialIds.length
      ? await this.prisma.manufacturingPackageUnit.findMany({
          where: {
            workspaceId: scope.id,
            serialId: { in: finishedSerialIds },
          },
          include: {
            packagingOrder: { select: packagingOrderSelect },
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: graphLimit + 1,
        })
      : [];
    const packagingOrderIds = [
      ...new Set([
        ...packagingLabelPage
          .slice(0, graphLimit)
          .map((label) => label.packagingOrderId),
        ...serialPackageUnitPage
          .slice(0, graphLimit)
          .map((unit) => unit.packagingOrderId),
      ]),
    ];
    const packageUnitPage = packagingOrderIds.length
      ? await this.prisma.manufacturingPackageUnit.findMany({
          where: {
            workspaceId: scope.id,
            packagingOrderId: { in: packagingOrderIds },
          },
          include: {
            packagingOrder: { select: packagingOrderSelect },
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: graphLimit + 1,
        })
      : [];
    const packagingTruncated =
      packagingLabelPage.length > graphLimit ||
      serialPackageUnitPage.length > graphLimit ||
      packageUnitPage.length > graphLimit;
    const packagingLabels = packagingLabelPage.slice(0, graphLimit);
    const packageUnitsById = new Map(
      [
        ...packageUnitPage.slice(0, graphLimit),
        ...serialPackageUnitPage.slice(0, graphLimit),
      ].map((unit) => [unit.id, unit]),
    );
    const packageUnits = [...packageUnitsById.values()];

    // Starting at the actual FGR output lots, walk every persisted parent edge
    // backwards. The traversal is workspace-wide so a legitimately consumed
    // intermediate from another production order is not mistaken for a raw
    // source merely because the order ID changed.
    type GenealogyRow = Prisma.ManufacturingGenealogyGetPayload<{
      include: typeof genealogyInclude;
    }>;
    const backwardEdges: GenealogyRow[] = [];
    const backwardEdgeIds = new Set<string>();
    const expandedBackwardLots = new Set<string>();
    let backwardFrontier = [...finishedLotIds];
    for (let depth = 0; backwardFrontier.length && depth < 100; depth += 1) {
      backwardFrontier = backwardFrontier.filter(
        (id) => !expandedBackwardLots.has(id),
      );
      if (!backwardFrontier.length) break;
      for (const id of backwardFrontier) expandedBackwardLots.add(id);
      const remaining = graphLimit - backwardEdgeIds.size;
      if (remaining <= 0) {
        graphTruncated = true;
        break;
      }
      const page = await this.prisma.manufacturingGenealogy.findMany({
        where: {
          workspaceId: scope.id,
          OR: [
            { childInventoryLotId: { in: backwardFrontier } },
            {
              childSerial: {
                inventoryLotId: { in: backwardFrontier },
              },
            },
          ],
        },
        include: genealogyInclude,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: remaining + 1,
      });
      if (page.length > remaining) graphTruncated = true;
      const next = new Set<string>();
      for (const edge of page.slice(0, remaining)) {
        if (!backwardEdgeIds.add(edge.id)) continue;
        backwardEdges.push(edge);
        const parentLotId =
          edge.parentInventoryLotId ??
          edge.parentSerial?.inventoryLotId ??
          null;
        if (parentLotId) next.add(parentLotId);
      }
      backwardFrontier = [...next];
      if (depth === 99 && next.size) graphTruncated = true;
    }

    type GraphLot = NonNullable<GenealogyRow["parentInventoryLot"]>;
    type SourcePath = {
      rootLot: GraphLot;
      edges: GenealogyRow[];
      cycle: boolean;
    };
    const lotById = new Map<string, GraphLot>();
    for (const edge of backwardEdges) {
      if (edge.parentInventoryLot)
        lotById.set(edge.parentInventoryLot.id, edge.parentInventoryLot);
      if (edge.childInventoryLot)
        lotById.set(edge.childInventoryLot.id, edge.childInventoryLot);
      if (edge.parentSerial?.inventoryLot)
        lotById.set(
          edge.parentSerial.inventoryLot.id,
          edge.parentSerial.inventoryLot,
        );
      if (edge.childSerial?.inventoryLot)
        lotById.set(
          edge.childSerial.inventoryLot.id,
          edge.childSerial.inventoryLot,
        );
    }
    for (const { line } of receiptOutputLines) {
      if (line.destinationInventoryLot)
        lotById.set(
          line.destinationInventoryLot.id,
          line.destinationInventoryLot,
        );
    }
    const parentLot = (edge: GenealogyRow) =>
      edge.parentInventoryLot ?? edge.parentSerial?.inventoryLot ?? null;
    const childLotId = (edge: GenealogyRow) =>
      edge.childInventoryLotId ?? edge.childSerial?.inventoryLotId ?? null;
    const incomingByLot = new Map<string, GenealogyRow[]>();
    for (const edge of backwardEdges) {
      const childId = childLotId(edge);
      if (!childId) continue;
      const incoming = incomingByLot.get(childId) ?? [];
      incoming.push(edge);
      incomingByLot.set(childId, incoming);
    }
    const walkToRoot = (
      lotId: string,
      downstreamEdges: GenealogyRow[],
      visited: Set<string>,
    ): SourcePath[] => {
      const lot = lotById.get(lotId);
      if (!lot) return [];
      if (visited.has(lotId))
        return [{ rootLot: lot, edges: downstreamEdges, cycle: true }];
      const incoming = incomingByLot.get(lotId) ?? [];
      if (!incoming.length)
        return [{ rootLot: lot, edges: downstreamEdges, cycle: false }];
      const nextVisited = new Set(visited);
      nextVisited.add(lotId);
      return incoming.flatMap((edge) => {
        const parent = parentLot(edge);
        return parent
          ? walkToRoot(parent.id, [edge, ...downstreamEdges], nextVisited)
          : [];
      });
    };
    const sourcePathsByFinishedLot = new Map<string, SourcePath[]>();
    for (const finishedLotId of finishedLotIds) {
      const paths = (incomingByLot.get(finishedLotId) ?? []).flatMap((edge) => {
        const parent = parentLot(edge);
        return parent
          ? walkToRoot(parent.id, [edge], new Set([finishedLotId]))
          : [];
      });
      const distinct = new Map<string, SourcePath>();
      for (const path of paths) {
        const key = `${path.rootLot.id}:${path.edges
          .map((edge) => edge.id)
          .join(">")}`;
        distinct.set(key, path);
      }
      sourcePathsByFinishedLot.set(finishedLotId, [...distinct.values()]);
    }

    const rootLotIds = [
      ...new Set(
        [...sourcePathsByFinishedLot.values()].flatMap((paths) =>
          paths.map((path) => path.rootLot.id),
        ),
      ),
    ];
    const sourceReviewPage = rootLotIds.length
      ? await this.prisma.manufacturingWorkflowReview.findMany({
          where: {
            workspaceId: scope.id,
            workflowCode: "INCOMING_MATERIAL_LOT_REGISTERED",
            status: "APPROVED",
            entityType: "ManufacturingInventoryLot",
            entityId: { in: rootLotIds },
          },
          select: {
            id: true,
            entityId: true,
            transactionDate: true,
            evidence: true,
          },
          orderBy: [
            { transactionDate: "desc" },
            { createdAt: "desc" },
            { id: "desc" },
          ],
          take: graphLimit + 1,
        })
      : [];
    const sourceReviewTruncated = sourceReviewPage.length > graphLimit;
    const sourceReviews = sourceReviewPage.slice(0, graphLimit);
    const sourceReviewByLot = new Map<string, (typeof sourceReviews)[number]>();
    for (const review of sourceReviews) {
      if (review.entityId && !sourceReviewByLot.has(review.entityId))
        sourceReviewByLot.set(review.entityId, review);
    }
    const sourceMovementIds = [
      ...new Set(
        sourceReviews.flatMap((review) => {
          const movementId = text(
            jsonObject(review.evidence).sourceStockMovementId,
          );
          return movementId ? [movementId] : [];
        }),
      ),
    ];
    const sourceMovements = sourceMovementIds.length
      ? await this.prisma.stockMovement.findMany({
          where: {
            workspaceId: scope.id,
            id: { in: sourceMovementIds },
          },
          include: {
            inventoryItem: true,
            warehouse: true,
            lcInventoryPosting: {
              include: {
                lc: { select: { id: true, lcNumber: true } },
                lcItem: {
                  select: {
                    id: true,
                    productName: true,
                    grnItems: {
                      select: {
                        grn: {
                          select: {
                            id: true,
                            grnNumber: true,
                            receivedDate: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        })
      : [];
    const sourceMovementById = new Map(
      sourceMovements.map((movement) => [movement.id, movement]),
    );

    const releaseLinks = releases.flatMap((transaction) =>
      transaction.lines
        .filter((line) =>
          Boolean(
            (line.sourceInventoryLotId &&
              finishedLotIds.includes(line.sourceInventoryLotId)) ||
            (line.destinationInventoryLotId &&
              finishedLotIds.includes(line.destinationInventoryLotId)),
          ),
        )
        .map((line) => ({ transaction, line })),
    );
    const packagingLabelsBySerial = new Map<string, typeof packagingLabels>();
    for (const label of packagingLabels) {
      if (!label.serialId) continue;
      const labels = packagingLabelsBySerial.get(label.serialId) ?? [];
      labels.push(label);
      packagingLabelsBySerial.set(label.serialId, labels);
    }
    const packageUnitsBySerial = new Map<string, typeof packageUnits>();
    for (const unit of packageUnits) {
      if (!unit.serialId) continue;
      const units = packageUnitsBySerial.get(unit.serialId) ?? [];
      units.push(unit);
      packageUnitsBySerial.set(unit.serialId, units);
    }
    const workflowFgRStatuses = new Set([
      "FG_R",
      "COST_FINALIZED",
      "CLOSED",
      "PERIOD_LOCKED",
    ]);
    const requestedLot = text(query.lotNumber)?.toLowerCase() ?? null;
    const requestedSerial = text(query.serialNumber)?.toLowerCase() ?? null;
    const requestedSearch = search?.toLowerCase() ?? null;
    const candidateRows: Array<Record<string, unknown>> = [];

    for (const { transaction: receipt, line } of receiptOutputLines) {
      const finishedLot = line.destinationInventoryLot;
      if (!finishedLot) continue;
      const serialById = new Map<
        string,
        (typeof finishedLot.serials)[number]
      >();
      for (const serial of finishedLot.serials)
        serialById.set(serial.id, serial);
      for (const movement of line.serialMovements) {
        if (movement.role === "OUTPUT")
          serialById.set(movement.serial.id, movement.serial);
      }
      const receiptQuantity = decimal(line.quantity);
      const serialCountMismatch = Boolean(
        receipt.order.finishedProduct.manufacturingProfile?.serialTracked &&
        (!receiptQuantity.isInteger() ||
          !receiptQuantity.equals(serialById.size)),
      );
      const finishedSerials = serialById.size
        ? [...serialById.values()]
        : [null];
      for (const serial of finishedSerials) {
        if (
          requestedSerial &&
          !serial?.serialNumber.toLowerCase().includes(requestedSerial)
        )
          continue;
        const fgrSerialMovement = serial
          ? (line.serialMovements.find(
              (movement) =>
                movement.role === "OUTPUT" && movement.serialId === serial.id,
            ) ?? null)
          : null;
        const lotReleaseLinks = releaseLinks.filter(
          ({ line: releaseLine }) =>
            releaseLine.sourceInventoryLotId === finishedLot.id ||
            releaseLine.destinationInventoryLotId === finishedLot.id,
        );
        const releaseLink = serial
          ? (lotReleaseLinks.find(({ line: releaseLine }) =>
              releaseLine.serialMovements.some(
                (movement) =>
                  movement.role === "OUTPUT" && movement.serialId === serial.id,
              ),
            ) ?? null)
          : (lotReleaseLinks[0] ?? null);
        const qaSerialMovement =
          serial && releaseLink
            ? (releaseLink.line.serialMovements.find(
                (movement) =>
                  movement.role === "OUTPUT" && movement.serialId === serial.id,
              ) ?? null)
            : null;
        const sourcePaths = sourcePathsByFinishedLot.get(finishedLot.id) ?? [];
        const issues = new Set<string>();
        const serialTrackingRequired = Boolean(
          receipt.order.finishedProduct.manufacturingProfile?.serialTracked,
        );
        const orderWorkflowRuns =
          workflowRunsByOrder.get(receipt.orderId) ?? [];
        const workflowRun =
          orderWorkflowRuns.length === 1 ? orderWorkflowRuns[0] : null;
        if (workflowSchemaUnavailable)
          issues.add("WORKFLOW_RUN_SCHEMA_UNAVAILABLE");
        else if (!orderWorkflowRuns.length) issues.add("WORKFLOW_RUN_MISSING");
        else if (orderWorkflowRuns.length > 1)
          issues.add("WORKFLOW_RUN_AMBIGUOUS");
        if (workflowTruncated) issues.add("WORKFLOW_RUN_LIMIT_REACHED");
        if (
          workflowRun?.productId &&
          workflowRun.productId !== receipt.order.finishedProductId
        )
          issues.add("WORKFLOW_RUN_PRODUCT_MISMATCH");
        if (
          releaseLink &&
          workflowRun &&
          !workflowFgRStatuses.has(workflowRun.status)
        )
          issues.add("WORKFLOW_RUN_NOT_FG_R");
        if (serialTrackingRequired && !serial)
          issues.add("SERIAL_REQUIRED_MISSING");
        if (serialCountMismatch) issues.add("SERIAL_COUNT_MISMATCH");
        if (finishedLot.sourceTransactionLineId !== line.id)
          issues.add("FGR_LOT_SOURCE_LINE_MISMATCH");
        if (serial && serial.status !== "RELEASED")
          issues.add("SERIAL_NOT_RELEASED");
        if (serial && !serial.releasedAt)
          issues.add("SERIAL_RELEASE_TIMESTAMP_MISSING");
        if (
          serial &&
          (serial.orderId !== receipt.orderId ||
            serial.orderLotId !== receipt.orderLotId)
        )
          issues.add("SERIAL_ORDER_LINK_MISMATCH");
        if (serial && serial.inventoryLotId !== finishedLot.id)
          issues.add("SERIAL_LOT_LINK_MISMATCH");
        if (serial && !fgrSerialMovement)
          issues.add("FGR_SERIAL_MOVEMENT_MISSING");
        if (!lotReleaseLinks.length) issues.add("QA_RELEASE_MISSING");
        else if (serial && !releaseLink)
          issues.add("QA_SERIAL_MOVEMENT_MISSING");
        if (
          releaseLink &&
          (releaseLink.transaction.orderId !== receipt.orderId ||
            releaseLink.transaction.orderLotId !== receipt.orderLotId)
        )
          issues.add("QA_RELEASE_ORDER_LINK_MISMATCH");
        if (
          !releaseSettings?.defaultFinishedGoodsReleasedWarehouseId ||
          !releaseLink
        ) {
          if (!releaseSettings?.defaultFinishedGoodsReleasedWarehouseId)
            issues.add("FG_R_CONFIGURATION_MISSING");
        } else {
          const wrongWarehouse =
            releaseLink.transaction.toWarehouseId !==
            releaseSettings.defaultFinishedGoodsReleasedWarehouseId;
          const wrongConfiguredLocation = Boolean(
            releaseSettings.defaultFinishedGoodsReleaseLocationId &&
            releaseLink.transaction.toLocationId !==
              releaseSettings.defaultFinishedGoodsReleaseLocationId,
          );
          const wrongDisposition = Boolean(
            releaseLink.transaction.toLocation &&
            releaseLink.transaction.toLocation.disposition !== "RELEASED",
          );
          if (wrongWarehouse || wrongConfiguredLocation || wrongDisposition)
            issues.add("FG_R_DISPOSITION_INVALID");
          if (
            finishedLot.warehouseId !==
              releaseSettings.defaultFinishedGoodsReleasedWarehouseId ||
            (releaseSettings.defaultFinishedGoodsReleaseLocationId &&
              finishedLot.locationId !==
                releaseSettings.defaultFinishedGoodsReleaseLocationId)
          )
            issues.add("FINISHED_LOT_NOT_IN_FG_R");
          if (
            serial &&
            (serial.warehouseId !==
              releaseSettings.defaultFinishedGoodsReleasedWarehouseId ||
              (releaseSettings.defaultFinishedGoodsReleaseLocationId &&
                serial.locationId !==
                  releaseSettings.defaultFinishedGoodsReleaseLocationId))
          )
            issues.add("SERIAL_NOT_IN_FG_R");
        }
        if (!sourcePaths.length) issues.add("BACKWARD_GENEALOGY_MISSING");
        if (sourcePaths.some((path) => path.cycle))
          issues.add("GENEALOGY_CYCLE");
        if (graphTruncated) issues.add("GENEALOGY_LIMIT_REACHED");
        if (sourceReviewTruncated)
          issues.add("RAW_SOURCE_EVIDENCE_LIMIT_REACHED");
        if (packagingTruncated) issues.add("PACKAGING_EVIDENCE_LIMIT_REACHED");

        const serialLabels = serial
          ? (packagingLabelsBySerial.get(serial.id) ?? [])
          : [];
        const serialPackageUnits = serial
          ? (packageUnitsBySerial.get(serial.id) ?? [])
          : [];
        const linkedPackagingOrders = new Map(
          [...serialLabels, ...serialPackageUnits].map((entry) => [
            entry.packagingOrder.id,
            entry.packagingOrder,
          ]),
        );
        const packagingOrder =
          linkedPackagingOrders.size === 1
            ? [...linkedPackagingOrders.values()][0]
            : null;
        const packagingIssues: string[] = [];
        let packagingLabel =
          serialLabels.find((label) => label.status === "USED") ??
          serialLabels[0] ??
          null;
        let packageUnit =
          serialPackageUnits.find((unit) => unit.level === "UNIT") ??
          serialPackageUnits[0] ??
          null;
        let packageHierarchy: string | null = null;
        if (
          serial &&
          (serialTrackingRequired ||
            serialLabels.length > 0 ||
            serialPackageUnits.length > 0)
        ) {
          if (linkedPackagingOrders.size === 0) {
            issues.add("PACKAGING_LINK_MISSING");
          } else if (linkedPackagingOrders.size > 1) {
            issues.add("PACKAGING_ORDER_AMBIGUOUS");
          }
          if (packagingOrder) {
            if (
              packagingOrder.orderId !== receipt.orderId ||
              (receipt.orderLotId &&
                packagingOrder.orderLotId !== receipt.orderLotId)
            )
              issues.add("PACKAGING_ORDER_LINK_MISMATCH");
            if (!["RELEASE_READY", "CLOSED"].includes(packagingOrder.status))
              issues.add("PACKAGING_NOT_RELEASE_READY");
            const packagingUnits = packageUnits.filter(
              (unit) => unit.packagingOrderId === packagingOrder.id,
            );
            const hierarchy = evaluatePackagingHierarchy({
              serialIds: [serial.id],
              usedLabelSerialIds: serialLabels
                .filter(
                  (label) =>
                    label.packagingOrderId === packagingOrder.id &&
                    label.status === "USED" &&
                    label.serialId,
                )
                .map((label) => label.serialId!),
              units: packagingUnits.map((unit) => ({
                id: unit.id,
                level: unit.level,
                parentId: unit.parentId,
                serialId: unit.serialId,
              })),
            });
            packagingIssues.push(...hierarchy.issues);
            if (!hierarchy.ready) issues.add("PACKAGING_HIERARCHY_INVALID");
          } else {
            const hierarchy = evaluatePackagingHierarchy({
              serialIds: [serial.id],
              usedLabelSerialIds: [],
              units: [],
            });
            packagingIssues.push(...hierarchy.issues);
          }
          if (packageUnit) {
            const chain: string[] = [];
            const visited = new Set<string>();
            let current: (typeof packageUnits)[number] | undefined =
              packageUnit;
            while (current && !visited.has(current.id) && chain.length < 10) {
              visited.add(current.id);
              chain.unshift(`${current.level}:${current.code}`);
              current = current.parentId
                ? packageUnitsById.get(current.parentId)
                : undefined;
            }
            if (current) issues.add("PACKAGING_HIERARCHY_CYCLE");
            packageHierarchy = chain.join(" > ") || null;
          }
        } else {
          packagingLabel = serialLabels[0] ?? null;
          packageUnit = serialPackageUnits[0] ?? null;
        }

        const sourceEvidence = sourcePaths.map((path) => {
          const review = sourceReviewByLot.get(path.rootLot.id) ?? null;
          const reviewEvidence = jsonObject(review?.evidence);
          const claimedMovementId = text(reviewEvidence.sourceStockMovementId);
          const movement = claimedMovementId
            ? (sourceMovementById.get(claimedMovementId) ?? null)
            : null;
          if (!review) {
            issues.add(
              path.rootLot.sourceTransactionLineId
                ? "UPSTREAM_GENEALOGY_INCOMPLETE"
                : "RAW_SOURCE_REGISTRATION_MISSING",
            );
          } else if (!claimedMovementId) {
            issues.add("RAW_SOURCE_MOVEMENT_LINK_MISSING");
          } else if (!movement) {
            issues.add("RAW_SOURCE_MOVEMENT_NOT_FOUND");
          } else {
            if (movement.voidedAt) issues.add("RAW_SOURCE_MOVEMENT_VOIDED");
            const mismatched = [
              [
                text(reviewEvidence.sourceTransactionType),
                movement.transactionType,
              ],
              [
                text(reviewEvidence.sourceTransactionId),
                movement.transactionId,
              ],
              [
                text(reviewEvidence.sourceTransactionLineId),
                movement.transactionLineId,
              ],
            ].some(([claimed, actual]) => claimed && claimed !== actual);
            if (mismatched) issues.add("RAW_SOURCE_EVIDENCE_MISMATCH");
          }
          const grns =
            movement?.lcInventoryPosting?.lcItem.grnItems.map(
              (entry) => entry.grn,
            ) ?? [];
          return {
            inventoryLotId: path.rootLot.id,
            lotNumber: path.rootLot.lotNumber,
            inventoryItemId: path.rootLot.inventoryItemId,
            itemCode: path.rootLot.inventoryItem.itemCode,
            itemName: path.rootLot.inventoryItem.itemName,
            lotSourceTransactionLineId: path.rootLot.sourceTransactionLineId,
            registrationReviewId: review?.id ?? null,
            registrationDate: iso(review?.transactionDate),
            sourceReference: text(reviewEvidence.sourceReference),
            sourceStockMovementId: claimedMovementId,
            sourceTransactionType:
              movement?.transactionType ??
              text(reviewEvidence.sourceTransactionType),
            sourceTransactionId:
              movement?.transactionId ??
              text(reviewEvidence.sourceTransactionId),
            sourceTransactionLineId:
              movement?.transactionLineId ??
              text(reviewEvidence.sourceTransactionLineId),
            sourceMovementVoidedAt: iso(movement?.voidedAt),
            lcId: movement?.lcInventoryPosting?.lc.id ?? null,
            lcNumber: movement?.lcInventoryPosting?.lc.lcNumber ?? null,
            grns: grns.map((grn) => ({
              id: grn.id,
              grnNumber: grn.grnNumber,
              receivedDate: dateOnly(grn.receivedDate),
            })),
            genealogy: path.edges.map((edge) => ({
              id: edge.id,
              relationship: edge.relationshipType,
              orderId: edge.orderId,
              orderNumber: edge.order.orderNumber,
              orderLotId: edge.orderLotId,
              orderLotNumber: edge.orderLot?.lotNumber ?? null,
              transactionLineId: edge.transactionLineId,
              parentInventoryLotId:
                edge.parentInventoryLotId ??
                edge.parentSerial?.inventoryLotId ??
                null,
              childInventoryLotId:
                edge.childInventoryLotId ??
                edge.childSerial?.inventoryLotId ??
                null,
              quantity: decimalNumber(edge.quantity),
              unit: edge.unit,
            })),
            cycle: path.cycle,
          };
        });
        const pathLotNumbers = sourcePaths.flatMap((path) => [
          path.rootLot.lotNumber,
          ...path.edges.flatMap((edge) => [
            edge.parentInventoryLot?.lotNumber ?? "",
            edge.childInventoryLot?.lotNumber ?? "",
          ]),
        ]);
        if (
          requestedLot &&
          ![finishedLot.lotNumber, ...pathLotNumbers].some((value) =>
            value.toLowerCase().includes(requestedLot),
          )
        )
          continue;
        if (
          query.inventoryItemId &&
          receipt.order.finishedProductId !== query.inventoryItemId &&
          !sourcePaths.some(
            (path) => path.rootLot.inventoryItemId === query.inventoryItemId,
          )
        )
          continue;
        if (
          query.warehouseId &&
          receipt.toWarehouseId !== query.warehouseId &&
          releaseLink?.transaction.toWarehouseId !== query.warehouseId
        )
          continue;
        if (
          query.status &&
          serial?.status !== query.status &&
          releaseLink?.transaction.status !== query.status
        )
          continue;

        const genealogyPaths = sourcePaths.map((path) =>
          [
            path.rootLot.lotNumber,
            ...path.edges.map((edge) => {
              const child =
                edge.childInventoryLot ?? edge.childSerial?.inventoryLot;
              return `${edge.relationshipType} -> ${child?.lotNumber ?? "?"}`;
            }),
          ].join(" -> "),
        );
        const rawSourceLots = sourcePaths
          .map((path) => path.rootLot.lotNumber)
          .join(", ");
        const rawSourceMovements = sourceEvidence
          .flatMap((entry) =>
            entry.sourceStockMovementId ? [entry.sourceStockMovementId] : [],
          )
          .join(", ");
        const rawLcNumbers = sourceEvidence
          .flatMap((entry) => (entry.lcNumber ? [entry.lcNumber] : []))
          .join(", ");
        const rawGrnNumbers = sourceEvidence
          .flatMap((entry) => entry.grns.map((grn) => grn.grnNumber))
          .join(", ");
        const relationships = [
          ...new Set(
            sourcePaths.flatMap((path) =>
              path.edges.map((edge) => edge.relationshipType),
            ),
          ),
        ].join(" > ");
        const row = {
          id: serial?.id ?? line.id,
          traceId: `${line.id}:${serial?.id ?? finishedLot.id}`,
          genealogyId: sourcePaths[0]?.edges.at(-1)?.id ?? null,
          createdAt: iso(receipt.transactionDate),
          relationship: relationships || null,
          orderId: receipt.orderId,
          orderNumber: receipt.order.orderNumber,
          orderLotId: receipt.orderLotId,
          orderLotNumber: receipt.orderLot?.lotNumber ?? null,
          workflowRunId: workflowRun?.id ?? null,
          workflowRunIds:
            orderWorkflowRuns.map((run) => run.id).join(", ") || null,
          workflowRunStatus: workflowRun?.status ?? null,
          workflowDefinitionId: workflowRun?.workflowDefinitionId ?? null,
          workflowDefinitionVersion:
            workflowRun?.workflowDefinitionVersion ?? null,
          finishedProductId: receipt.order.finishedProductId,
          finishedProductCode: receipt.order.finishedProduct.itemCode,
          finishedProduct: receipt.order.finishedProduct.itemName,
          finishedInventoryLotId: finishedLot.id,
          outputItem: receipt.order.finishedProduct.itemName,
          outputLot: finishedLot.lotNumber,
          outputSerial: serial?.serialNumber ?? null,
          serialId: serial?.id ?? null,
          serialTrackingRequired,
          serialStatus: serial?.status ?? null,
          serialReleasedAt: iso(serial?.releasedAt),
          fgrTransactionId: receipt.id,
          fgrTransactionNumber: receipt.transactionNumber,
          fgrTransactionLineId: line.id,
          fgrSerialMovementId: fgrSerialMovement?.id ?? null,
          fgrDate: iso(receipt.transactionDate),
          fgrWarehouseId: receipt.toWarehouseId,
          fgrWarehouse:
            receipt.toWarehouse?.code ?? receipt.toWarehouse?.name ?? null,
          fgrLocationId: receipt.toLocationId,
          fgrLocation:
            receipt.toLocation?.code ?? receipt.toLocation?.name ?? null,
          qaReleaseTransactionId: releaseLink?.transaction.id ?? null,
          qaReleaseTransactionNumber:
            releaseLink?.transaction.transactionNumber ?? null,
          qaReleaseTransactionLineId: releaseLink?.line.id ?? null,
          qaSerialMovementId: qaSerialMovement?.id ?? null,
          qaReleaseDate: iso(releaseLink?.transaction.transactionDate),
          fgRWarehouseId: releaseLink?.transaction.toWarehouseId ?? null,
          fgRWarehouse:
            releaseLink?.transaction.toWarehouse?.code ??
            releaseLink?.transaction.toWarehouse?.name ??
            null,
          fgRLocationId: releaseLink?.transaction.toLocationId ?? null,
          fgRLocation:
            releaseLink?.transaction.toLocation?.code ??
            releaseLink?.transaction.toLocation?.name ??
            null,
          fgRDisposition:
            releaseLink?.transaction.toLocation?.disposition ?? null,
          expectedFgRWarehouseId:
            releaseSettings?.defaultFinishedGoodsReleasedWarehouseId ?? null,
          expectedFgRLocationId:
            releaseSettings?.defaultFinishedGoodsReleaseLocationId ?? null,
          packagingOrderId: packagingOrder?.id ?? null,
          packagingOrderNumber: packagingOrder?.packagingOrderNumber ?? null,
          packagingStatus: packagingOrder?.status ?? null,
          packagingLabelId: packagingLabel?.id ?? null,
          packagingLabelCode: packagingLabel?.labelCode ?? null,
          packagingLabelStatus: packagingLabel?.status ?? null,
          packageUnitId: packageUnit?.id ?? null,
          packageUnitCode: packageUnit?.code ?? null,
          packageUnitLevel: packageUnit?.level ?? null,
          packageHierarchy,
          packagingIssues: packagingIssues.join(" | ") || null,
          rawSourceLotCount: sourcePaths.length,
          rawSourceLots: rawSourceLots || null,
          rawSourceStockMovementIds: rawSourceMovements || null,
          rawLcNumbers: rawLcNumbers || null,
          rawGrnNumbers: rawGrnNumbers || null,
          genealogyPaths: genealogyPaths.join(" | ") || null,
          sourceEvidence: JSON.stringify(sourceEvidence),
          inputItem:
            sourcePaths
              .map((path) => path.rootLot.inventoryItem.itemName)
              .join(", ") || null,
          inputLot: rawSourceLots || null,
          inputSerial:
            sourcePaths
              .flatMap((path) =>
                path.rootLot.serials.map((entry) => entry.serialNumber),
              )
              .join(", ") || null,
          quantity: decimalNumber(line.quantity),
          unit: line.unit,
          traceComplete: issues.size === 0,
          traceIssues: [...issues].join(", ") || null,
        };
        if (
          requestedSearch &&
          ![
            row.orderNumber,
            row.orderLotNumber ?? "",
            row.workflowRunId ?? "",
            row.workflowRunStatus ?? "",
            row.finishedProductCode,
            row.finishedProduct,
            row.outputLot,
            row.outputSerial ?? "",
            row.fgrTransactionNumber,
            row.qaReleaseTransactionNumber ?? "",
            row.fgrWarehouse ?? "",
            row.fgRWarehouse ?? "",
            row.packagingOrderNumber ?? "",
            row.packagingLabelCode ?? "",
            row.packageHierarchy ?? "",
            row.packagingIssues ?? "",
            row.rawSourceLots ?? "",
            row.rawSourceStockMovementIds ?? "",
            row.rawLcNumbers ?? "",
            row.rawGrnNumbers ?? "",
            row.genealogyPaths ?? "",
            row.traceIssues ?? "",
          ].some((value) => value.toLowerCase().includes(requestedSearch))
        )
          continue;
        candidateRows.push(row);
      }
    }
    const rowTruncated = candidateRows.length > limit;
    const result = candidateRows.slice(0, limit);
    const truncated =
      seedTruncated ||
      receiptTruncated ||
      releaseTruncated ||
      workflowTruncated ||
      sourceReviewTruncated ||
      packagingTruncated ||
      graphTruncated ||
      rowTruncated;
    return this.envelope(
      "traceability",
      query,
      [
        { key: "outputSerial", label: "Finished Serial" },
        { key: "serialStatus", label: "Serial Status" },
        { key: "orderNumber", label: "Production Order" },
        { key: "orderLotNumber", label: "Order Lot" },
        { key: "workflowRunId", label: "Workflow Run ID" },
        { key: "workflowRunStatus", label: "Workflow Status" },
        { key: "outputItem", label: "Finished Product" },
        { key: "outputLot", label: "Finished Lot" },
        { key: "fgrTransactionNumber", label: "FGR" },
        { key: "fgrDate", label: "FGR Date", type: "date" },
        { key: "fgrWarehouse", label: "FGR Destination" },
        { key: "qaReleaseTransactionNumber", label: "QA Release" },
        { key: "qaReleaseDate", label: "QA Release Date", type: "date" },
        { key: "fgRWarehouse", label: "FG-R Warehouse" },
        { key: "fgRLocation", label: "FG-R Location" },
        { key: "packagingOrderNumber", label: "Packaging Order" },
        { key: "packagingLabelCode", label: "Used Label" },
        { key: "packageHierarchy", label: "Package Hierarchy" },
        { key: "rawSourceLots", label: "Raw Source Lots" },
        { key: "rawSourceStockMovementIds", label: "Source Movements" },
        { key: "rawLcNumbers", label: "LC" },
        { key: "rawGrnNumbers", label: "GRN" },
        { key: "genealogyPaths", label: "Backward Genealogy" },
        { key: "traceComplete", label: "Trace Complete" },
        { key: "traceIssues", label: "Trace Issues" },
      ],
      result,
      {},
      truncated,
    );
  }
}
