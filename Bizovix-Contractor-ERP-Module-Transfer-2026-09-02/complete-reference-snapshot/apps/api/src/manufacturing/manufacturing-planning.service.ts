import { createHash } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import { PermissionsService } from "../common/services/permissions.service.js";
import {
  ManufacturingItemRole,
  ManufacturingLocationDisposition,
  ManufacturingMakeBuy,
  ManufacturingMrpRunStatus,
  ManufacturingPlanStatus,
  Prisma,
} from "../generated/prisma/index.js";
import { InventoryService } from "../inventory/inventory.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ManufacturingApprovalWorkflowService } from "./manufacturing-approval-workflow.service.js";
import { parseManufacturingElectronicSignaturePolicy } from "./manufacturing-electronic-signature.domain.js";
import {
  issueManufacturingDocumentNumberTx,
  manufacturingEntityIdFromIdempotency,
} from "./manufacturing-document-number.js";
import {
  calculateBomRequirements,
  calculateMaxProducible,
  ManufacturingDomainError,
} from "./domain.js";
import { compileApplicableQualitySpecification } from "./quality-specification.js";
import type {
  CalculateManufacturingMrpDto,
  CancelManufacturingSupplySuggestionDto,
  ConvertManufacturingSupplySuggestionDto,
  CreateManufacturingItemProfileDto,
  CreateManufacturingLocationDto,
  CreateManufacturingPlanDto,
  CreateManufacturingRoutingDto,
  CreateManufacturingRoutingVersionDto,
  CreateManufacturingSupplySuggestionDto,
  ManufacturingPlanningApprovalDto,
  UpdateManufacturingItemProfileDto,
  UpdateManufacturingLocationDto,
} from "./manufacturing-planning.dto.js";

type Db = Prisma.TransactionClient | PrismaService;
type Query = Record<string, string | undefined>;

const ACTIVE_RESERVATION_STATUSES = ["ACTIVE", "PARTIALLY_ISSUED"] as const;
const OPEN_ORDER_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "RESERVED",
  "ISSUED",
  "IN_PRODUCTION",
  "QC_HOLD",
  "QA_RELEASED",
  "COMPLETED",
] as const;
const SUPPLY_SUGGESTION_TYPES = [
  "PURCHASE_REQUISITION",
  "STOCK_TRANSFER",
] as const;
type SupplySuggestionType = (typeof SUPPLY_SUGGESTION_TYPES)[number];
const SUPPLY_WORKFLOW_CODES: Record<SupplySuggestionType, string> = {
  PURCHASE_REQUISITION: "SUGGESTED_PURCHASE_REQUISITION",
  STOCK_TRANSFER: "SUGGESTED_STOCK_TRANSFER",
};
const SUPPLY_REVIEW_INCLUDE = {
  createdBy: { select: { id: true, name: true } },
  approvedBy: { select: { id: true, name: true } },
} as const;

const MANUFACTURING_INVENTORY_CONTROL_CODE = "1210001";

type ManufacturingPreflightLedgerSettings = {
  rawMaterialInventoryAccountId: string | null;
  packagingInventoryAccountId: string | null;
  wipInventoryAccountId: string | null;
  finishedGoodsInventoryAccountId: string | null;
  manufacturingVarianceAccountId: string | null;
  labourClearingAccountId: string | null;
  overheadAbsorptionAccountId: string | null;
  scrapRecoveryAccountId: string | null;
};

type ManufacturingPreflightLedger = {
  id: string;
  code: string;
  level: string;
  status: string;
  nature: string;
  isSystem: boolean;
  isControlAccount: boolean;
};

export function manufacturingPreflightLedgerReadiness(
  settings: ManufacturingPreflightLedgerSettings | null | undefined,
  ledgers: readonly ManufacturingPreflightLedger[],
) {
  const requiredMappingCount = 8;
  if (!settings)
    return {
      ready: false,
      validMappingCount: 0,
      requiredMappingCount,
      message: "Configure all manufacturing ledger mappings.",
    };

  const eligible = ledgers.filter(
    (ledger) => ledger.level === "LEDGER" && ledger.status === "ACTIVE",
  );
  const byId = new Map(eligible.map((ledger) => [ledger.id, ledger]));
  const inventoryControl = eligible.find(
    (ledger) =>
      ledger.code === MANUFACTURING_INVENTORY_CONTROL_CODE &&
      ledger.nature === "ASSET" &&
      ledger.isSystem &&
      ledger.isControlAccount,
  );
  const serverOwnedStockMappings = [
    settings.rawMaterialInventoryAccountId,
    settings.packagingInventoryAccountId,
    settings.finishedGoodsInventoryAccountId,
    settings.scrapRecoveryAccountId,
  ];
  const stockMappingsReady = serverOwnedStockMappings.map((id) =>
    Boolean(inventoryControl && id === inventoryControl.id),
  );
  const wip = settings.wipInventoryAccountId
    ? byId.get(settings.wipInventoryAccountId)
    : null;
  const wipReady = Boolean(
    wip &&
    wip.nature === "ASSET" &&
    !wip.isControlAccount &&
    wip.id !== inventoryControl?.id,
  );
  const manualMappings = [
    settings.manufacturingVarianceAccountId,
    settings.labourClearingAccountId,
    settings.overheadAbsorptionAccountId,
  ];
  const manualMappingsReady = manualMappings.map((id) => {
    const ledger = id ? byId.get(id) : null;
    return Boolean(ledger && !ledger.isControlAccount);
  });
  const mappingChecks = [
    ...stockMappingsReady,
    wipReady,
    ...manualMappingsReady,
  ];
  const validMappingCount = mappingChecks.filter(Boolean).length;
  const ready = validMappingCount === requiredMappingCount;
  const message = ready
    ? "8/8 mappings are valid; server-owned stock roles use protected Inventory Control (1210001)."
    : !inventoryControl
      ? "Protected Inventory Control (1210001) is missing or inactive."
      : stockMappingsReady.some((valid) => !valid)
        ? "RM, packaging, finished goods and stocked scrap must use protected Inventory Control (1210001)."
        : !wipReady
          ? "WIP must use a distinct active non-control ASSET ledger."
          : "Variance, labour clearing and overhead absorption must use active non-control ledgers.";
  return { ready, validMappingCount, requiredMappingCount, message };
}

const PROFILE_INCLUDE = {
  inventoryItem: {
    select: { id: true, itemCode: true, itemName: true, unit: true },
  },
  defaultIssueLocation: {
    select: { id: true, code: true, name: true, warehouseId: true },
  },
  defaultReceiptLocation: {
    select: { id: true, code: true, name: true, warehouseId: true },
  },
} as const;

const LOCATION_INCLUDE = {
  warehouse: { select: { code: true, name: true } },
} as const;

const ROUTING_VERSION_INCLUDE = {
  approvedBy: { select: { id: true, name: true } },
  operations: {
    orderBy: { sequence: "asc" as const },
    include: {
      resourceRequirements: {
        orderBy: { createdAt: "asc" as const },
        include: {
          resource: {
            select: {
              id: true,
              code: true,
              name: true,
              kind: true,
              isActive: true,
              qualificationState: true,
              calibrationState: true,
              maintenanceState: true,
              cleaningState: true,
            },
          },
        },
      },
    },
  },
} as const;

const ROUTING_INCLUDE = {
  finishedProduct: {
    select: { id: true, itemCode: true, itemName: true, unit: true },
  },
  versions: {
    orderBy: { versionNumber: "desc" as const },
    include: ROUTING_VERSION_INCLUDE,
  },
} as const;

const PLAN_INCLUDE = {
  finishedProduct: {
    select: { id: true, itemCode: true, itemName: true, unit: true },
  },
  bomVersion: {
    include: { bom: { select: { id: true, code: true, name: true } } },
  },
  routingVersion: {
    include: { routing: { select: { id: true, code: true, name: true } } },
  },
  lots: { orderBy: { sequence: "asc" as const } },
  approvedBy: { select: { id: true, name: true } },
  _count: { select: { mrpRuns: true, orders: true } },
} as const;

const MRP_INCLUDE = {
  plan: {
    select: {
      id: true,
      planNumber: true,
      plannedQuantity: true,
      finishedProduct: { select: { id: true, itemCode: true, itemName: true } },
    },
  },
  requirements: {
    orderBy: { createdAt: "asc" as const },
    include: {
      inventoryItem: { select: { id: true, itemCode: true, itemName: true } },
    },
  },
} as const;

type ProfileRow = Prisma.ManufacturingItemProfileGetPayload<{
  include: typeof PROFILE_INCLUDE;
}>;
type LocationRow = Prisma.ManufacturingLocationGetPayload<{
  include: typeof LOCATION_INCLUDE;
}>;
type RoutingVersionRow = Prisma.ManufacturingRoutingVersionGetPayload<{
  include: typeof ROUTING_VERSION_INCLUDE;
}>;
type RoutingRow = Prisma.ManufacturingRoutingGetPayload<{
  include: typeof ROUTING_INCLUDE;
}>;
type PlanRow = Prisma.ManufacturingPlanGetPayload<{
  include: typeof PLAN_INCLUDE;
}>;
type MrpRunRow = Prisma.ManufacturingMrpRunGetPayload<{
  include: typeof MRP_INCLUDE;
}>;
type SupplyReviewRow = Prisma.ManufacturingWorkflowReviewGetPayload<{
  include: typeof SUPPLY_REVIEW_INCLUDE;
}>;

function decimal(
  value: Prisma.Decimal.Value | null | undefined,
): Prisma.Decimal {
  return new Prisma.Decimal(value ?? 0);
}

function number(value: Prisma.Decimal.Value | null | undefined): number {
  return decimal(value).toNumber();
}

function iso(value: Date | string | null | undefined): string | null {
  return value ? new Date(value).toISOString() : null;
}

function dateOnly(value: Date | string | null | undefined): string | null {
  return value ? new Date(value).toISOString().slice(0, 10) : null;
}

function asDate(value: string, label = "date"): Date {
  const result = new Date(value);
  if (Number.isNaN(result.getTime()))
    throw new BadRequestException(`${label} is invalid.`);
  return result;
}

function utcBusinessDate(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function isWithinEffectivePeriod(
  value: Date,
  effectiveFrom: Date | null,
  effectiveTo: Date | null,
) {
  return (
    (!effectiveFrom || value >= utcBusinessDate(effectiveFrom)) &&
    (!effectiveTo || value <= utcBusinessDate(effectiveTo))
  );
}

/** A date-only MRP snapshot means the end of that business date, not 00:00. */
function asOfDate(value: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? asDate(`${value}T23:59:59.999+06:00`, "asOfDate")
    : asDate(value, "asOfDate");
}

function cleanText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeCode(value: string, label: string): string {
  const code = value.trim().toUpperCase().replace(/\s+/g, "-");
  if (!code) throw new BadRequestException(`${label} is required.`);
  if (code.length > 80)
    throw new BadRequestException(`${label} cannot exceed 80 characters.`);
  if (!/^[A-Z0-9][A-Z0-9._/-]*$/.test(code)) {
    throw new BadRequestException(
      `${label} may contain letters, numbers, dot, underscore, slash and hyphen only.`,
    );
  }
  return code;
}

function compactReference(prefix: string, seed: string): string {
  return `${prefix}-${createHash("sha256").update(seed).digest("hex").slice(0, 16).toUpperCase()}`;
}

function isUniqueError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "P2002",
  );
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function maxZero(value: Prisma.Decimal): Prisma.Decimal {
  return value.lessThan(0) ? new Prisma.Decimal(0) : value;
}

function enumQuery<T extends string>(
  value: string | undefined,
  allowed: Readonly<Record<string, T>>,
  label: string,
): T | undefined {
  if (!value) return undefined;
  const values = Object.values(allowed);
  if (!values.includes(value as T)) {
    throw new BadRequestException(
      `${label} must be one of: ${values.join(", ")}.`,
    );
  }
  return value as T;
}

@Injectable()
export class ManufacturingPlanningService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PermissionsService)
    private readonly permissions: PermissionsService,
    @Inject(ManufacturingApprovalWorkflowService)
    private readonly approvalWorkflow: ManufacturingApprovalWorkflowService,
    @Inject(InventoryService)
    private readonly inventory: InventoryService,
  ) {}

  private async scope(
    currentUser: AuthenticatedRequestUser,
    requestedWorkspaceId?: string,
  ) {
    const workspaceId = requestedWorkspaceId || currentUser.workspaceId;
    if (!workspaceId || !currentUser.workspaceId)
      throw new BadRequestException("An active workspace is required.");
    if (workspaceId !== currentUser.workspaceId) {
      throw new ForbiddenException(
        "Cross-workspace manufacturing access is not allowed.",
      );
    }
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

  private async serializable<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const retryable =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2034";
        if (!retryable || attempt === 3) throw error;
      }
    }
    throw new ConflictException(
      "The planning operation could not be serialized after three attempts.",
    );
  }

  private async activeItem(
    db: Db,
    workspaceId: string,
    inventoryItemId: string,
    label: string,
  ) {
    const item = await db.inventoryItem.findFirst({
      where: {
        id: inventoryItemId,
        workspaceId,
        status: "ACTIVE",
        kind: "PRODUCT",
      },
      select: {
        id: true,
        itemCode: true,
        itemName: true,
        unit: true,
        kind: true,
        status: true,
      },
    });
    if (!item)
      throw new BadRequestException(
        `${label} must be an active inventory product in this workspace.`,
      );
    return item;
  }

  private async activeWarehouse(
    db: Db,
    workspaceId: string,
    warehouseId: string,
    label: string,
  ) {
    const warehouse = await db.warehouse.findFirst({
      where: { id: warehouseId, workspaceId, isActive: true, deletedAt: null },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        allowMaterialIssue: true,
      },
    });
    if (!warehouse)
      throw new BadRequestException(
        `${label} must be an active warehouse in this workspace.`,
      );
    return warehouse;
  }

  private async activeLocation(
    db: Db,
    workspaceId: string,
    locationId: string,
    label: string,
  ) {
    const location = await db.manufacturingLocation.findFirst({
      where: {
        id: locationId,
        workspaceId,
        isActive: true,
        warehouse: { isActive: true, deletedAt: null },
      },
      include: { warehouse: { select: { id: true, code: true, name: true } } },
    });
    if (!location)
      throw new BadRequestException(
        `${label} must be an active manufacturing location in this workspace.`,
      );
    return location;
  }

  private mapProfile(row: ProfileRow) {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      inventoryItemId: row.inventoryItemId,
      itemCode: row.inventoryItem?.itemCode ?? null,
      itemName: row.inventoryItem?.itemName ?? null,
      unit: row.inventoryItem?.unit ?? null,
      role: row.role,
      makeBuy: row.makeBuy,
      lotTracked: row.lotTracked,
      serialTracked: row.serialTracked,
      expiryTracked: row.expiryTracked,
      qcRequired: row.qcRequired,
      shelfLifeDays: row.shelfLifeDays,
      standardYieldPercent: number(row.standardYieldPercent),
      defaultIssueLocation: row.defaultIssueLocation
        ? {
            id: row.defaultIssueLocation.id,
            code: row.defaultIssueLocation.code,
            name: row.defaultIssueLocation.name,
            warehouseId: row.defaultIssueLocation.warehouseId,
          }
        : null,
      defaultReceiptLocation: row.defaultReceiptLocation
        ? {
            id: row.defaultReceiptLocation.id,
            code: row.defaultReceiptLocation.code,
            name: row.defaultReceiptLocation.name,
            warehouseId: row.defaultReceiptLocation.warehouseId,
          }
        : null,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private profileInclude() {
    return PROFILE_INCLUDE;
  }

  async listItemProfiles(currentUser: AuthenticatedRequestUser, query: Query) {
    const scope = await this.scope(currentUser, query.workspaceId);
    const role = enumQuery(query.role, ManufacturingItemRole, "role");
    const makeBuy = enumQuery(query.makeBuy, ManufacturingMakeBuy, "makeBuy");
    const rows = await this.prisma.manufacturingItemProfile.findMany({
      where: {
        workspaceId: scope.id,
        ...(role ? { role } : {}),
        ...(makeBuy ? { makeBuy } : {}),
        ...(query.active === "true"
          ? { isActive: true }
          : query.active === "false"
            ? { isActive: false }
            : {}),
        ...(query.search
          ? {
              inventoryItem: {
                OR: [
                  { itemCode: { contains: query.search, mode: "insensitive" } },
                  { itemName: { contains: query.search, mode: "insensitive" } },
                ],
              },
            }
          : {}),
      },
      include: this.profileInclude(),
      orderBy: [{ role: "asc" }, { inventoryItem: { itemName: "asc" } }],
    });
    return rows.map((row) => this.mapProfile(row));
  }

  private async validateProfileLocations(
    db: Db,
    workspaceId: string,
    issueLocationId?: string | null,
    receiptLocationId?: string | null,
  ) {
    const issue = issueLocationId
      ? await this.activeLocation(
          db,
          workspaceId,
          issueLocationId,
          "Default issue location",
        )
      : null;
    const receipt = receiptLocationId
      ? await this.activeLocation(
          db,
          workspaceId,
          receiptLocationId,
          "Default receipt location",
        )
      : null;
    return { issue, receipt };
  }

  private validateShelfLife(
    expiryTracked: boolean,
    shelfLifeDays: number | null | undefined,
  ) {
    if (expiryTracked && !shelfLifeDays) {
      throw new BadRequestException(
        "Shelf-life days are required when expiry tracking is enabled.",
      );
    }
  }

  async createItemProfile(
    currentUser: AuthenticatedRequestUser,
    dto: CreateManufacturingItemProfileDto,
  ) {
    const scope = await this.scope(currentUser, dto.workspaceId);
    await this.activeItem(
      this.prisma,
      scope.id,
      dto.inventoryItemId,
      "Inventory item",
    );
    await this.validateProfileLocations(
      this.prisma,
      scope.id,
      dto.defaultIssueLocationId,
      dto.defaultReceiptLocationId,
    );
    this.validateShelfLife(Boolean(dto.expiryTracked), dto.shelfLifeDays);
    try {
      const row = await this.prisma.$transaction(
        (tx) =>
          tx.manufacturingItemProfile.create({
            data: {
              tenantId: scope.tenantId,
              companyId: scope.companyId,
              workspaceId: scope.id,
              inventoryItemId: dto.inventoryItemId,
              role: dto.role,
              makeBuy:
                dto.makeBuy ?? (dto.role === "FINISHED_GOOD" ? "MAKE" : "BUY"),
              lotTracked: dto.lotTracked ?? false,
              serialTracked: dto.serialTracked ?? false,
              expiryTracked: dto.expiryTracked ?? false,
              qcRequired: dto.qcRequired ?? false,
              shelfLifeDays: dto.shelfLifeDays ?? null,
              standardYieldPercent: dto.standardYieldPercent ?? 100,
              defaultIssueLocationId: dto.defaultIssueLocationId ?? null,
              defaultReceiptLocationId: dto.defaultReceiptLocationId ?? null,
              isActive: dto.isActive ?? true,
              createdByUserId: currentUser.id,
            },
            include: this.profileInclude(),
          }),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return this.mapProfile(row);
    } catch (error) {
      if (isUniqueError(error))
        throw new ConflictException(
          "This inventory item already has a manufacturing profile.",
        );
      throw error;
    }
  }

  async updateItemProfile(
    currentUser: AuthenticatedRequestUser,
    profileId: string,
    dto: UpdateManufacturingItemProfileDto,
  ) {
    await this.requirePermission(currentUser, "manufacturing.master.manage");
    const scope = await this.scope(currentUser, dto.workspaceId);
    const existing = await this.prisma.manufacturingItemProfile.findFirst({
      where: { id: profileId, workspaceId: scope.id },
    });
    if (!existing)
      throw new NotFoundException("Manufacturing item profile not found.");
    await this.validateProfileLocations(
      this.prisma,
      scope.id,
      dto.defaultIssueLocationId,
      dto.defaultReceiptLocationId,
    );
    const expiryTracked = dto.expiryTracked ?? existing.expiryTracked;
    const shelfLifeDays =
      dto.shelfLifeDays === undefined
        ? existing.shelfLifeDays
        : dto.shelfLifeDays;
    this.validateShelfLife(expiryTracked, shelfLifeDays);

    if (dto.isActive === false && existing.isActive) {
      const [activeFinishedOrders, activeMaterialOrders] = await Promise.all([
        this.prisma.manufacturingOrder.count({
          where: {
            workspaceId: scope.id,
            finishedProductId: existing.inventoryItemId,
            status: { in: [...OPEN_ORDER_STATUSES] },
          },
        }),
        this.prisma.manufacturingOrderMaterial.count({
          where: {
            inventoryItemId: existing.inventoryItemId,
            order: {
              workspaceId: scope.id,
              status: { in: [...OPEN_ORDER_STATUSES] },
            },
          },
        }),
      ]);
      if (activeFinishedOrders + activeMaterialOrders > 0) {
        throw new BadRequestException(
          "This profile is used by an open manufacturing order and cannot be deactivated.",
        );
      }
    }

    const row = await this.prisma.$transaction(
      (tx) =>
        tx.manufacturingItemProfile.update({
          where: { id: existing.id },
          data: {
            ...(dto.role !== undefined ? { role: dto.role } : {}),
            ...(dto.makeBuy !== undefined ? { makeBuy: dto.makeBuy } : {}),
            ...(dto.lotTracked !== undefined
              ? { lotTracked: dto.lotTracked }
              : {}),
            ...(dto.serialTracked !== undefined
              ? { serialTracked: dto.serialTracked }
              : {}),
            ...(dto.expiryTracked !== undefined
              ? { expiryTracked: dto.expiryTracked }
              : {}),
            ...(dto.qcRequired !== undefined
              ? { qcRequired: dto.qcRequired }
              : {}),
            ...(dto.shelfLifeDays !== undefined
              ? { shelfLifeDays: dto.shelfLifeDays }
              : {}),
            ...(dto.standardYieldPercent !== undefined
              ? { standardYieldPercent: dto.standardYieldPercent }
              : {}),
            ...(dto.defaultIssueLocationId !== undefined
              ? { defaultIssueLocationId: dto.defaultIssueLocationId }
              : {}),
            ...(dto.defaultReceiptLocationId !== undefined
              ? { defaultReceiptLocationId: dto.defaultReceiptLocationId }
              : {}),
            ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          },
          include: this.profileInclude(),
        }),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.mapProfile(row);
  }

  private mapLocation(row: LocationRow) {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      warehouseId: row.warehouseId,
      warehouseCode: row.warehouse?.code ?? null,
      warehouseName: row.warehouse?.name ?? null,
      code: row.code,
      name: row.name,
      disposition: row.disposition,
      description: row.description,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async listLocations(currentUser: AuthenticatedRequestUser, query: Query) {
    const scope = await this.scope(currentUser, query.workspaceId);
    const disposition = enumQuery(
      query.disposition,
      ManufacturingLocationDisposition,
      "disposition",
    );
    const rows = await this.prisma.manufacturingLocation.findMany({
      where: {
        workspaceId: scope.id,
        ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
        ...(disposition ? { disposition } : {}),
        ...(query.active === "true"
          ? { isActive: true }
          : query.active === "false"
            ? { isActive: false }
            : {}),
        ...(query.search
          ? {
              OR: [
                { code: { contains: query.search, mode: "insensitive" } },
                { name: { contains: query.search, mode: "insensitive" } },
                {
                  warehouse: {
                    name: { contains: query.search, mode: "insensitive" },
                  },
                },
              ],
            }
          : {}),
      },
      include: LOCATION_INCLUDE,
      orderBy: [{ warehouse: { name: "asc" } }, { code: "asc" }],
    });
    return rows.map((row) => this.mapLocation(row));
  }

  async createLocation(
    currentUser: AuthenticatedRequestUser,
    dto: CreateManufacturingLocationDto,
  ) {
    await this.requirePermission(currentUser, "manufacturing.master.manage");
    const scope = await this.scope(currentUser, dto.workspaceId);
    const warehouse = await this.activeWarehouse(
      this.prisma,
      scope.id,
      dto.warehouseId,
      "Warehouse",
    );
    try {
      const row = await this.prisma.$transaction(
        (tx) =>
          tx.manufacturingLocation.create({
            data: {
              tenantId: scope.tenantId,
              companyId: scope.companyId,
              workspaceId: scope.id,
              warehouseId: warehouse.id,
              code: normalizeCode(dto.code, "Location code"),
              name: dto.name.trim(),
              disposition: dto.disposition,
              description: cleanText(dto.description),
              isActive: dto.isActive ?? true,
              createdByUserId: currentUser.id,
            },
            include: LOCATION_INCLUDE,
          }),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return this.mapLocation(row);
    } catch (error) {
      if (isUniqueError(error)) {
        throw new ConflictException(
          "A location with this code or name already exists in the selected warehouse.",
        );
      }
      throw error;
    }
  }

  async updateLocation(
    currentUser: AuthenticatedRequestUser,
    locationId: string,
    dto: UpdateManufacturingLocationDto,
  ) {
    await this.requirePermission(currentUser, "manufacturing.master.manage");
    const scope = await this.scope(currentUser, dto.workspaceId);
    const existing = await this.prisma.manufacturingLocation.findFirst({
      where: { id: locationId, workspaceId: scope.id },
    });
    if (!existing)
      throw new NotFoundException("Manufacturing location not found.");
    if (dto.isActive === false && existing.isActive) {
      const [settingsUse, openOrders, activeReservations] = await Promise.all([
        this.prisma.manufacturingSettings.count({
          where: {
            workspaceId: scope.id,
            OR: [
              { defaultRawMaterialLocationId: existing.id },
              { defaultWipLocationId: existing.id },
              { defaultFinishedGoodsHoldLocationId: existing.id },
              { defaultFinishedGoodsReleaseLocationId: existing.id },
            ],
          },
        }),
        this.prisma.manufacturingOrder.count({
          where: {
            workspaceId: scope.id,
            status: { in: [...OPEN_ORDER_STATUSES] },
            OR: [
              { issueLocationId: existing.id },
              { receiptLocationId: existing.id },
            ],
          },
        }),
        this.prisma.manufacturingReservation.count({
          where: {
            workspaceId: scope.id,
            locationId: existing.id,
            status: { in: [...ACTIVE_RESERVATION_STATUSES] },
          },
        }),
      ]);
      if (settingsUse + openOrders + activeReservations > 0) {
        throw new BadRequestException(
          "This location is mapped to manufacturing settings or an open transaction and cannot be deactivated.",
        );
      }
    }
    try {
      const row = await this.prisma.$transaction(
        (tx) =>
          tx.manufacturingLocation.update({
            where: { id: existing.id },
            data: {
              ...(dto.code !== undefined
                ? { code: normalizeCode(dto.code, "Location code") }
                : {}),
              ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
              ...(dto.disposition !== undefined
                ? { disposition: dto.disposition }
                : {}),
              ...(dto.description !== undefined
                ? { description: cleanText(dto.description) }
                : {}),
              ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
            },
            include: LOCATION_INCLUDE,
          }),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return this.mapLocation(row);
    } catch (error) {
      if (isUniqueError(error)) {
        throw new ConflictException(
          "A location with this code or name already exists in this warehouse.",
        );
      }
      throw error;
    }
  }

  private routingInclude() {
    return ROUTING_INCLUDE;
  }

  private mapRoutingVersion(row: RoutingVersionRow) {
    return {
      id: row.id,
      routingId: row.routingId,
      versionNumber: row.versionNumber,
      status: row.status,
      effectiveFrom: dateOnly(row.effectiveFrom),
      effectiveTo: dateOnly(row.effectiveTo),
      changeReason: row.changeReason,
      approvedBy: row.approvedBy
        ? { id: row.approvedBy.id, name: row.approvedBy.name }
        : null,
      approvedAt: iso(row.approvedAt),
      operations: row.operations.map((operation) => ({
        id: operation.id,
        sequence: operation.sequence,
        code: operation.code,
        name: operation.name,
        workCenterCode: operation.workCenterCode,
        productionLineCode: operation.productionLineCode,
        setupMinutes: number(operation.setupMinutes),
        runMinutesPerUnit: number(operation.runMinutesPerUnit),
        queueMinutes: number(operation.queueMinutes),
        isSubcontracted: operation.isSubcontracted,
        qcRequired: operation.qcRequired,
        instructions: operation.instructions,
        responsibleUserId: operation.responsibleUserId,
        resourceRequirements: operation.resourceRequirements.map(
          (requirement) => ({
            id: requirement.id,
            resourceId: requirement.resourceId,
            requiredUnits: requirement.requiredUnits,
            capacityMultiplier: number(requirement.capacityMultiplier),
            isMandatory: requirement.isMandatory,
            note: requirement.note,
            resource: requirement.resource,
          }),
        ),
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapRouting(row: RoutingRow) {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      code: row.code,
      name: row.name,
      finishedProductId: row.finishedProductId,
      finishedProduct: row.finishedProduct
        ? {
            id: row.finishedProduct.id,
            itemCode: row.finishedProduct.itemCode,
            itemName: row.finishedProduct.itemName,
            unit: row.finishedProduct.unit,
          }
        : null,
      description: row.description,
      isActive: row.isActive,
      versions: row.versions.map((version) => this.mapRoutingVersion(version)),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async listRoutings(currentUser: AuthenticatedRequestUser, query: Query) {
    const scope = await this.scope(currentUser, query.workspaceId);
    const rows = await this.prisma.manufacturingRouting.findMany({
      where: {
        workspaceId: scope.id,
        ...(query.finishedProductId
          ? { finishedProductId: query.finishedProductId }
          : {}),
        ...(query.active === "false"
          ? { isActive: false }
          : query.active === "all"
            ? {}
            : { isActive: true }),
        ...(query.search
          ? {
              OR: [
                { code: { contains: query.search, mode: "insensitive" } },
                { name: { contains: query.search, mode: "insensitive" } },
                {
                  finishedProduct: {
                    itemName: { contains: query.search, mode: "insensitive" },
                  },
                },
              ],
            }
          : {}),
      },
      include: this.routingInclude(),
      orderBy: { updatedAt: "desc" },
    });
    return rows.map((row) => this.mapRouting(row));
  }

  async listRoutingAssignees(
    currentUser: AuthenticatedRequestUser,
    query: Query,
  ) {
    const scope = await this.scope(currentUser, query.workspaceId);
    const members = await this.prisma.workspaceMember.findMany({
      where: { workspaceId: scope.id },
      select: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { user: { name: "asc" } },
    });
    return members.map(({ user }) => user);
  }

  async runPreflight(currentUser: AuthenticatedRequestUser, query: Query) {
    const scope = await this.scope(currentUser, query.workspaceId);
    const quantity = Number(query.quantity ?? 1);
    if (!Number.isFinite(quantity) || quantity <= 0)
      throw new BadRequestException(
        "Preflight quantity must be greater than zero.",
      );
    const asOf = query.asOf ? asDate(query.asOf, "asOf") : new Date();
    const profile = await this.prisma.manufacturingItemProfile.findFirst({
      where: {
        workspaceId: scope.id,
        isActive: true,
        role: "FINISHED_GOOD",
        makeBuy: { in: ["MAKE", "BOTH"] },
        ...(query.finishedProductId
          ? { inventoryItemId: query.finishedProductId }
          : {}),
      },
      include: {
        inventoryItem: {
          select: { id: true, itemCode: true, itemName: true, unit: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });
    const checks: Array<{
      code: string;
      label: string;
      state: "READY" | "BLOCKED" | "WARNING";
      message: string;
      actionGroup: string;
      actionView: string;
    }> = [];
    const add = (
      code: string,
      label: string,
      ready: boolean,
      message: string,
      actionGroup: string,
      actionView: string,
      warning = false,
    ) =>
      checks.push({
        code,
        label,
        state: ready ? "READY" : warning ? "WARNING" : "BLOCKED",
        message,
        actionGroup,
        actionView,
      });
    add(
      "FINISHED_PROFILE",
      "Finished-product profile",
      Boolean(profile),
      profile
        ? `${profile.inventoryItem.itemCode} — ${profile.inventoryItem.itemName}`
        : "Create/select an active MAKE/BOTH finished-product profile.",
      "MASTERS_FORMULA",
      "manufactured-products",
    );
    if (!profile)
      return {
        ready: false,
        finishedProduct: null,
        quantity,
        asOf: asOf.toISOString(),
        sourceWarehouseId: query.sourceWarehouseId ?? null,
        checks,
        blockerCount: 1,
        warningCount: 0,
      };
    const effective = {
      status: "APPROVED" as const,
      OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: asOf } }],
      AND: [{ OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }] }],
    };
    const [
      settings,
      bom,
      routing,
      sequences,
      governance,
      qualitySpec,
      serialRule,
      packagingConfig,
    ] = await Promise.all([
      this.prisma.manufacturingSettings.findUnique({
        where: { workspaceId: scope.id },
      }),
      this.prisma.manufacturingBom.findFirst({
        where: {
          workspaceId: scope.id,
          finishedProductId: profile.inventoryItemId,
          isActive: true,
          versions: { some: effective },
        },
        include: {
          versions: {
            where: effective,
            orderBy: { versionNumber: "desc" },
            take: 1,
            include: {
              components: {
                include: {
                  inventoryItem: { select: { itemCode: true, itemName: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.manufacturingRouting.findFirst({
        where: {
          workspaceId: scope.id,
          finishedProductId: profile.inventoryItemId,
          isActive: true,
          versions: { some: effective },
        },
        include: {
          versions: {
            where: effective,
            orderBy: { versionNumber: "desc" },
            take: 1,
            include: {
              operations: { include: { resourceRequirements: true } },
            },
          },
        },
      }),
      this.prisma.manufacturingDocumentSequence.findMany({
        where: { workspaceId: scope.id, isActive: true },
        select: {
          documentKind: true,
          prefix: true,
          padding: true,
          resetPeriod: true,
        },
      }),
      this.prisma.manufacturingControlRecord.findMany({
        where: {
          workspaceId: scope.id,
          kind: { in: ["APPROVAL_WORKFLOW", "ELECTRONIC_SIGNATURE_POLICY"] },
          status: "APPROVED",
        },
        orderBy: [{ approvedAt: "desc" }, { versionNumber: "desc" }],
        select: { kind: true, payload: true },
      }),
      this.prisma.manufacturingControlRecord.findFirst({
        where: {
          workspaceId: scope.id,
          kind: "QUALITY_SPECIFICATION",
          inventoryItemId: profile.inventoryItemId,
          status: "APPROVED",
          OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: asOf } }],
          AND: [
            { OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }] },
          ],
        },
        orderBy: { versionNumber: "desc" },
      }),
      this.prisma.manufacturingSerialRule.findFirst({
        where: {
          workspaceId: scope.id,
          inventoryItemId: profile.inventoryItemId,
          status: "ACTIVE",
        },
      }),
      this.prisma.manufacturingControlRecord.findFirst({
        where: {
          workspaceId: scope.id,
          kind: "PACKAGING_CONFIGURATION",
          inventoryItemId: profile.inventoryItemId,
          status: "APPROVED",
        },
        include: {
          lines: {
            include: {
              inventoryItem: { select: { itemCode: true, itemName: true } },
            },
          },
        },
        orderBy: { versionNumber: "desc" },
      }),
    ]);
    const bomVersion = bom?.versions[0];
    const routingVersion = routing?.versions[0];
    add(
      "APPROVED_BOM",
      "Approved effective BOM",
      Boolean(bomVersion),
      bomVersion
        ? `${bom!.code} v${bomVersion.versionNumber}`
        : "No approved date-effective BOM exists.",
      "MASTERS_FORMULA",
      "bom-master-formula",
    );
    const routingReady = Boolean(
      routingVersion?.operations.length &&
      routingVersion.operations.every(
        (op) => op.responsibleUserId && op.resourceRequirements.length,
      ),
    );
    add(
      "APPROVED_ROUTING",
      "Approved routing ownership/resources",
      routingReady,
      routingVersion
        ? routingReady
          ? `${routing!.code} v${routingVersion.versionNumber}; every operation has an owner and resource.`
          : "Approved routing has an operation without a responsible user or resource."
        : "No approved date-effective routing exists.",
      "MASTERS_FORMULA",
      "production-routing",
    );
    const configuredLocationIds = settings
      ? ([
          settings.defaultRawMaterialLocationId,
          settings.defaultWipLocationId,
          settings.defaultFinishedGoodsHoldLocationId,
          settings.defaultFinishedGoodsReleaseLocationId,
        ].filter(Boolean) as string[])
      : [];
    const configuredLocations = configuredLocationIds.length
      ? await this.prisma.manufacturingLocation.findMany({
          where: {
            workspaceId: scope.id,
            id: { in: configuredLocationIds },
            isActive: true,
          },
          select: { id: true, disposition: true },
        })
      : [];
    const dispositionById = new Map(
      configuredLocations.map((location) => [
        location.id,
        location.disposition,
      ]),
    );
    const locationMappings = Boolean(
      settings?.defaultRawMaterialWarehouseId &&
      settings.defaultWipWarehouseId &&
      settings.defaultFinishedGoodsWarehouseId &&
      settings.defaultFinishedGoodsReleasedWarehouseId &&
      settings.defaultRawMaterialLocationId &&
      dispositionById.get(settings.defaultRawMaterialLocationId) ===
        "RELEASED" &&
      settings.defaultWipLocationId &&
      dispositionById.get(settings.defaultWipLocationId) === "WIP" &&
      settings.defaultFinishedGoodsHoldLocationId &&
      dispositionById.get(settings.defaultFinishedGoodsHoldLocationId) ===
        "QC_HOLD" &&
      settings.defaultFinishedGoodsReleaseLocationId &&
      dispositionById.get(settings.defaultFinishedGoodsReleaseLocationId) ===
        "RELEASED",
    );
    add(
      "WAREHOUSE_LOCATIONS",
      "RM / WIP / FG-Q / FG-R mappings",
      locationMappings,
      locationMappings
        ? "Physical warehouses and logical locations are mapped."
        : "Configure all RM, WIP, finished-goods hold and released warehouse/location mappings.",
      "SETUP_WORKFLOW_AUDIT",
      "manufacturing-settings",
    );
    const ledgerIds = settings
      ? ([
          settings.rawMaterialInventoryAccountId,
          settings.packagingInventoryAccountId,
          settings.wipInventoryAccountId,
          settings.finishedGoodsInventoryAccountId,
          settings.manufacturingVarianceAccountId,
          settings.labourClearingAccountId,
          settings.overheadAbsorptionAccountId,
          settings.scrapRecoveryAccountId,
        ].filter(Boolean) as string[])
      : [];
    const configuredLedgers = ledgerIds.length
      ? await this.prisma.account.findMany({
          where: {
            companyId: scope.companyId,
            id: { in: [...new Set(ledgerIds)] },
          },
          select: {
            id: true,
            code: true,
            level: true,
            status: true,
            nature: true,
            isSystem: true,
            isControlAccount: true,
          },
        })
      : [];
    const ledgerReadiness = manufacturingPreflightLedgerReadiness(
      settings,
      configuredLedgers,
    );
    add(
      "LEDGERS",
      "Manufacturing ledgers",
      ledgerReadiness.ready,
      ledgerReadiness.message,
      "SETUP_WORKFLOW_AUDIT",
      "manufacturing-settings",
    );
    const requiredDocuments = [
      "BOM",
      "PRODUCTION_PLAN",
      "PRODUCTION_ORDER",
      "MATERIAL_REQUISITION",
      "MATERIAL_ISSUE",
      "MATERIAL_RETURN",
      "QC_INSPECTION",
      "PACKAGING_ORDER",
      "FINISHED_GOODS_RECEIPT",
      "QA_RELEASE",
    ];
    const sequenceByKind = new Map(
      sequences.map((row) => [row.documentKind, row]),
    );
    const missingSequences = requiredDocuments.filter(
      (kind) => !sequenceByKind.has(kind as never),
    );
    const exactMonthlyPrefixes: Record<string, string> = {
      BOM: "BOM",
      PRODUCTION_ORDER: "MO",
      MATERIAL_ISSUE: "MI",
      QC_INSPECTION: "QC",
      FINISHED_GOODS_RECEIPT: "FGR",
    };
    const invalidCoreSequences = Object.entries(exactMonthlyPrefixes)
      .filter(([kind, expectedPrefix]) => {
        const sequence = sequenceByKind.get(kind as never);
        return (
          !sequence ||
          sequence.resetPeriod !== "MONTHLY" ||
          sequence.padding < 4 ||
          sequence.prefix.replace(/[-_/\s]+$/g, "").toUpperCase() !==
            expectedPrefix
        );
      })
      .map(([kind]) => kind);
    const numberingReady =
      missingSequences.length === 0 && invalidCoreSequences.length === 0;
    add(
      "DOCUMENT_SEQUENCES",
      "Document numbering",
      numberingReady,
      !numberingReady
        ? `${missingSequences.length ? `Missing: ${missingSequences.join(", ")}. ` : ""}${invalidCoreSequences.length ? `Require monthly YYYY-MM, expected prefix and padding ≥4: ${invalidCoreSequences.join(", ")}.` : ""}`
        : "All required sequences exist; BOM/MO/MI/QC/FGR use monthly YYYY-MM numbering with valid prefix/padding.",
      "SETUP_WORKFLOW_AUDIT",
      "document-numbering",
    );
    const governanceKinds = new Set(governance.map((row) => row.kind));
    const electronicSignatureRecord = governance.find(
      (row) => row.kind === "ELECTRONIC_SIGNATURE_POLICY",
    );
    const electronicSignaturePolicy = electronicSignatureRecord
      ? parseManufacturingElectronicSignaturePolicy(
          electronicSignatureRecord.payload,
        )
      : null;
    const electronicSignaturePolicyBlocked = Boolean(
      electronicSignatureRecord &&
      (!electronicSignaturePolicy || electronicSignaturePolicy.mfaRequired),
    );
    const governanceReady =
      (!settings?.approvalRequired ||
        governanceKinds.has("APPROVAL_WORKFLOW")) &&
      (!settings?.electronicSignatureRequired ||
        Boolean(electronicSignaturePolicy)) &&
      !electronicSignaturePolicyBlocked;
    const governanceMessage = electronicSignaturePolicyBlocked
      ? electronicSignaturePolicy?.mfaRequired
        ? "Approved electronic-signature policy requires MFA, but manufacturing MFA verification is not configured; signed actions are blocked."
        : "Approved electronic-signature policy is invalid; correct and reapprove it before signed actions."
      : governanceReady
        ? "Required approved governance controls exist and the e-sign policy is executable."
        : "Approve the required workflow and executable electronic-signature policy.";
    add(
      "GOVERNANCE",
      "Approval and e-sign governance",
      governanceReady,
      governanceMessage,
      "SETUP_WORKFLOW_AUDIT",
      "approval-workflow",
    );
    let qualityReady = !profile.qcRequired;
    let qualityMessage = profile.qcRequired
      ? "No approved date-effective quality specification exists."
      : "QC is not required by this product profile.";
    if (qualitySpec) {
      const payload = qualitySpec.payload as {
        parameters?: Array<{ testMethodRecordId?: string }>;
      };
      const methodIds = [
        ...new Set(
          (payload.parameters ?? [])
            .map((parameter) => parameter.testMethodRecordId)
            .filter(Boolean) as string[],
        ),
      ];
      const methods = await this.prisma.manufacturingControlRecord.findMany({
        where: {
          workspaceId: scope.id,
          id: { in: methodIds },
          kind: "TEST_METHOD",
          status: "APPROVED",
        },
        select: {
          id: true,
          code: true,
          name: true,
          versionNumber: true,
          status: true,
        },
      });
      try {
        const compiled = compileApplicableQualitySpecification(
          qualitySpec,
          methods,
        );
        qualityReady = compiled.parameters.length > 0;
        qualityMessage = `${qualitySpec.code} v${qualitySpec.versionNumber}; ${compiled.parameters.length} approved method-backed parameter(s).`;
      } catch (error) {
        qualityMessage =
          error instanceof Error
            ? error.message
            : "Quality specification is invalid.";
      }
    }
    add(
      "QUALITY",
      "QC specification and methods",
      qualityReady,
      qualityMessage,
      "MASTERS_FORMULA",
      "quality-specifications",
    );
    add(
      "SERIAL_RULE",
      "Active serial rule",
      !profile.serialTracked || Boolean(serialRule),
      profile.serialTracked
        ? serialRule
          ? `${serialRule.code} is active.`
          : "Serial tracking is enabled but no active serial rule exists."
        : "Serial tracking is not required by this product profile.",
      "PACKAGING_RELEASE",
      "serialisation",
    );
    add(
      "PACKAGING_CONFIG",
      "Approved packaging configuration",
      Boolean(packagingConfig?.lines.length),
      packagingConfig?.lines.length
        ? `${packagingConfig.code} v${packagingConfig.versionNumber}; ${packagingConfig.lines.length} component(s).`
        : "No approved packaging configuration with components exists.",
      "MASTERS_FORMULA",
      "packaging-configurations",
    );
    const sourceWarehouseId =
      query.sourceWarehouseId ??
      settings?.defaultRawMaterialWarehouseId ??
      null;
    if (bomVersion && sourceWarehouseId) {
      const shortages: string[] = [];
      const mandatoryComponents = bomVersion.components.filter(
        (line) => !line.isOptional,
      );
      const requirements = calculateBomRequirements(
        mandatoryComponents.map((component) => ({
          materialId: component.inventoryItemId,
          quantityPerOutput: component.quantityPerOutput.dividedBy(
            bomVersion.outputQuantity,
          ),
          wastagePercent: component.scrapPercent,
          unit: component.unit,
        })),
        quantity,
      );
      const fixedByMaterial = new Map<string, Prisma.Decimal>();
      mandatoryComponents.forEach((component) =>
        fixedByMaterial.set(
          component.inventoryItemId,
          (
            fixedByMaterial.get(component.inventoryItemId) ??
            new Prisma.Decimal(0)
          ).add(component.fixedQuantity),
        ),
      );
      const componentByMaterial = new Map(
        mandatoryComponents.map((component) => [
          component.inventoryItemId,
          component,
        ]),
      );
      for (const requirement of requirements) {
        const component = componentByMaterial.get(requirement.materialId)!;
        const required = requirement.requiredQuantity.add(
          fixedByMaterial.get(requirement.materialId) ?? 0,
        );
        const stock = await this.prisma.manufacturingInventoryLot.aggregate({
          where: {
            workspaceId: scope.id,
            warehouseId: sourceWarehouseId,
            inventoryItemId: component.inventoryItemId,
            location: { disposition: "RELEASED", isActive: true },
            AND: [
              { OR: [{ expiresAt: null }, { expiresAt: { gt: asOf } }] },
              { OR: [{ retestDueAt: null }, { retestDueAt: { gt: asOf } }] },
            ],
          },
          _sum: { availableQuantity: true, reservedQuantity: true },
        });
        const available = new Prisma.Decimal(
          stock._sum.availableQuantity ?? 0,
        ).minus(stock._sum.reservedQuantity ?? 0);
        if (available.lessThan(required))
          shortages.push(
            `${component.inventoryItem.itemCode}: need ${required.toString()}, released ${available.toString()}`,
          );
      }
      add(
        "MATERIAL_STOCK",
        "Released BOM material lots",
        shortages.length === 0,
        shortages.length
          ? shortages.join("; ")
          : "All mandatory BOM quantities are covered by live released, unreserved lots.",
        "PLANNING_MRP",
        "material-availability",
      );
    } else
      add(
        "MATERIAL_STOCK",
        "Released BOM material lots",
        false,
        "Select/configure a source warehouse and approved BOM first.",
        "PLANNING_MRP",
        "material-availability",
      );
    if (packagingConfig?.lines.length && sourceWarehouseId) {
      const missing: string[] = [];
      for (const line of packagingConfig.lines) {
        const required = new Prisma.Decimal(line.quantity).mul(quantity);
        const stock = await this.prisma.manufacturingInventoryLot.aggregate({
          where: {
            workspaceId: scope.id,
            warehouseId: sourceWarehouseId,
            inventoryItemId: line.inventoryItemId,
            unitCost: { gt: 0 },
            location: { disposition: "RELEASED", isActive: true },
            AND: [
              { OR: [{ expiresAt: null }, { expiresAt: { gt: asOf } }] },
              { OR: [{ retestDueAt: null }, { retestDueAt: { gt: asOf } }] },
            ],
          },
          _sum: { availableQuantity: true, reservedQuantity: true },
        });
        const available = new Prisma.Decimal(
          stock._sum.availableQuantity ?? 0,
        ).minus(stock._sum.reservedQuantity ?? 0);
        if (available.lessThan(required))
          missing.push(
            `${line.inventoryItem.itemCode}: need ${required.toString()}, released ${available.toString()}`,
          );
      }
      add(
        "PACKAGING_STOCK",
        "Packaging stock and cost",
        missing.length === 0,
        missing.length
          ? missing.join("; ")
          : "Configured packaging components have live released stock and lot cost evidence.",
        "PLANNING_MRP",
        "material-availability",
      );
    }
    return {
      ready: checks.every((check) => check.state !== "BLOCKED"),
      finishedProduct: profile.inventoryItem,
      quantity,
      asOf: asOf.toISOString(),
      sourceWarehouseId,
      checks,
      blockerCount: checks.filter((check) => check.state === "BLOCKED").length,
      warningCount: checks.filter((check) => check.state === "WARNING").length,
    };
  }

  async createRouting(
    currentUser: AuthenticatedRequestUser,
    dto: CreateManufacturingRoutingDto,
  ) {
    await this.requirePermission(currentUser, "manufacturing.master.manage");
    const scope = await this.scope(currentUser, dto.workspaceId);
    await this.activeItem(
      this.prisma,
      scope.id,
      dto.finishedProductId,
      "Finished product",
    );
    const profile = await this.prisma.manufacturingItemProfile.findFirst({
      where: {
        workspaceId: scope.id,
        inventoryItemId: dto.finishedProductId,
        isActive: true,
        role: { in: ["FINISHED_GOOD", "INTERMEDIATE", "BULK"] },
        makeBuy: { in: ["MAKE", "BOTH"] },
      },
    });
    if (!profile) {
      throw new BadRequestException(
        "The selected product needs an active MAKE/BOTH finished, intermediate or bulk manufacturing profile.",
      );
    }
    const code = dto.code
      ? normalizeCode(dto.code, "Routing code")
      : compactReference(
          "RT",
          `${scope.id}:${dto.finishedProductId}:${dto.name}`,
        );
    try {
      const row = await this.prisma.$transaction(
        (tx) =>
          tx.manufacturingRouting.create({
            data: {
              tenantId: scope.tenantId,
              companyId: scope.companyId,
              workspaceId: scope.id,
              code,
              name: dto.name.trim(),
              finishedProductId: dto.finishedProductId,
              description: cleanText(dto.description),
              createdByUserId: currentUser.id,
            },
            include: this.routingInclude(),
          }),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return this.mapRouting(row);
    } catch (error) {
      if (isUniqueError(error))
        throw new ConflictException(
          "A routing with this code or name already exists.",
        );
      throw error;
    }
  }

  async createRoutingVersion(
    currentUser: AuthenticatedRequestUser,
    routingId: string,
    dto: CreateManufacturingRoutingVersionDto,
  ) {
    await this.requirePermission(currentUser, "manufacturing.master.manage");
    const scope = await this.scope(currentUser, dto.workspaceId);
    const routing = await this.prisma.manufacturingRouting.findFirst({
      where: { id: routingId, workspaceId: scope.id, isActive: true },
    });
    if (!routing)
      throw new NotFoundException("Manufacturing routing not found.");
    if (
      dto.effectiveFrom &&
      dto.effectiveTo &&
      asDate(dto.effectiveFrom) > asDate(dto.effectiveTo)
    ) {
      throw new BadRequestException(
        "Routing effective-to date must be on or after effective-from date.",
      );
    }
    const sequences = dto.operations.map((operation) => operation.sequence);
    const codes = dto.operations.map((operation) =>
      normalizeCode(operation.code, "Operation code"),
    );
    if (new Set(sequences).size !== sequences.length) {
      throw new BadRequestException(
        "Routing operation sequences must be unique.",
      );
    }
    if (new Set(codes).size !== codes.length) {
      throw new BadRequestException("Routing operation codes must be unique.");
    }
    const responsibleUserIds = [
      ...new Set(
        dto.operations.map((operation) => operation.responsibleUserId),
      ),
    ];
    const assignableCount = await this.prisma.workspaceMember.count({
      where: { workspaceId: scope.id, userId: { in: responsibleUserIds } },
    });
    if (assignableCount !== responsibleUserIds.length) {
      throw new BadRequestException(
        "Every responsible person must be a member of this workspace.",
      );
    }
    const latest = await this.prisma.manufacturingRoutingVersion.aggregate({
      where: { routingId: routing.id },
      _max: { versionNumber: true },
    });
    const versionNumber =
      dto.versionNumber ?? (latest._max.versionNumber ?? 0) + 1;
    try {
      const row = await this.prisma.$transaction(
        (tx) =>
          tx.manufacturingRoutingVersion.create({
            data: {
              routingId: routing.id,
              versionNumber,
              effectiveFrom: dto.effectiveFrom
                ? asDate(dto.effectiveFrom)
                : null,
              effectiveTo: dto.effectiveTo ? asDate(dto.effectiveTo) : null,
              changeReason: cleanText(dto.changeReason),
              operations: {
                create: dto.operations.map((operation, index) => ({
                  sequence: operation.sequence,
                  code: codes[index],
                  name: operation.name.trim(),
                  workCenterCode: cleanText(operation.workCenterCode),
                  productionLineCode: cleanText(operation.productionLineCode),
                  setupMinutes: operation.setupMinutes ?? 0,
                  runMinutesPerUnit: operation.runMinutesPerUnit ?? 0,
                  queueMinutes: operation.queueMinutes ?? 0,
                  isSubcontracted: operation.isSubcontracted ?? false,
                  qcRequired: operation.qcRequired ?? false,
                  instructions: cleanText(operation.instructions),
                  responsibleUserId: operation.responsibleUserId,
                })),
              },
            },
            include: ROUTING_VERSION_INCLUDE,
          }),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return this.mapRoutingVersion(row);
    } catch (error) {
      if (isUniqueError(error))
        throw new ConflictException(
          "This routing version or operation code already exists.",
        );
      throw error;
    }
  }

  private async replayApproval(
    workspaceId: string,
    idempotencyKey: string,
    workflowCode: string,
    entityId: string,
  ) {
    const review = await this.prisma.manufacturingWorkflowReview.findUnique({
      where: { workspaceId_idempotencyKey: { workspaceId, idempotencyKey } },
    });
    if (!review) return null;
    if (review.workflowCode !== workflowCode || review.entityId !== entityId) {
      throw new ConflictException(
        "Idempotency key was already used for another manufacturing operation.",
      );
    }
    return review;
  }

  async approveRoutingVersion(
    currentUser: AuthenticatedRequestUser,
    versionId: string,
    dto: ManufacturingPlanningApprovalDto,
  ) {
    const scope = await this.scope(currentUser, dto.workspaceId);
    const when = asDate(dto.transactionDate, "transactionDate");
    const approvalBusinessDate = utcBusinessDate(when);
    const currentBusinessDate = utcBusinessDate(new Date());
    if (approvalBusinessDate > currentBusinessDate)
      throw new BadRequestException(
        "Routing approval transaction date cannot be in the future.",
      );
    const replay = await this.replayApproval(
      scope.id,
      dto.idempotencyKey,
      "ROUTING_VERSION_APPROVE",
      versionId,
    );
    if (replay) {
      const existing = await this.prisma.manufacturingRoutingVersion.findFirst({
        where: { id: versionId, routing: { workspaceId: scope.id } },
        include: ROUTING_VERSION_INCLUDE,
      });
      if (!existing)
        throw new NotFoundException("Manufacturing routing version not found.");
      return { version: this.mapRoutingVersion(existing), replayed: true };
    }
    try {
      const row = await this.prisma.$transaction(
        async (tx) => {
          const version = await tx.manufacturingRoutingVersion.findFirst({
            where: {
              id: versionId,
              routing: { workspaceId: scope.id, isActive: true },
            },
            include: {
              routing: true,
              operations: {
                orderBy: { sequence: "asc" },
                include: { resourceRequirements: { select: { id: true } } },
              },
            },
          });
          if (!version)
            throw new NotFoundException(
              "Manufacturing routing version not found.",
            );
          if (version.status !== "DRAFT")
            throw new BadRequestException(
              "Only a draft routing version can be approved.",
            );
          if (
            !isWithinEffectivePeriod(
              currentBusinessDate,
              version.effectiveFrom,
              version.effectiveTo,
            )
          )
            throw new BadRequestException(
              `Routing version is not effective on the current UTC business date (${dateOnly(currentBusinessDate)}). Scheduled activation is not available.`,
            );
          if (
            !isWithinEffectivePeriod(
              approvalBusinessDate,
              version.effectiveFrom,
              version.effectiveTo,
            )
          )
            throw new BadRequestException(
              "Routing approval transaction date must fall within the routing version effective period.",
            );
          if (!version.operations.length)
            throw new BadRequestException(
              "A routing must contain at least one operation.",
            );
          const unassignedOperations = version.operations.filter(
            (operation) => operation.resourceRequirements.length === 0,
          );
          if (unassignedOperations.length) {
            throw new BadRequestException(
              `Assign at least one resource to every operation before approval. Missing: ${unassignedOperations
                .map((operation) => operation.code)
                .join(", ")}.`,
            );
          }
          const operationsWithoutOwner = version.operations.filter(
            (operation) => !operation.responsibleUserId,
          );
          if (operationsWithoutOwner.length) {
            throw new BadRequestException(
              `Assign a responsible person to every operation before approval. Missing: ${operationsWithoutOwner
                .map((operation) => operation.code)
                .join(", ")}.`,
            );
          }
          const responsibleUserIds = [
            ...new Set(
              version.operations.map(
                (operation) => operation.responsibleUserId as string,
              ),
            ),
          ];
          const assignableCount = await tx.workspaceMember.count({
            where: {
              workspaceId: scope.id,
              userId: { in: responsibleUserIds },
            },
          });
          if (assignableCount !== responsibleUserIds.length) {
            throw new BadRequestException(
              "A responsible person is no longer a member of this workspace. Recreate the draft routing version with a current workspace user.",
            );
          }
          const progress = await this.approvalWorkflow.advance(tx, {
            scope,
            user: currentUser,
            workflowScope: "ROUTING_VERSION",
            workflowGroup: "MASTERS_FORMULA",
            workflowCode: "ROUTING_VERSION_APPROVE",
            entityType: "ROUTING_VERSION",
            entityId: version.id,
            entityLabel: `routing ${version.routing.code} version ${version.versionNumber}`,
            makerUserId: version.routing.createdByUserId,
            transactionDate: when,
            idempotencyKey: dto.idempotencyKey,
            signatureMeaning: dto.signatureMeaning,
            note: dto.note,
            reauthenticationPassword: dto.reauthenticationPassword,
            fallbackPermissionKey: "manufacturing.master.manage",
          });
          if (!progress.complete) {
            const pending = await tx.manufacturingRoutingVersion.findUnique({
              where: { id: version.id },
              include: ROUTING_VERSION_INCLUDE,
            });
            return { row: pending!, progress };
          }
          await tx.manufacturingRoutingVersion.updateMany({
            where: {
              routingId: version.routingId,
              status: "APPROVED",
              id: { not: version.id },
            },
            data: { status: "RETIRED", retiredAt: when },
          });
          const approved = await tx.manufacturingRoutingVersion.update({
            where: { id: version.id },
            data: {
              status: "APPROVED",
              approvedByUserId: currentUser.id,
              approvedAt: when,
            },
            include: ROUTING_VERSION_INCLUDE,
          });
          return { row: approved, progress };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return {
        version: {
          ...this.mapRoutingVersion(row.row),
          approvalProgress: row.progress,
        },
        approvalProgress: row.progress,
        replayed: row.progress.replayed,
      };
    } catch (error) {
      if (isUniqueError(error)) {
        const idempotent = await this.replayApproval(
          scope.id,
          dto.idempotencyKey,
          "ROUTING_VERSION_APPROVE",
          versionId,
        );
        if (idempotent) {
          const existing =
            await this.prisma.manufacturingRoutingVersion.findFirst({
              where: { id: versionId, routing: { workspaceId: scope.id } },
              include: ROUTING_VERSION_INCLUDE,
            });
          if (existing)
            return {
              version: this.mapRoutingVersion(existing),
              replayed: true,
            };
        }
      }
      throw error;
    }
  }

  private planInclude() {
    return PLAN_INCLUDE;
  }

  private mapPlan(row: PlanRow) {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      planNumber: row.planNumber,
      finishedProductId: row.finishedProductId,
      finishedProduct: row.finishedProduct
        ? {
            id: row.finishedProduct.id,
            itemCode: row.finishedProduct.itemCode,
            itemName: row.finishedProduct.itemName,
            unit: row.finishedProduct.unit,
          }
        : null,
      bomVersionId: row.bomVersionId,
      bom: row.bomVersion?.bom
        ? {
            id: row.bomVersion.bom.id,
            code: row.bomVersion.bom.code,
            name: row.bomVersion.bom.name,
            versionNumber: row.bomVersion.versionNumber,
            status: row.bomVersion.status,
          }
        : null,
      routingVersionId: row.routingVersionId,
      routing: row.routingVersion?.routing
        ? {
            id: row.routingVersion.routing.id,
            code: row.routingVersion.routing.code,
            name: row.routingVersion.routing.name,
            versionNumber: row.routingVersion.versionNumber,
            status: row.routingVersion.status,
          }
        : null,
      status: row.status,
      plannedQuantity: number(row.plannedQuantity),
      unit: row.unit,
      plannedStartDate: dateOnly(row.plannedStartDate),
      plannedEndDate: dateOnly(row.plannedEndDate),
      notes: row.notes,
      approvedBy: row.approvedBy
        ? { id: row.approvedBy.id, name: row.approvedBy.name }
        : null,
      approvedAt: iso(row.approvedAt),
      lots: row.lots.map((lot) => ({
        id: lot.id,
        lotNumber: lot.lotNumber,
        sequence: lot.sequence,
        plannedQuantity: number(lot.plannedQuantity),
        plannedStartDate: dateOnly(lot.plannedStartDate),
        plannedEndDate: dateOnly(lot.plannedEndDate),
        status: lot.status,
        notes: lot.notes,
      })),
      mrpRunCount: row._count?.mrpRuns ?? 0,
      orderCount: row._count?.orders ?? 0,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async listPlans(currentUser: AuthenticatedRequestUser, query: Query) {
    const scope = await this.scope(currentUser, query.workspaceId);
    const status = enumQuery(query.status, ManufacturingPlanStatus, "status");
    const rows = await this.prisma.manufacturingPlan.findMany({
      where: {
        workspaceId: scope.id,
        ...(status ? { status } : {}),
        ...(query.finishedProductId
          ? { finishedProductId: query.finishedProductId }
          : {}),
        ...(query.from || query.to
          ? {
              plannedStartDate: {
                ...(query.from ? { gte: asDate(query.from, "from") } : {}),
                ...(query.to ? { lte: asDate(query.to, "to") } : {}),
              },
            }
          : {}),
        ...(query.search
          ? {
              OR: [
                { planNumber: { contains: query.search, mode: "insensitive" } },
                {
                  finishedProduct: {
                    itemName: { contains: query.search, mode: "insensitive" },
                  },
                },
              ],
            }
          : {}),
      },
      include: this.planInclude(),
      orderBy: [{ plannedStartDate: "desc" }, { createdAt: "desc" }],
    });
    return rows.map((row) => this.mapPlan(row));
  }

  private validatePlanLots(
    dto: CreateManufacturingPlanDto,
    start: Date,
    end: Date,
  ) {
    const planned = decimal(dto.plannedQuantity);
    const lotTotal = dto.lots.reduce(
      (total, lot) => total.add(lot.plannedQuantity),
      new Prisma.Decimal(0),
    );
    if (!lotTotal.equals(planned))
      throw new BadRequestException(
        "Plan lot quantities must exactly equal the planned quantity.",
      );
    const sequences = dto.lots.map((lot) => lot.sequence);
    const lotNumbers = dto.lots.map((lot) =>
      lot.lotNumber.trim().toUpperCase(),
    );
    if (new Set(sequences).size !== sequences.length)
      throw new BadRequestException("Plan lot sequences must be unique.");
    if (new Set(lotNumbers).size !== lotNumbers.length)
      throw new BadRequestException("Plan lot numbers must be unique.");
    for (const lot of dto.lots) {
      const lotStart = lot.plannedStartDate
        ? asDate(lot.plannedStartDate, "lot plannedStartDate")
        : null;
      const lotEnd = lot.plannedEndDate
        ? asDate(lot.plannedEndDate, "lot plannedEndDate")
        : null;
      if (lotStart && lotEnd && lotStart > lotEnd) {
        throw new BadRequestException(
          `Lot ${lot.lotNumber} ends before it starts.`,
        );
      }
      if ((lotStart && lotStart < start) || (lotEnd && lotEnd > end)) {
        throw new BadRequestException(
          `Lot ${lot.lotNumber} must stay within the production-plan date range.`,
        );
      }
    }
  }

  async createPlan(
    currentUser: AuthenticatedRequestUser,
    dto: CreateManufacturingPlanDto,
  ) {
    const scope = await this.scope(currentUser, dto.workspaceId);
    if (cleanText(dto.planNumber)) {
      throw new BadRequestException(
        "Plan number is generated from the configured PRODUCTION_PLAN sequence; leave it blank.",
      );
    }
    const entityId = manufacturingEntityIdFromIdempotency(
      scope.id,
      "ManufacturingPlan",
      dto.idempotencyKey,
    );
    const numberingKey = `MFG:${dto.idempotencyKey}:PRODUCTION_PLAN`;
    const replay = await this.prisma.manufacturingPlan.findFirst({
      where: { id: entityId, workspaceId: scope.id },
      include: this.planInclude(),
    });
    if (replay) return this.mapPlan(replay);
    const start = asDate(dto.plannedStartDate, "plannedStartDate");
    const end = asDate(dto.plannedEndDate, "plannedEndDate");
    const planBusinessDate = utcBusinessDate(start);
    if (start > end)
      throw new BadRequestException(
        "Plan end date must be on or after the start date.",
      );
    this.validatePlanLots(dto, start, end);
    await this.activeItem(
      this.prisma,
      scope.id,
      dto.finishedProductId,
      "Finished product",
    );
    const bomVersion = await this.prisma.manufacturingBomVersion.findFirst({
      where: {
        id: dto.bomVersionId,
        status: "APPROVED",
        bom: {
          workspaceId: scope.id,
          finishedProductId: dto.finishedProductId,
          isActive: true,
        },
      },
      select: {
        id: true,
        outputUnit: true,
        effectiveFrom: true,
        effectiveTo: true,
      },
    });
    if (!bomVersion) {
      throw new BadRequestException(
        "A production plan requires an approved BOM version for the selected product.",
      );
    }
    if (
      !isWithinEffectivePeriod(
        planBusinessDate,
        bomVersion.effectiveFrom,
        bomVersion.effectiveTo,
      )
    )
      throw new BadRequestException(
        "The approved BOM version must be effective on the production-plan start date.",
      );
    if (
      bomVersion.outputUnit.trim().toLowerCase() !==
      dto.unit.trim().toLowerCase()
    ) {
      throw new BadRequestException(
        `Plan unit must match the approved BOM output unit (${bomVersion.outputUnit}).`,
      );
    }
    if (dto.routingVersionId) {
      const routing = await this.prisma.manufacturingRoutingVersion.findFirst({
        where: {
          id: dto.routingVersionId,
          status: "APPROVED",
          routing: {
            workspaceId: scope.id,
            finishedProductId: dto.finishedProductId,
            isActive: true,
          },
        },
        select: {
          id: true,
          effectiveFrom: true,
          effectiveTo: true,
          operations: { select: { id: true }, take: 1 },
        },
      });
      if (!routing)
        throw new BadRequestException(
          "Routing version must be approved for the selected product.",
        );
      if (!routing.operations.length)
        throw new BadRequestException(
          "A production plan requires an approved routing with at least one operation.",
        );
      if (
        !isWithinEffectivePeriod(
          planBusinessDate,
          routing.effectiveFrom,
          routing.effectiveTo,
        )
      )
        throw new BadRequestException(
          "The approved routing version must be effective on the production-plan start date.",
        );
    }
    try {
      const row = await this.serializable(async (tx) => {
        const replayInTransaction = await tx.manufacturingPlan.findFirst({
          where: { id: entityId, workspaceId: scope.id },
          include: this.planInclude(),
        });
        if (replayInTransaction) return replayInTransaction;
        const issued = await issueManufacturingDocumentNumberTx(
          tx,
          scope,
          currentUser.id,
          {
            documentKind: "PRODUCTION_PLAN",
            issuedAt: start,
            idempotencyKey: numberingKey,
            entityType: "ManufacturingPlan",
            entityId,
            validateIssuedAtOnReplay: true,
          },
        );
        return tx.manufacturingPlan.create({
          data: {
            id: entityId,
            tenantId: scope.tenantId,
            companyId: scope.companyId,
            workspaceId: scope.id,
            planNumber: issued.documentNumber,
            finishedProductId: dto.finishedProductId,
            bomVersionId: dto.bomVersionId,
            routingVersionId: dto.routingVersionId ?? null,
            plannedQuantity: dto.plannedQuantity,
            unit: dto.unit.trim(),
            plannedStartDate: start,
            plannedEndDate: end,
            notes: cleanText(dto.notes),
            createdByUserId: currentUser.id,
            lots: {
              create: dto.lots.map((lot) => ({
                lotNumber: lot.lotNumber.trim(),
                sequence: lot.sequence,
                plannedQuantity: lot.plannedQuantity,
                plannedStartDate: lot.plannedStartDate
                  ? asDate(lot.plannedStartDate)
                  : null,
                plannedEndDate: lot.plannedEndDate
                  ? asDate(lot.plannedEndDate)
                  : null,
                notes: cleanText(lot.notes),
              })),
            },
          },
          include: this.planInclude(),
        });
      });
      return this.mapPlan(row);
    } catch (error) {
      if (isUniqueError(error))
        throw new ConflictException(
          "This plan number or lot sequence already exists.",
        );
      throw error;
    }
  }

  async approvePlan(
    currentUser: AuthenticatedRequestUser,
    planId: string,
    dto: ManufacturingPlanningApprovalDto,
  ) {
    const scope = await this.scope(currentUser, dto.workspaceId);
    const replay = await this.replayApproval(
      scope.id,
      dto.idempotencyKey,
      "PLAN_APPROVE",
      planId,
    );
    if (replay) {
      const existing = await this.prisma.manufacturingPlan.findFirst({
        where: { id: planId, workspaceId: scope.id },
        include: this.planInclude(),
      });
      if (!existing)
        throw new NotFoundException("Manufacturing plan not found.");
      return { plan: this.mapPlan(existing), replayed: true };
    }
    const when = asDate(dto.transactionDate, "transactionDate");
    try {
      const row = await this.prisma.$transaction(
        async (tx) => {
          const plan = await tx.manufacturingPlan.findFirst({
            where: { id: planId, workspaceId: scope.id },
            include: { lots: true, bomVersion: true, routingVersion: true },
          });
          if (!plan)
            throw new NotFoundException("Manufacturing plan not found.");
          if (plan.status !== "DRAFT")
            throw new BadRequestException(
              "Only a draft production plan can be approved.",
            );
          if (plan.bomVersion.status !== "APPROVED") {
            throw new BadRequestException(
              "The plan BOM version is no longer approved.",
            );
          }
          if (
            plan.routingVersion &&
            plan.routingVersion.status !== "APPROVED"
          ) {
            throw new BadRequestException(
              "The plan routing version is no longer approved.",
            );
          }
          const lotTotal = plan.lots.reduce(
            (total, lot) => total.add(lot.plannedQuantity),
            new Prisma.Decimal(0),
          );
          if (!lotTotal.equals(plan.plannedQuantity)) {
            throw new BadRequestException(
              "Plan lot quantities no longer reconcile to the planned quantity.",
            );
          }
          const progress = await this.approvalWorkflow.advance(tx, {
            scope,
            user: currentUser,
            workflowScope: "PRODUCTION_PLAN",
            workflowGroup: "PLANNING_MRP",
            workflowCode: "PLAN_APPROVE",
            entityType: "MANUFACTURING_PLAN",
            entityId: plan.id,
            entityLabel: `production plan ${plan.planNumber}`,
            makerUserId: plan.createdByUserId,
            transactionDate: when,
            idempotencyKey: dto.idempotencyKey,
            signatureMeaning: dto.signatureMeaning,
            note: dto.note,
            reauthenticationPassword: dto.reauthenticationPassword,
            fallbackPermissionKey: "manufacturing.plan.manage",
          });
          if (!progress.complete) {
            const pending = await tx.manufacturingPlan.findUnique({
              where: { id: plan.id },
              include: this.planInclude(),
            });
            return { row: pending!, progress };
          }
          const approved = await tx.manufacturingPlan.update({
            where: { id: plan.id },
            data: {
              status: "APPROVED",
              approvedByUserId: currentUser.id,
              approvedAt: when,
            },
            include: this.planInclude(),
          });
          return { row: approved, progress };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return {
        plan: { ...this.mapPlan(row.row), approvalProgress: row.progress },
        approvalProgress: row.progress,
        replayed: row.progress.replayed,
      };
    } catch (error) {
      if (isUniqueError(error)) {
        const idempotent = await this.replayApproval(
          scope.id,
          dto.idempotencyKey,
          "PLAN_APPROVE",
          planId,
        );
        if (idempotent) {
          const existing = await this.prisma.manufacturingPlan.findFirst({
            where: { id: planId, workspaceId: scope.id },
            include: this.planInclude(),
          });
          if (existing) return { plan: this.mapPlan(existing), replayed: true };
        }
      }
      throw error;
    }
  }

  private async latestStock(
    db: Db,
    workspaceId: string,
    warehouseId: string,
    itemIds: string[],
    asOf: Date,
  ) {
    if (!itemIds.length)
      return new Map<
        string,
        { balanceQuantity: Prisma.Decimal; averageCost: Prisma.Decimal }
      >();
    const movements = await db.stockMovement.findMany({
      where: {
        workspaceId,
        warehouseId,
        inventoryItemId: { in: itemIds },
        transactionDate: { lte: asOf },
        voidedAt: null,
      },
      orderBy: [
        { transactionDate: "asc" },
        { createdAt: "asc" },
        { id: "asc" },
      ],
      select: {
        inventoryItemId: true,
        balanceQuantity: true,
        averageCost: true,
      },
    });
    const latest = new Map<
      string,
      { balanceQuantity: Prisma.Decimal; averageCost: Prisma.Decimal }
    >();
    for (const movement of movements) {
      latest.set(movement.inventoryItemId, {
        balanceQuantity: movement.balanceQuantity,
        averageCost: movement.averageCost,
      });
    }
    return latest;
  }

  private async activeReservedQuantities(
    db: Db,
    workspaceId: string,
    warehouseId: string,
    itemIds: string[],
    asOf: Date,
  ) {
    const result = new Map<string, Prisma.Decimal>();
    if (!itemIds.length) return result;
    const lines = await db.manufacturingReservationLine.findMany({
      where: {
        inventoryItemId: { in: itemIds },
        reservation: {
          workspaceId,
          warehouseId,
          status: { in: [...ACTIVE_RESERVATION_STATUSES] },
          reservedAt: { lte: asOf },
          OR: [{ expiresAt: null }, { expiresAt: { gt: asOf } }],
        },
      },
      select: {
        inventoryItemId: true,
        quantity: true,
        issuedQuantity: true,
        releasedQuantity: true,
      },
    });
    for (const line of lines) {
      const remaining = maxZero(
        decimal(line.quantity)
          .sub(line.issuedQuantity)
          .sub(line.releasedQuantity),
      );
      result.set(
        line.inventoryItemId,
        (result.get(line.inventoryItemId) ?? new Prisma.Decimal(0)).add(
          remaining,
        ),
      );
    }
    return result;
  }

  private async confirmedScheduledReceipts(
    db: Db,
    workspaceId: string,
    destinationWarehouseId: string,
    itemIds: string[],
    asOf: Date,
    requiredDate: Date,
  ) {
    const result = new Map<string, Prisma.Decimal>();
    if (!itemIds.length || requiredDate <= asOf) return result;
    const transferLines = await db.warehouseTransferLine.findMany({
      where: {
        inventoryItemId: { in: itemIds },
        transfer: {
          workspaceId,
          toWarehouseId: destinationWarehouseId,
          status: "POSTED",
          transferDate: { gt: asOf, lte: requiredDate },
        },
      },
      select: { inventoryItemId: true, quantity: true },
    });
    for (const line of transferLines) {
      result.set(
        line.inventoryItemId,
        (result.get(line.inventoryItemId) ?? new Prisma.Decimal(0)).add(
          line.quantity,
        ),
      );
    }
    return result;
  }

  private mapMrpRun(row: MrpRunRow, evidenceValue?: unknown) {
    const evidence = jsonObject(evidenceValue);
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      runNumber: row.runNumber,
      planId: row.planId,
      planNumber: row.plan?.planNumber ?? null,
      finishedProduct: row.plan?.finishedProduct
        ? {
            id: row.plan.finishedProduct.id,
            itemCode: row.plan.finishedProduct.itemCode,
            itemName: row.plan.finishedProduct.itemName,
          }
        : null,
      status: row.status,
      asOfDate: iso(row.asOfDate),
      horizonEndDate: dateOnly(row.horizonEndDate),
      startedAt: iso(row.startedAt),
      completedAt: iso(row.completedAt),
      errorMessage: row.errorMessage,
      warehouseId:
        typeof evidence.warehouseId === "string" ? evidence.warehouseId : null,
      maxProducibleQuantity:
        typeof evidence.maxProducibleQuantity === "string" ||
        typeof evidence.maxProducibleQuantity === "number"
          ? Number(evidence.maxProducibleQuantity)
          : null,
      planQuantity:
        typeof evidence.planQuantity === "string" ||
        typeof evidence.planQuantity === "number"
          ? Number(evidence.planQuantity)
          : row.plan
            ? number(row.plan.plannedQuantity)
            : null,
      scenarioQuantity:
        typeof evidence.scenarioQuantity === "string" ||
        typeof evidence.scenarioQuantity === "number"
          ? Number(evidence.scenarioQuantity)
          : row.plan
            ? number(row.plan.plannedQuantity)
            : null,
      isWhatIfScenario: evidence.isWhatIfScenario === true,
      canFulfillPlan:
        typeof evidence.canFulfillPlan === "boolean"
          ? evidence.canFulfillPlan
          : null,
      shortageItemCount:
        typeof evidence.shortageItemCount === "number"
          ? evidence.shortageItemCount
          : null,
      requirements: row.requirements.map((requirement) => ({
        id: requirement.id,
        inventoryItemId: requirement.inventoryItemId,
        itemCode: requirement.inventoryItem?.itemCode ?? null,
        itemName: requirement.inventoryItem?.itemName ?? null,
        bomComponentId: requirement.bomComponentId,
        warehouseId: requirement.warehouseId,
        locationId: requirement.locationId,
        requiredDate: dateOnly(requirement.requiredDate),
        unit: requirement.unit,
        grossRequirement: number(requirement.grossRequirement),
        onHandQuantity: number(requirement.onHandQuantity),
        activeReservationQty: number(requirement.activeReservationQty),
        scheduledReceiptQty: number(requirement.scheduledReceiptQty),
        availableQuantity: Math.max(
          0,
          number(requirement.onHandQuantity) -
            number(requirement.activeReservationQty),
        ),
        netRequirement: number(requirement.netRequirement),
        shortageQuantity: number(requirement.shortageQuantity),
        snapshotUnitCost: number(requirement.snapshotUnitCost),
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mrpInclude() {
    return MRP_INCLUDE;
  }

  async listMrpRuns(currentUser: AuthenticatedRequestUser, query: Query) {
    const scope = await this.scope(currentUser, query.workspaceId);
    const status = enumQuery(query.status, ManufacturingMrpRunStatus, "status");
    const rows = await this.prisma.manufacturingMrpRun.findMany({
      where: {
        workspaceId: scope.id,
        ...(query.planId ? { planId: query.planId } : {}),
        ...(status ? { status } : {}),
      },
      include: this.mrpInclude(),
      orderBy: { createdAt: "desc" },
    });
    const reviews = rows.length
      ? await this.prisma.manufacturingWorkflowReview.findMany({
          where: {
            workspaceId: scope.id,
            workflowCode: "MRP_CALCULATE",
            entityId: { in: rows.map((row) => row.id) },
          },
          select: { entityId: true, evidence: true },
        })
      : [];
    const evidenceByRun = new Map(
      reviews.map((review) => [review.entityId, review.evidence]),
    );
    return rows.map((row) => this.mapMrpRun(row, evidenceByRun.get(row.id)));
  }

  async getMrpRun(currentUser: AuthenticatedRequestUser, runId: string) {
    const scope = await this.scope(currentUser);
    const row = await this.prisma.manufacturingMrpRun.findFirst({
      where: { id: runId, workspaceId: scope.id },
      include: this.mrpInclude(),
    });
    if (!row) throw new NotFoundException("Manufacturing MRP run not found.");
    const review = await this.prisma.manufacturingWorkflowReview.findFirst({
      where: {
        workspaceId: scope.id,
        workflowCode: "MRP_CALCULATE",
        entityId: row.id,
      },
      select: { evidence: true },
    });
    return this.mapMrpRun(row, review?.evidence);
  }

  private async replayMrp(
    scopeId: string,
    idempotencyKey: string,
    planId: string,
  ) {
    const review = await this.prisma.manufacturingWorkflowReview.findUnique({
      where: {
        workspaceId_idempotencyKey: { workspaceId: scopeId, idempotencyKey },
      },
    });
    if (!review) return null;
    const evidence = jsonObject(review.evidence);
    if (
      review.workflowCode !== "MRP_CALCULATE" ||
      evidence.planId !== planId ||
      !review.entityId
    ) {
      throw new ConflictException(
        "Idempotency key was already used for another manufacturing operation.",
      );
    }
    return review;
  }

  async calculateMrp(
    currentUser: AuthenticatedRequestUser,
    dto: CalculateManufacturingMrpDto,
  ) {
    await this.requirePermission(currentUser, "manufacturing.plan.manage");
    const scope = await this.scope(currentUser, dto.workspaceId);
    const replay = await this.replayMrp(
      scope.id,
      dto.idempotencyKey,
      dto.planId,
    );
    if (replay?.entityId) {
      const row = await this.prisma.manufacturingMrpRun.findFirst({
        where: { id: replay.entityId, workspaceId: scope.id },
        include: this.mrpInclude(),
      });
      if (!row)
        throw new NotFoundException(
          "The idempotent MRP result no longer exists.",
        );
      return { run: this.mapMrpRun(row, replay.evidence), replayed: true };
    }

    const asOf = asOfDate(dto.asOfDate);
    const horizonEnd = dto.horizonEndDate
      ? asDate(dto.horizonEndDate, "horizonEndDate")
      : null;
    if (horizonEnd && horizonEnd < asOf) {
      throw new BadRequestException(
        "MRP horizon end date must be on or after the as-of date.",
      );
    }
    const startedAt = new Date();
    try {
      const result = await this.prisma.$transaction(
        async (tx) => {
          const plan = await tx.manufacturingPlan.findFirst({
            where: {
              id: dto.planId,
              workspaceId: scope.id,
              status: { in: ["DRAFT", "APPROVED", "RELEASED", "IN_PROGRESS"] },
            },
            include: {
              finishedProduct: true,
              bomVersion: {
                include: {
                  bom: true,
                  components: {
                    orderBy: { sortOrder: "asc" },
                    include: { inventoryItem: true, issueLocation: true },
                  },
                },
              },
            },
          });
          if (!plan)
            throw new NotFoundException(
              "An active manufacturing plan was not found.",
            );
          if (plan.bomVersion.status !== "APPROVED") {
            throw new BadRequestException(
              "MRP requires an approved BOM version.",
            );
          }
          if (!plan.bomVersion.components.length) {
            throw new BadRequestException(
              "The approved BOM contains no components.",
            );
          }
          const invalidComponents = plan.bomVersion.components.filter(
            (component) =>
              component.inventoryItem.workspaceId !== scope.id ||
              component.inventoryItem.status !== "ACTIVE" ||
              component.inventoryItem.kind !== "PRODUCT",
          );
          if (invalidComponents.length) {
            throw new BadRequestException(
              "Every BOM component must remain an active inventory product in this workspace before MRP can run.",
            );
          }
          const settings = await tx.manufacturingSettings.findUnique({
            where: { workspaceId: scope.id },
          });
          const warehouseId =
            dto.warehouseId ?? settings?.defaultRawMaterialWarehouseId;
          if (!warehouseId) {
            throw new BadRequestException(
              "Select a raw-material warehouse or configure a default one.",
            );
          }
          await this.activeWarehouse(
            tx,
            scope.id,
            warehouseId,
            "MRP source warehouse",
          );

          const outputQuantity = decimal(plan.bomVersion.outputQuantity);
          if (outputQuantity.lessThanOrEqualTo(0)) {
            throw new BadRequestException(
              "Approved BOM output quantity must be greater than zero.",
            );
          }
          const scenarioQuantity =
            dto.scenarioQuantity === undefined
              ? decimal(plan.plannedQuantity)
              : decimal(dto.scenarioQuantity);
          if (scenarioQuantity.lessThanOrEqualTo(0)) {
            throw new BadRequestException(
              "Scenario quantity must be greater than zero.",
            );
          }
          const components = plan.bomVersion.components;
          const itemIds = [
            ...new Set(
              components.map((component) => component.inventoryItemId),
            ),
          ];
          const stock = await this.latestStock(
            tx,
            scope.id,
            warehouseId,
            itemIds,
            asOf,
          );
          const reservations = await this.activeReservedQuantities(
            tx,
            scope.id,
            warehouseId,
            itemIds,
            asOf,
          );
          const scheduledReceipts = await this.confirmedScheduledReceipts(
            tx,
            scope.id,
            warehouseId,
            itemIds,
            asOf,
            plan.plannedStartDate,
          );

          const variableRequirements = calculateBomRequirements(
            components.map((component) => ({
              materialId: component.inventoryItemId,
              quantityPerOutput: decimal(component.quantityPerOutput)
                .div(outputQuantity)
                .toString(),
              wastagePercent: component.scrapPercent,
              unit: component.unit,
            })),
            scenarioQuantity,
          );
          const fixedByItem = new Map<string, Prisma.Decimal>();
          const componentIdsByItem = new Map<string, string[]>();
          const locationByItem = new Map<string, string | null>();
          const optionalByItem = new Map<string, boolean>();
          for (const component of components) {
            fixedByItem.set(
              component.inventoryItemId,
              (
                fixedByItem.get(component.inventoryItemId) ??
                new Prisma.Decimal(0)
              ).add(component.fixedQuantity),
            );
            componentIdsByItem.set(component.inventoryItemId, [
              ...(componentIdsByItem.get(component.inventoryItemId) ?? []),
              component.id,
            ]);
            if (!locationByItem.has(component.inventoryItemId)) {
              locationByItem.set(
                component.inventoryItemId,
                component.issueLocationId,
              );
            }
            optionalByItem.set(
              component.inventoryItemId,
              (optionalByItem.get(component.inventoryItemId) ?? true) &&
                component.isOptional,
            );
          }

          const rows = variableRequirements.map((requirement) => {
            const fixed =
              fixedByItem.get(requirement.materialId) ?? new Prisma.Decimal(0);
            const gross = requirement.requiredQuantity.add(fixed);
            const snapshot = stock.get(requirement.materialId);
            const onHand = snapshot?.balanceQuantity ?? new Prisma.Decimal(0);
            const reserved =
              reservations.get(requirement.materialId) ?? new Prisma.Decimal(0);
            const available = maxZero(onHand.sub(reserved));
            // Only already-posted, future-dated transfers into the selected
            // warehouse are confirmed scheduled receipts. Suggested purchase
            // requisitions remain non-stock documents until a real downstream
            // purchase/receipt exists, so MRP never overstates availability.
            const scheduledReceipt =
              scheduledReceipts.get(requirement.materialId) ??
              new Prisma.Decimal(0);
            const net = maxZero(gross.sub(available).sub(scheduledReceipt));
            const optional =
              optionalByItem.get(requirement.materialId) ?? false;
            return {
              inventoryItemId: requirement.materialId,
              bomComponentId:
                (componentIdsByItem.get(requirement.materialId)?.length ??
                  0) === 1
                  ? componentIdsByItem.get(requirement.materialId)![0]
                  : null,
              warehouseId,
              locationId: locationByItem.get(requirement.materialId) ?? null,
              requiredDate: plan.plannedStartDate,
              unit:
                requirement.unit ??
                components.find(
                  (component) =>
                    component.inventoryItemId === requirement.materialId,
                )!.unit,
              grossRequirement: gross,
              onHandQuantity: onHand,
              activeReservationQty: reserved,
              scheduledReceiptQty: scheduledReceipt,
              netRequirement: net,
              shortageQuantity: optional ? new Prisma.Decimal(0) : net,
              snapshotUnitCost: snapshot?.averageCost ?? new Prisma.Decimal(0),
              optional,
            };
          });

          const mandatoryComponents = components.filter(
            (component) => !component.isOptional,
          );
          if (!mandatoryComponents.length) {
            throw new BadRequestException(
              "MRP requires at least one non-optional BOM component.",
            );
          }
          let capacity;
          try {
            const mandatoryItemIds = [
              ...new Set(
                mandatoryComponents.map(
                  (component) => component.inventoryItemId,
                ),
              ),
            ];
            capacity = calculateMaxProducible(
              mandatoryComponents.map((component) => ({
                materialId: component.inventoryItemId,
                quantityPerOutput: decimal(component.quantityPerOutput)
                  .div(outputQuantity)
                  .toString(),
                wastagePercent: component.scrapPercent,
                unit: component.unit,
              })),
              mandatoryItemIds.map((itemId) => ({
                materialId: itemId,
                onHandQuantity: maxZero(
                  (
                    stock.get(itemId)?.balanceQuantity ?? new Prisma.Decimal(0)
                  ).sub(fixedByItem.get(itemId) ?? 0),
                ),
                reservedQuantity: reservations.get(itemId) ?? 0,
              })),
            );
          } catch (error) {
            if (error instanceof ManufacturingDomainError)
              throw new BadRequestException(error.message);
            throw error;
          }

          const runNumber = dto.runNumber
            ? normalizeCode(dto.runNumber, "MRP run number")
            : compactReference("MRP", `${scope.id}:${dto.idempotencyKey}`);
          const completedAt = new Date();
          const run = await tx.manufacturingMrpRun.create({
            data: {
              tenantId: scope.tenantId,
              companyId: scope.companyId,
              workspaceId: scope.id,
              runNumber,
              planId: plan.id,
              status: "COMPLETED",
              asOfDate: asOf,
              horizonEndDate: horizonEnd,
              startedAt,
              completedAt,
              createdByUserId: currentUser.id,
              requirements: {
                create: rows.map((row) => ({
                  inventoryItemId: row.inventoryItemId,
                  bomComponentId: row.bomComponentId,
                  warehouseId: row.warehouseId,
                  locationId: row.locationId,
                  requiredDate: row.requiredDate,
                  unit: row.unit,
                  grossRequirement: row.grossRequirement,
                  onHandQuantity: row.onHandQuantity,
                  activeReservationQty: row.activeReservationQty,
                  scheduledReceiptQty: row.scheduledReceiptQty,
                  netRequirement: row.netRequirement,
                  shortageQuantity: row.shortageQuantity,
                  snapshotUnitCost: row.snapshotUnitCost,
                })),
              },
            },
            include: this.mrpInclude(),
          });
          const shortageItemCount = rows.filter(
            (row) => !row.optional && row.shortageQuantity.greaterThan(0),
          ).length;
          const canFulfillPlan = shortageItemCount === 0;
          const evidence = {
            planId: plan.id,
            planQuantity: decimal(plan.plannedQuantity).toString(),
            scenarioQuantity: scenarioQuantity.toString(),
            isWhatIfScenario: dto.scenarioQuantity !== undefined,
            warehouseId,
            asOfDate: asOf.toISOString(),
            maxProducibleQuantity: capacity.maxProducibleQuantity.toString(),
            bottleneckMaterialIds: capacity.bottleneckMaterialIds,
            canFulfillPlan,
            shortageItemCount,
            scheduledReceiptSource: "POSTED_FUTURE_WAREHOUSE_TRANSFERS",
          };
          await tx.manufacturingWorkflowReview.create({
            data: {
              tenantId: scope.tenantId,
              companyId: scope.companyId,
              workspaceId: scope.id,
              planId: plan.id,
              workflowGroup: "PLANNING_MRP",
              workflowCode: "MRP_CALCULATE",
              entityType: "MANUFACTURING_MRP_RUN",
              entityId: run.id,
              transactionDate: asOf,
              idempotencyKey: dto.idempotencyKey,
              title: `MRP calculation ${run.runNumber}`,
              outcome: "EXECUTED",
              status: "REVIEWED",
              reason: canFulfillPlan
                ? null
                : "Material shortage detected from live stock and active reservations.",
              note: cleanText(dto.note),
              evidence,
              reviewedByUserId: currentUser.id,
              reviewedAt: completedAt,
              createdByUserId: currentUser.id,
            },
          });
          return { run, evidence };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return {
        run: this.mapMrpRun(result.run, result.evidence),
        replayed: false,
      };
    } catch (error) {
      if (isUniqueError(error)) {
        const idempotent = await this.replayMrp(
          scope.id,
          dto.idempotencyKey,
          dto.planId,
        );
        if (idempotent?.entityId) {
          const row = await this.prisma.manufacturingMrpRun.findFirst({
            where: { id: idempotent.entityId, workspaceId: scope.id },
            include: this.mrpInclude(),
          });
          if (row)
            return {
              run: this.mapMrpRun(row, idempotent.evidence),
              replayed: true,
            };
        }
        throw new ConflictException("This MRP run number already exists.");
      }
      if (error instanceof ManufacturingDomainError)
        throw new BadRequestException(error.message);
      throw error;
    }
  }

  private mapSupplySuggestion(
    row: SupplyReviewRow,
    warehouseTransfer?: {
      id: string;
      transferNo: string;
      status: string;
    } | null,
  ) {
    const evidence = jsonObject(row.evidence);
    const item = jsonObject(evidence.item);
    const sourceWarehouse = jsonObject(evidence.sourceWarehouse);
    const destinationWarehouse = jsonObject(evidence.destinationWarehouse);
    const conversion = jsonObject(evidence.conversion);
    const type = cleanText(evidence.type) as SupplySuggestionType | null;
    const converted = Boolean(cleanText(conversion.convertedAt));
    const status =
      row.status === "REJECTED"
        ? "REJECTED"
        : converted
          ? "CONVERTED"
          : row.status === "APPROVED"
            ? "APPROVED"
            : row.status === "REVIEWED"
              ? "APPROVAL_PENDING"
              : "PENDING";
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      suggestionNumber:
        cleanText(evidence.suggestionNumber) ?? row.title ?? row.id,
      type,
      status,
      mrpRunId: cleanText(evidence.mrpRunId),
      mrpRunNumber: cleanText(evidence.mrpRunNumber),
      mrpRequirementId: cleanText(evidence.mrpRequirementId),
      item: cleanText(item.id)
        ? {
            id: cleanText(item.id)!,
            code: cleanText(item.code),
            name: cleanText(item.name),
          }
        : null,
      requestedQuantity: number(
        typeof evidence.requestedQuantity === "string" ||
          typeof evidence.requestedQuantity === "number"
          ? evidence.requestedQuantity
          : 0,
      ),
      unit: cleanText(evidence.unit),
      requiredDate: cleanText(evidence.requiredDate),
      sourceWarehouse: cleanText(sourceWarehouse.id)
        ? {
            id: cleanText(sourceWarehouse.id)!,
            code: cleanText(sourceWarehouse.code),
            name: cleanText(sourceWarehouse.name),
          }
        : null,
      destinationWarehouse: cleanText(destinationWarehouse.id)
        ? {
            id: cleanText(destinationWarehouse.id)!,
            code: cleanText(destinationWarehouse.code),
            name: cleanText(destinationWarehouse.name),
          }
        : null,
      shortageQuantity: number(
        typeof evidence.shortageQuantity === "string" ||
          typeof evidence.shortageQuantity === "number"
          ? evidence.shortageQuantity
          : 0,
      ),
      note: row.note,
      externalReference: cleanText(conversion.externalReference),
      expectedReceiptDate: cleanText(conversion.expectedReceiptDate),
      warehouseTransfer: warehouseTransfer ?? null,
      createdBy: row.createdBy
        ? { id: row.createdBy.id, name: row.createdBy.name }
        : null,
      approvedBy: row.approvedBy
        ? { id: row.approvedBy.id, name: row.approvedBy.name }
        : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async supplySuggestionRow(
    db: Db,
    workspaceId: string,
    suggestionId: string,
  ) {
    return db.manufacturingWorkflowReview.findFirst({
      where: {
        id: suggestionId,
        workspaceId,
        entityType: "MANUFACTURING_SUPPLY_SUGGESTION",
        workflowCode: { in: Object.values(SUPPLY_WORKFLOW_CODES) },
      },
      include: SUPPLY_REVIEW_INCLUDE,
    });
  }

  async listSupplySuggestions(
    currentUser: AuthenticatedRequestUser,
    query: Query,
  ) {
    const scope = await this.scope(currentUser, query.workspaceId);
    const type = query.type
      ? (enumQuery(
          query.type,
          Object.fromEntries(
            SUPPLY_SUGGESTION_TYPES.map((value) => [value, value]),
          ) as Record<string, SupplySuggestionType>,
          "type",
        ) as SupplySuggestionType)
      : undefined;
    const allowedStatuses = [
      "PENDING",
      "APPROVAL_PENDING",
      "APPROVED",
      "CONVERTED",
      "REJECTED",
    ];
    if (query.status && !allowedStatuses.includes(query.status)) {
      throw new BadRequestException(
        `status must be one of: ${allowedStatuses.join(", ")}.`,
      );
    }
    const rows = await this.prisma.manufacturingWorkflowReview.findMany({
      where: {
        workspaceId: scope.id,
        entityType: "MANUFACTURING_SUPPLY_SUGGESTION",
        workflowCode: {
          in: type
            ? [SUPPLY_WORKFLOW_CODES[type]]
            : Object.values(SUPPLY_WORKFLOW_CODES),
        },
      },
      include: SUPPLY_REVIEW_INCLUDE,
      orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
    });
    const transferIds = rows
      .map((row) =>
        cleanText(
          jsonObject(jsonObject(row.evidence).conversion).warehouseTransferId,
        ),
      )
      .filter((value): value is string => Boolean(value));
    const transfers = transferIds.length
      ? await this.prisma.warehouseTransfer.findMany({
          where: { workspaceId: scope.id, id: { in: transferIds } },
          select: { id: true, transferNo: true, status: true },
        })
      : [];
    const transferById = new Map(transfers.map((row) => [row.id, row]));
    return rows
      .map((row) => {
        const evidence = jsonObject(row.evidence);
        const conversion = jsonObject(evidence.conversion);
        const transferId = cleanText(conversion.warehouseTransferId);
        return this.mapSupplySuggestion(
          row,
          transferId ? transferById.get(transferId) : null,
        );
      })
      .filter(
        (row) =>
          (!query.mrpRunId || row.mrpRunId === query.mrpRunId) &&
          (!query.status || row.status === query.status),
      );
  }

  async createSupplySuggestion(
    currentUser: AuthenticatedRequestUser,
    dto: CreateManufacturingSupplySuggestionDto,
  ) {
    await this.requirePermission(currentUser, "manufacturing.plan.manage");
    const scope = await this.scope(currentUser, dto.workspaceId);
    const when = asDate(dto.transactionDate, "transactionDate");
    const requestedQuantity = decimal(dto.requestedQuantity);
    const entityId = manufacturingEntityIdFromIdempotency(
      scope.id,
      "ManufacturingSupplySuggestion",
      dto.idempotencyKey,
    );
    return this.serializable(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`manufacturing-supply:${scope.id}:${dto.mrpRequirementId}`}, 0))`,
      );
      const idempotent = await tx.manufacturingWorkflowReview.findUnique({
        where: {
          workspaceId_idempotencyKey: {
            workspaceId: scope.id,
            idempotencyKey: dto.idempotencyKey,
          },
        },
        include: SUPPLY_REVIEW_INCLUDE,
      });
      if (idempotent) {
        const evidence = jsonObject(idempotent.evidence);
        if (
          idempotent.id !== entityId ||
          idempotent.entityType !== "MANUFACTURING_SUPPLY_SUGGESTION" ||
          idempotent.workflowCode !== SUPPLY_WORKFLOW_CODES[dto.type] ||
          evidence.mrpRequirementId !== dto.mrpRequirementId ||
          !decimal(
            typeof evidence.requestedQuantity === "string" ||
              typeof evidence.requestedQuantity === "number"
              ? evidence.requestedQuantity
              : 0,
          ).equals(requestedQuantity)
        ) {
          throw new ConflictException(
            "Idempotency key was already used for another manufacturing operation.",
          );
        }
        return this.mapSupplySuggestion(idempotent);
      }
      const requirement = await tx.manufacturingMrpRequirement.findFirst({
        where: {
          id: dto.mrpRequirementId,
          mrpRun: { workspaceId: scope.id, status: "COMPLETED" },
        },
        include: {
          inventoryItem: {
            select: {
              id: true,
              itemCode: true,
              itemName: true,
              unit: true,
              alternateUnit: true,
              alternateUnitConversion: true,
            },
          },
          mrpRun: {
            select: {
              id: true,
              runNumber: true,
              planId: true,
              plan: { select: { planNumber: true } },
            },
          },
        },
      });
      if (!requirement)
        throw new NotFoundException(
          "A completed MRP requirement was not found in this workspace.",
        );
      const shortageQuantity = decimal(requirement.shortageQuantity);
      if (shortageQuantity.lessThanOrEqualTo(0)) {
        throw new BadRequestException(
          "A supply suggestion can only be created for a real MRP shortage.",
        );
      }
      if (requestedQuantity.lessThanOrEqualTo(0)) {
        throw new BadRequestException(
          "Requested quantity must be greater than zero.",
        );
      }
      if (
        requirement.unit.trim().toLowerCase() !==
        requirement.inventoryItem.unit.trim().toLowerCase()
      ) {
        throw new BadRequestException(
          `MRP shortage unit (${requirement.unit}) must be converted to the inventory base unit (${requirement.inventoryItem.unit}) before creating a supply document.`,
        );
      }
      const existing = await tx.manufacturingWorkflowReview.findMany({
        where: {
          workspaceId: scope.id,
          entityType: "MANUFACTURING_SUPPLY_SUGGESTION",
          workflowCode: { in: Object.values(SUPPLY_WORKFLOW_CODES) },
          status: { not: "REJECTED" },
        },
        select: { evidence: true },
      });
      const alreadySuggested = existing.reduce((total, review) => {
        const evidence = jsonObject(review.evidence);
        if (evidence.mrpRequirementId !== requirement.id) return total;
        const value =
          typeof evidence.requestedQuantity === "string" ||
          typeof evidence.requestedQuantity === "number"
            ? evidence.requestedQuantity
            : 0;
        return total.add(value);
      }, new Prisma.Decimal(0));
      if (
        alreadySuggested.add(requestedQuantity).greaterThan(shortageQuantity)
      ) {
        throw new BadRequestException(
          `Open supply suggestions would exceed the MRP shortage. Remaining unsuggested quantity: ${maxZero(
            shortageQuantity.sub(alreadySuggested),
          ).toString()} ${requirement.unit}.`,
        );
      }
      const destinationWarehouseId =
        cleanText(dto.destinationWarehouseId) ?? requirement.warehouseId;
      if (!destinationWarehouseId) {
        throw new BadRequestException(
          "The MRP requirement must identify a destination warehouse.",
        );
      }
      if (
        requirement.warehouseId &&
        destinationWarehouseId !== requirement.warehouseId
      ) {
        throw new BadRequestException(
          "Destination warehouse must match the MRP shortage warehouse.",
        );
      }
      const destinationWarehouse = await this.activeWarehouse(
        tx,
        scope.id,
        destinationWarehouseId,
        "Destination warehouse",
      );
      let sourceWarehouse: Awaited<
        ReturnType<typeof this.activeWarehouse>
      > | null = null;
      if (dto.type === "STOCK_TRANSFER") {
        const sourceWarehouseId = cleanText(dto.sourceWarehouseId);
        if (!sourceWarehouseId) {
          throw new BadRequestException(
            "A source warehouse is required for a stock-transfer suggestion.",
          );
        }
        if (sourceWarehouseId === destinationWarehouse.id) {
          throw new BadRequestException(
            "Source and destination warehouses must be different.",
          );
        }
        sourceWarehouse = await this.activeWarehouse(
          tx,
          scope.id,
          sourceWarehouseId,
          "Source warehouse",
        );
        const sourceStock = await this.latestStock(
          tx,
          scope.id,
          sourceWarehouse.id,
          [requirement.inventoryItemId],
          asOfDate(dto.transactionDate),
        );
        const sourceReservations = await this.activeReservedQuantities(
          tx,
          scope.id,
          sourceWarehouse.id,
          [requirement.inventoryItemId],
          asOfDate(dto.transactionDate),
        );
        const transferable = maxZero(
          (
            sourceStock.get(requirement.inventoryItemId)?.balanceQuantity ??
            new Prisma.Decimal(0)
          ).sub(
            sourceReservations.get(requirement.inventoryItemId) ??
              new Prisma.Decimal(0),
          ),
        );
        if (transferable.lessThan(requestedQuantity)) {
          throw new BadRequestException(
            `Source warehouse has only ${transferable.toString()} ${requirement.unit} unreserved stock available for transfer.`,
          );
        }
      } else if (cleanText(dto.sourceWarehouseId)) {
        throw new BadRequestException(
          "Purchase-requisition suggestions do not use a source warehouse.",
        );
      }
      const suggestionNumber = compactReference(
        dto.type === "PURCHASE_REQUISITION" ? "MPR" : "MST",
        `${scope.id}:${dto.idempotencyKey}`,
      );
      const evidence = {
        schemaVersion: 1,
        suggestionNumber,
        type: dto.type,
        mrpRunId: requirement.mrpRun.id,
        mrpRunNumber: requirement.mrpRun.runNumber,
        mrpRequirementId: requirement.id,
        planId: requirement.mrpRun.planId,
        planNumber: requirement.mrpRun.plan?.planNumber ?? null,
        item: {
          id: requirement.inventoryItem.id,
          code: requirement.inventoryItem.itemCode,
          name: requirement.inventoryItem.itemName,
        },
        requestedQuantity: requestedQuantity.toString(),
        shortageQuantity: shortageQuantity.toString(),
        unit: requirement.unit,
        requiredDate: dateOnly(requirement.requiredDate),
        sourceWarehouse: sourceWarehouse
          ? {
              id: sourceWarehouse.id,
              code: sourceWarehouse.code,
              name: sourceWarehouse.name,
            }
          : null,
        destinationWarehouse: {
          id: destinationWarehouse.id,
          code: destinationWarehouse.code,
          name: destinationWarehouse.name,
        },
        conversion: null,
      };
      const created = await tx.manufacturingWorkflowReview.create({
        data: {
          id: entityId,
          tenantId: scope.tenantId,
          companyId: scope.companyId,
          workspaceId: scope.id,
          planId: requirement.mrpRun.planId,
          workflowGroup: "PLANNING_MRP",
          workflowCode: SUPPLY_WORKFLOW_CODES[dto.type],
          entityType: "MANUFACTURING_SUPPLY_SUGGESTION",
          entityId,
          transactionDate: when,
          idempotencyKey: dto.idempotencyKey,
          title: suggestionNumber,
          outcome: "EXECUTED",
          status: "PENDING",
          reason: `MRP shortage ${shortageQuantity.toString()} ${requirement.unit}`,
          note: cleanText(dto.note),
          evidence,
          createdByUserId: currentUser.id,
        },
        include: SUPPLY_REVIEW_INCLUDE,
      });
      return this.mapSupplySuggestion(created);
    });
  }

  async approveSupplySuggestion(
    currentUser: AuthenticatedRequestUser,
    suggestionId: string,
    dto: ManufacturingPlanningApprovalDto,
  ) {
    const scope = await this.scope(currentUser, dto.workspaceId);
    const when = asDate(dto.transactionDate, "transactionDate");
    return this.serializable(async (tx) => {
      const suggestion = await this.supplySuggestionRow(
        tx,
        scope.id,
        suggestionId,
      );
      if (!suggestion)
        throw new NotFoundException(
          "Manufacturing supply suggestion not found.",
        );
      if (suggestion.status === "REJECTED") {
        throw new BadRequestException(
          "A cancelled supply suggestion cannot be approved.",
        );
      }
      const evidence = jsonObject(suggestion.evidence);
      if (jsonObject(evidence.conversion).convertedAt) {
        throw new BadRequestException(
          "A converted supply suggestion cannot be approved again.",
        );
      }
      const type = cleanText(evidence.type) as SupplySuggestionType | null;
      if (!type || !SUPPLY_SUGGESTION_TYPES.includes(type)) {
        throw new BadRequestException(
          "Supply suggestion evidence is incomplete or invalid.",
        );
      }
      const progress = await this.approvalWorkflow.advance(tx, {
        scope,
        user: currentUser,
        workflowScope: "SUPPLY_SUGGESTION",
        workflowGroup: "PLANNING_MRP",
        workflowCode: "SUPPLY_SUGGESTION_APPROVE",
        entityType: "MANUFACTURING_SUPPLY_SUGGESTION",
        entityId: suggestion.id,
        entityLabel: `${type === "PURCHASE_REQUISITION" ? "purchase requisition" : "stock transfer"} suggestion ${cleanText(evidence.suggestionNumber) ?? suggestion.id}`,
        makerUserId: suggestion.createdByUserId,
        transactionDate: when,
        idempotencyKey: dto.idempotencyKey,
        signatureMeaning: dto.signatureMeaning,
        reauthenticationPassword: dto.reauthenticationPassword,
        note: dto.note,
        fallbackPermissionKey: "manufacturing.plan.manage",
        evidence: {
          suggestionType: type,
          mrpRequirementId: cleanText(evidence.mrpRequirementId),
          requestedQuantity: evidence.requestedQuantity ?? null,
          unit: cleanText(evidence.unit),
        },
      });
      const updated = await tx.manufacturingWorkflowReview.update({
        where: { id: suggestion.id },
        data: progress.complete
          ? {
              status: "APPROVED",
              approvedByUserId: currentUser.id,
              approvedAt: when,
            }
          : {
              status: "REVIEWED",
              reviewedByUserId: currentUser.id,
              reviewedAt: when,
            },
        include: SUPPLY_REVIEW_INCLUDE,
      });
      return {
        ...this.mapSupplySuggestion(updated),
        approvalProgress: progress,
        replayed: progress.replayed,
      };
    });
  }

  async convertSupplySuggestion(
    currentUser: AuthenticatedRequestUser,
    suggestionId: string,
    dto: ConvertManufacturingSupplySuggestionDto,
  ) {
    await this.requirePermission(currentUser, "manufacturing.plan.manage");
    const scope = await this.scope(currentUser, dto.workspaceId);
    const when = asDate(dto.transactionDate, "transactionDate");
    const expectedReceiptDate = dto.expectedReceiptDate
      ? asDate(dto.expectedReceiptDate, "expectedReceiptDate")
      : null;
    if (expectedReceiptDate && expectedReceiptDate < when) {
      throw new BadRequestException(
        "Expected receipt date cannot be before the conversion date.",
      );
    }
    const existingConversion =
      await this.prisma.manufacturingWorkflowReview.findUnique({
        where: {
          workspaceId_idempotencyKey: {
            workspaceId: scope.id,
            idempotencyKey: dto.idempotencyKey,
          },
        },
      });
    if (existingConversion) {
      if (
        existingConversion.workflowCode !== "SUPPLY_SUGGESTION_CONVERT" ||
        existingConversion.entityId !== suggestionId
      ) {
        throw new ConflictException(
          "Idempotency key was already used for another manufacturing operation.",
        );
      }
      const replay = await this.supplySuggestionRow(
        this.prisma,
        scope.id,
        suggestionId,
      );
      if (!replay)
        throw new NotFoundException(
          "Manufacturing supply suggestion not found.",
        );
      const replayEvidence = jsonObject(replay.evidence);
      const replayConversion = jsonObject(replayEvidence.conversion);
      const transferId = cleanText(replayConversion.warehouseTransferId);
      const transfer = transferId
        ? await this.prisma.warehouseTransfer.findFirst({
            where: { id: transferId, workspaceId: scope.id },
            select: { id: true, transferNo: true, status: true },
          })
        : null;
      return { ...this.mapSupplySuggestion(replay, transfer), replayed: true };
    }
    const suggestion = await this.supplySuggestionRow(
      this.prisma,
      scope.id,
      suggestionId,
    );
    if (!suggestion)
      throw new NotFoundException("Manufacturing supply suggestion not found.");
    if (suggestion.status !== "APPROVED") {
      throw new BadRequestException(
        "Only a fully approved supply suggestion can be converted.",
      );
    }
    const evidence = jsonObject(suggestion.evidence);
    const existingEvidenceConversion = jsonObject(evidence.conversion);
    if (cleanText(existingEvidenceConversion.convertedAt)) {
      throw new ConflictException(
        "This supply suggestion was already converted with another request.",
      );
    }
    const type = cleanText(evidence.type) as SupplySuggestionType | null;
    if (!type || !SUPPLY_SUGGESTION_TYPES.includes(type)) {
      throw new BadRequestException(
        "Supply suggestion evidence is incomplete or invalid.",
      );
    }
    const item = jsonObject(evidence.item);
    const sourceWarehouse = jsonObject(evidence.sourceWarehouse);
    const destinationWarehouse = jsonObject(evidence.destinationWarehouse);
    const inventoryItemId = cleanText(item.id);
    const requestedQuantity = decimal(
      typeof evidence.requestedQuantity === "string" ||
        typeof evidence.requestedQuantity === "number"
        ? evidence.requestedQuantity
        : 0,
    );
    if (!inventoryItemId || requestedQuantity.lessThanOrEqualTo(0)) {
      throw new BadRequestException(
        "Supply suggestion item or quantity evidence is invalid.",
      );
    }

    let transfer: { id: string; transferNo: string; status: string } | null =
      null;
    let externalReference = cleanText(dto.externalReference);
    if (type === "PURCHASE_REQUISITION") {
      if (!externalReference) {
        throw new BadRequestException(
          "Enter the real downstream purchase-requisition reference before conversion.",
        );
      }
    } else {
      await this.requirePermission(currentUser, "warehouse.transfer");
      const sourceWarehouseId = cleanText(sourceWarehouse.id);
      const destinationWarehouseId = cleanText(destinationWarehouse.id);
      if (!sourceWarehouseId || !destinationWarehouseId) {
        throw new BadRequestException(
          "Stock-transfer suggestion warehouse evidence is incomplete.",
        );
      }
      const transferNo = cleanText(evidence.suggestionNumber) ?? suggestion.id;
      const existingTransfer = await this.prisma.warehouseTransfer.findFirst({
        where: { workspaceId: scope.id, transferNo },
        include: { lines: true },
      });
      if (existingTransfer) {
        const exactLine =
          existingTransfer.fromWarehouseId === sourceWarehouseId &&
          existingTransfer.toWarehouseId === destinationWarehouseId &&
          existingTransfer.lines.length === 1 &&
          existingTransfer.lines[0].inventoryItemId === inventoryItemId &&
          decimal(existingTransfer.lines[0].quantity).equals(requestedQuantity);
        if (!exactLine) {
          throw new ConflictException(
            `Warehouse transfer number ${transferNo} already belongs to another transfer.`,
          );
        }
        transfer = {
          id: existingTransfer.id,
          transferNo: existingTransfer.transferNo,
          status: existingTransfer.status,
        };
      } else {
        const posted = await this.inventory.createTransfer(currentUser, {
          workspaceId: scope.id,
          transferNo,
          transferDate: when.toISOString(),
          fromWarehouseId: sourceWarehouseId,
          toWarehouseId: destinationWarehouseId,
          notes:
            cleanText(dto.note) ??
            `Converted from manufacturing supply suggestion ${transferNo}`,
          lines: [
            {
              inventoryItemId,
              quantity: requestedQuantity.toNumber(),
            },
          ],
        });
        transfer = {
          id: posted.id,
          transferNo: posted.transferNo,
          status: posted.status,
        };
      }
      externalReference = transfer.transferNo;
    }
    try {
      const updated = await this.serializable(async (tx) => {
        await tx.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`manufacturing-supply-convert:${scope.id}:${suggestion.id}`}, 0))`,
        );
        const current = await this.supplySuggestionRow(
          tx,
          scope.id,
          suggestion.id,
        );
        if (!current)
          throw new NotFoundException(
            "Manufacturing supply suggestion not found.",
          );
        const currentEvidence = jsonObject(current.evidence);
        const currentConversion = jsonObject(currentEvidence.conversion);
        if (
          cleanText(currentConversion.convertedAt) &&
          cleanText(currentConversion.conversionIdempotencyKey) !==
            dto.idempotencyKey
        ) {
          throw new ConflictException(
            "This supply suggestion was already converted with another request.",
          );
        }
        const conversion = {
          convertedAt: when.toISOString(),
          convertedByUserId: currentUser.id,
          conversionIdempotencyKey: dto.idempotencyKey,
          externalReference,
          expectedReceiptDate: expectedReceiptDate
            ? dateOnly(expectedReceiptDate)
            : null,
          warehouseTransferId: transfer?.id ?? null,
          warehouseTransferNo: transfer?.transferNo ?? null,
          note: cleanText(dto.note),
        };
        await tx.manufacturingWorkflowReview.create({
          data: {
            tenantId: scope.tenantId,
            companyId: scope.companyId,
            workspaceId: scope.id,
            planId: current.planId,
            workflowGroup: "PLANNING_MRP",
            workflowCode: "SUPPLY_SUGGESTION_CONVERT",
            entityType: "MANUFACTURING_SUPPLY_SUGGESTION",
            entityId: current.id,
            transactionDate: when,
            idempotencyKey: dto.idempotencyKey,
            title: `Convert ${cleanText(currentEvidence.suggestionNumber) ?? current.id}`,
            outcome: "EXECUTED",
            status: "REVIEWED",
            reason:
              type === "PURCHASE_REQUISITION"
                ? "Converted to a real downstream purchase requisition."
                : "Converted and posted as a warehouse stock transfer.",
            note: cleanText(dto.note),
            evidence: conversion,
            reviewedByUserId: currentUser.id,
            reviewedAt: when,
            createdByUserId: currentUser.id,
          },
        });
        const row = await tx.manufacturingWorkflowReview.update({
          where: { id: current.id },
          data: {
            evidence: {
              ...currentEvidence,
              conversion,
            } as Prisma.InputJsonValue,
          },
          include: SUPPLY_REVIEW_INCLUDE,
        });
        await tx.auditLog.create({
          data: {
            tenantId: scope.tenantId,
            companyId: scope.companyId,
            workspaceId: scope.id,
            userId: currentUser.id,
            action: "MANUFACTURING_SUPPLY_SUGGESTION_CONVERTED",
            entityType: "MANUFACTURING_SUPPLY_SUGGESTION",
            entityId: current.id,
            oldValues: {
              status: current.status,
              conversion: currentConversion,
            } as Prisma.InputJsonValue,
            newValues: {
              status: "CONVERTED",
              conversion,
            } as Prisma.InputJsonValue,
          },
        });
        return row;
      });
      return {
        ...this.mapSupplySuggestion(updated, transfer),
        replayed: false,
      };
    } catch (error) {
      if (isUniqueError(error)) {
        const replay = await this.prisma.manufacturingWorkflowReview.findUnique(
          {
            where: {
              workspaceId_idempotencyKey: {
                workspaceId: scope.id,
                idempotencyKey: dto.idempotencyKey,
              },
            },
          },
        );
        if (
          replay?.workflowCode === "SUPPLY_SUGGESTION_CONVERT" &&
          replay.entityId === suggestion.id
        ) {
          const current = await this.supplySuggestionRow(
            this.prisma,
            scope.id,
            suggestion.id,
          );
          if (current)
            return {
              ...this.mapSupplySuggestion(current, transfer),
              replayed: true,
            };
        }
      }
      throw error;
    }
  }

  async cancelSupplySuggestion(
    currentUser: AuthenticatedRequestUser,
    suggestionId: string,
    dto: CancelManufacturingSupplySuggestionDto,
  ) {
    await this.requirePermission(currentUser, "manufacturing.plan.manage");
    const scope = await this.scope(currentUser, dto.workspaceId);
    const when = asDate(dto.transactionDate, "transactionDate");
    const reason = cleanText(dto.reason);
    if (!reason)
      throw new BadRequestException("A cancellation reason is required.");
    return this.serializable(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`manufacturing-supply-cancel:${scope.id}:${suggestionId}`}, 0))`,
      );
      const replay = await tx.manufacturingWorkflowReview.findUnique({
        where: {
          workspaceId_idempotencyKey: {
            workspaceId: scope.id,
            idempotencyKey: dto.idempotencyKey,
          },
        },
      });
      if (replay) {
        if (
          replay.workflowCode !== "SUPPLY_SUGGESTION_CANCEL" ||
          replay.entityId !== suggestionId
        ) {
          throw new ConflictException(
            "Idempotency key was already used for another manufacturing operation.",
          );
        }
        const current = await this.supplySuggestionRow(
          tx,
          scope.id,
          suggestionId,
        );
        if (!current)
          throw new NotFoundException(
            "Manufacturing supply suggestion not found.",
          );
        return { ...this.mapSupplySuggestion(current), replayed: true };
      }
      const current = await this.supplySuggestionRow(
        tx,
        scope.id,
        suggestionId,
      );
      if (!current)
        throw new NotFoundException(
          "Manufacturing supply suggestion not found.",
        );
      const evidence = jsonObject(current.evidence);
      if (cleanText(jsonObject(evidence.conversion).convertedAt)) {
        throw new BadRequestException(
          "A converted supply suggestion cannot be cancelled; reverse its downstream document through that module.",
        );
      }
      if (current.status === "APPROVED") {
        throw new BadRequestException(
          "An approved supply suggestion requires a separately approved downstream cancellation; it cannot be silently cancelled here.",
        );
      }
      if (current.status === "REJECTED") {
        throw new BadRequestException(
          "This supply suggestion is already cancelled or rejected.",
        );
      }
      await tx.manufacturingWorkflowReview.create({
        data: {
          tenantId: scope.tenantId,
          companyId: scope.companyId,
          workspaceId: scope.id,
          planId: current.planId,
          workflowGroup: "PLANNING_MRP",
          workflowCode: "SUPPLY_SUGGESTION_CANCEL",
          entityType: "MANUFACTURING_SUPPLY_SUGGESTION",
          entityId: current.id,
          transactionDate: when,
          idempotencyKey: dto.idempotencyKey,
          title: `Cancel ${cleanText(evidence.suggestionNumber) ?? current.id}`,
          outcome: "EXECUTED",
          status: "REVIEWED",
          reason,
          reviewedByUserId: currentUser.id,
          reviewedAt: when,
          createdByUserId: currentUser.id,
        },
      });
      const updated = await tx.manufacturingWorkflowReview.update({
        where: { id: current.id },
        data: {
          status: "REJECTED",
          reason,
          reviewedByUserId: currentUser.id,
          reviewedAt: when,
        },
        include: SUPPLY_REVIEW_INCLUDE,
      });
      await tx.auditLog.create({
        data: {
          tenantId: scope.tenantId,
          companyId: scope.companyId,
          workspaceId: scope.id,
          userId: currentUser.id,
          action: "MANUFACTURING_SUPPLY_SUGGESTION_CANCELLED",
          entityType: "MANUFACTURING_SUPPLY_SUGGESTION",
          entityId: current.id,
          oldValues: { status: current.status } as Prisma.InputJsonValue,
          newValues: { status: "REJECTED", reason } as Prisma.InputJsonValue,
        },
      });
      return { ...this.mapSupplySuggestion(updated), replayed: false };
    });
  }
}
