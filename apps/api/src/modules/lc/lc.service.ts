import { randomUUID } from "crypto";
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import {
  LcAllocationBasis,
  LcAllocationMode,
  LcCostCategory,
  LcProfitMode,
  LcStatus,
  Prisma,
} from "@bizovix/database";
import { AccountingService } from "../accounting/accounting.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { CashBankService } from "../cash-bank/cash-bank.service";
import { PrismaService } from "../prisma/prisma.service";
import { NumberingService } from "../settings-numbering/numbering.service";
import { allocateLcCost } from "./lc-allocation";
import {
  CreateLcDto,
  InventoryPostingDto,
  LcCostEntryDto,
  LcCostHeadDto,
  LcGrnDto,
  LcItemInputDto,
  LcStatusDto,
  PaymentAllocationDto,
  ProfitDto,
  ReopenLcDto,
  SaveAllocationDto,
  ShipmentDto,
  UpdateInventoryPostingDto,
  UpdateLcCostEntryDto,
  UpdateLcCostHeadDto,
  UpdateLcDto,
  WarehouseDto,
} from "./dto/lc.dto";

type Tx = Prisma.TransactionClient;
const D = (value: Prisma.Decimal | number | string | null | undefined) => new Prisma.Decimal(value ?? 0);
const money = (value: Prisma.Decimal | number | string) => D(value).toDecimalPlaces(4);
const defaultCostHeads: Array<{ code: string; name: string; category: LcCostCategory; defaultAllocationMethod: LcAllocationBasis }> = [
  { code: "LC_BANK_CHARGE", name: "LC Opening & Bank Charges", category: "LC_BANKING", defaultAllocationMethod: "PURCHASE_VALUE" },
  { code: "ORIGIN_CHARGE", name: "Origin Charges", category: "ORIGIN", defaultAllocationMethod: "WEIGHT" },
  { code: "FREIGHT", name: "Freight", category: "FREIGHT", defaultAllocationMethod: "WEIGHT" },
  { code: "INSURANCE", name: "Marine Insurance", category: "INSURANCE", defaultAllocationMethod: "PURCHASE_VALUE" },
  { code: "CUSTOMS_DUTY", name: "Customs Duty", category: "CUSTOMS", defaultAllocationMethod: "PURCHASE_VALUE" },
  { code: "IMPORT_TAX", name: "Import Tax & VAT", category: "TAX", defaultAllocationMethod: "PURCHASE_VALUE" },
  { code: "CNF", name: "C&F Agent Charges", category: "CNF", defaultAllocationMethod: "PURCHASE_VALUE" },
  { code: "PORT", name: "Port & Handling", category: "PORT", defaultAllocationMethod: "WEIGHT" },
  { code: "DEST_TRANSPORT", name: "Destination Transport", category: "DESTINATION_TRANSPORT", defaultAllocationMethod: "WEIGHT" },
  { code: "LOCAL", name: "Local Handling", category: "LOCAL", defaultAllocationMethod: "QUANTITY" },
  { code: "OTHER", name: "Other Import Cost", category: "OTHER", defaultAllocationMethod: "PURCHASE_VALUE" },
];
const lcInclude = {
  supplier: { select: { id: true, code: true, name: true } },
  destinationWarehouse: true,
  items: { include: { item: true, allocations: { include: { costEntry: { include: { costHead: true } } } }, grnItems: true, inventoryPosting: { include: { warehouse: true, stockMovement: true } } }, orderBy: { sortOrder: "asc" as const } },
  shipments: { orderBy: { createdAt: "desc" as const } },
  costEntries: { include: { costHead: true, shipment: true, allocations: { include: { lcItem: true } }, payable: true }, orderBy: { createdAt: "desc" as const } },
  grns: { include: { warehouse: true, items: { include: { lcItem: true } } }, orderBy: { receivedDate: "desc" as const } },
  statusHistory: { orderBy: { changedAt: "desc" as const } },
  landedCost: { include: { items: { include: { lcItem: true } } } },
  purchasePayable: true,
};

@Injectable()
export class LcService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
    private readonly cashBank: CashBankService,
    private readonly audit: AuditLogService,
    private readonly numbering: NumberingService,
  ) {}

  private async log(org: string, userId: string, action: string, entityId?: string, value?: unknown) {
    await this.audit.record({ organizationId: org, userId, action, module: "LC Management", entityType: "LcMaster", entityId, newValue: value });
  }

  private async load(org: string, id: string) {
    const row = await this.prisma.lcMaster.findFirst({ where: { id, organizationId: org }, include: lcInclude });
    if (!row) throw new NotFoundException("LC not found");
    return row;
  }

  private readAllocations(value: Prisma.JsonValue | null | undefined): PaymentAllocationDto[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
      const row = entry as Record<string, unknown>;
      return typeof row.accountId === "string" && Number(row.amount) > 0 ? [{ accountId: row.accountId, amount: Number(row.amount), reference: typeof row.reference === "string" ? row.reference : undefined }] : [];
    });
  }

  private itemData(org: string, items: LcItemInputDto[], exchangeRate: Prisma.Decimal) {
    return items.map((item, index) => {
      const quantity = D(item.quantity), foreignUnitPrice = D(item.foreignUnitPrice);
      const calculated = money(foreignUnitPrice.mul(exchangeRate));
      const accepted = item.acceptedBdtUnitPrice === undefined ? null : money(item.acceptedBdtUnitPrice);
      return {
        organizationId: org, itemId: item.itemId, productName: item.productName.trim(), description: item.description?.trim(), unit: item.unit?.trim() || "pcs", quantity,
        foreignUnitPrice, exchangeRate, calculatedBdtUnitPrice: calculated, acceptedBdtUnitPrice: accepted, totalPurchaseCostBdt: money((accepted ?? calculated).mul(quantity)),
        weight: item.weight === undefined ? undefined : D(item.weight), cbm: item.cbm === undefined ? undefined : D(item.cbm), hsCode: item.hsCode?.trim(), sortOrder: index,
      };
    });
  }

  private async validateItems(tx: Tx, org: string, items: LcItemInputDto[]) {
    const ids = [...new Set(items.map((item) => item.itemId).filter((id): id is string => Boolean(id)))];
    if (!ids.length) return;
    const count = await tx.item.count({ where: { organizationId: org, id: { in: ids }, status: "ACTIVE" } });
    if (count !== ids.length) throw new BadRequestException("One or more inventory items are invalid");
  }

  private validatePaymentState(total: Prisma.Decimal, status: string, paid: Prisma.Decimal, allocations: PaymentAllocationDto[]) {
    if (paid.lt(0) || paid.gt(total)) throw new BadRequestException("Paid amount must be between zero and purchase total");
    if (status === "UNPAID" && !paid.eq(0)) throw new BadRequestException("An unpaid LC cannot have a paid amount");
    if (status === "PARTIAL" && (paid.lte(0) || paid.gte(total))) throw new BadRequestException("A partial payment must be above zero and below purchase total");
    if (status === "PAID" && !paid.eq(total)) throw new BadRequestException("A paid LC must be paid in full");
    const allocated = allocations.reduce((sum, row) => sum.add(row.amount), D(0));
    if (!allocated.eq(paid)) throw new BadRequestException("Payment allocations must equal the paid amount");
  }

  private async lcLedgers(tx: Tx, org: string) {
    const clearing = await this.accounting.ensureCustomAccount(tx, org, { code: "LC-CLEARING", name: "LC Import Clearing", parentSystemKey: "ASSETS", accountType: "ASSET", normalBalance: "DEBIT" });
    const inventory = await this.accounting.ensureCustomAccount(tx, org, { code: "LC-INVENTORY", name: "Imported Inventory", parentSystemKey: "ASSETS", accountType: "ASSET", normalBalance: "DEBIT" });
    return { clearing, inventory };
  }

  private async validateBankAllocations(tx: Tx, org: string, rows: PaymentAllocationDto[]) {
    const ids = [...new Set(rows.map((row) => row.accountId))];
    if (!ids.length) return;
    const count = await tx.bankAccount.count({ where: { organizationId: org, id: { in: ids } } });
    if (count !== ids.length) throw new BadRequestException("One or more payment accounts are invalid");
  }

  private async postPurchase(tx: Tx, org: string, userId: string, lc: { id: string; lcNumber: string; lcDate: Date; supplierId: string | null; supplierName: string; purchasePaidAmount: Prisma.Decimal; paymentAllocations: Prisma.JsonValue | null; purchasePostingVersion: number; items: Array<{ totalPurchaseCostBdt: Prisma.Decimal }> }) {
    const total = lc.items.reduce((sum, item) => sum.add(item.totalPurchaseCostBdt), D(0));
    const paid = lc.purchasePaidAmount;
    const allocations = this.readAllocations(lc.paymentAllocations);
    await this.validateBankAllocations(tx, org, allocations);
    const { clearing } = await this.lcLedgers(tx, org);
    const payable = await tx.payable.create({ data: { organizationId: org, partyId: lc.supplierId, partyName: lc.supplierName, partyType: "SUPPLIER", billNo: `LC-${lc.lcNumber}-V${lc.purchasePostingVersion}`, billDate: lc.lcDate, amount: total, paidAmount: paid, status: paid.eq(total) ? "PAID" : paid.gt(0) ? "PARTIALLY_PAID" : "UNPAID", description: `LC purchase ${lc.lcNumber}`, createdById: userId } });
    const versionKey = `${lc.id}:v${lc.purchasePostingVersion}`;
    for (let index = 0; index < allocations.length; index += 1) {
      const row = allocations[index];
      await this.cashBank.post(tx, { organizationId: org, accountId: row.accountId, direction: "OUT", amount: row.amount, sourceModule: "LC_PURCHASE", sourceType: "PURCHASE_PAYMENT", sourceId: `${versionKey}:${index}`, referenceNo: row.reference ?? lc.lcNumber, description: `LC purchase payment ${lc.lcNumber}`, transactionDate: lc.lcDate, createdById: userId });
    }
    const outstanding = total.sub(paid);
    const journal = await this.accounting.post(tx, { organizationId: org, userId, journalDate: lc.lcDate, referenceNo: lc.lcNumber, description: `LC purchase and payment position for ${lc.lcNumber}`, sourceModule: "LC_PURCHASE", sourceType: "PURCHASE", sourceId: versionKey, lines: [
      { accountId: clearing.id, debit: total, credit: 0 },
      ...allocations.map((row) => ({ bankAccountId: row.accountId, debit: 0, credit: row.amount, description: row.reference })),
      ...(outstanding.gt(0) ? [{ systemKey: "ACCOUNTS_PAYABLE", debit: 0, credit: outstanding, partyName: lc.supplierName, partyType: "SUPPLIER" }] : []),
    ] });
    await tx.lcMaster.update({ where: { id: lc.id }, data: { purchaseJournalId: journal.id, purchasePayableId: payable.id } });
  }

  private async reversePurchase(tx: Tx, org: string, userId: string, lc: { id: string; purchasePostingVersion: number; purchasePayableId: string | null; paymentAllocations: Prisma.JsonValue | null }) {
    const versionKey = `${lc.id}:v${lc.purchasePostingVersion}`;
    await this.accounting.reverseSource(tx, org, userId, "LC_PURCHASE", versionKey);
    const allocations = this.readAllocations(lc.paymentAllocations);
    for (let index = 0; index < allocations.length; index += 1) await this.cashBank.reverseSource(tx, { organizationId: org, sourceModule: "LC_PURCHASE", sourceId: `${versionKey}:${index}`, userId, reason: "LC purchase revision" });
    if (lc.purchasePayableId) {
      const paidByModule = await tx.supplierPayment.count({ where: { organizationId: org, payableId: lc.purchasePayableId } });
      if (paidByModule) throw new ConflictException("LC payable has supplier payments and cannot be revised");
      await tx.lcMaster.updateMany({ where: { id: lc.id, organizationId: org, purchasePayableId: lc.purchasePayableId }, data: { purchasePayableId: null, purchaseJournalId: null } });
      await tx.payable.deleteMany({ where: { id: lc.purchasePayableId, organizationId: org } });
    }
  }

  async list(org: string) { return this.prisma.lcMaster.findMany({ where: { organizationId: org }, include: { supplier: true, destinationWarehouse: true, _count: { select: { items: true, shipments: true, costEntries: true, grns: true } }, landedCost: true }, orderBy: { createdAt: "desc" } }); }
  async dashboard(org: string) {
    const rows = await this.prisma.lcMaster.findMany({ where: { organizationId: org }, include: { items: true, costEntries: true, landedCost: true } });
    const purchase = rows.flatMap((row) => row.items).reduce((sum, item) => sum.add(item.totalPurchaseCostBdt), D(0));
    const landed = rows.reduce((sum, row) => sum.add(row.landedCost?.landedCostTotal ?? 0), D(0));
    return { total: rows.length, draft: rows.filter((row) => row.status === "DRAFT").length, active: rows.filter((row) => !["DRAFT", "FINALIZED", "CLOSED", "CANCELLED"].includes(row.status)).length, finalized: rows.filter((row) => row.status === "FINALIZED" || row.status === "CLOSED").length, purchaseValue: purchase.toFixed(4), landedValue: landed.toFixed(4) };
  }
  findOne(org: string, id: string) { return this.load(org, id); }

  async create(org: string, userId: string, dto: CreateLcDto) {
    const exchangeRate = D(dto.exchangeRate), allocations = dto.paymentAllocations ?? [];
    const rows = this.itemData(org, dto.items, exchangeRate), total = rows.reduce((sum, row) => sum.add(row.totalPurchaseCostBdt), D(0));
    const paid = money(dto.purchasePaidAmount ?? (dto.purchasePaymentStatus === "PAID" ? total : 0));
    const status = dto.purchasePaymentStatus ?? (paid.eq(total) ? "PAID" : paid.gt(0) ? "PARTIAL" : "UNPAID");
    this.validatePaymentState(total, status, paid, allocations);
    const result = await this.prisma.$transaction(async (tx) => {
      await this.validateItems(tx, org, dto.items);
      if (dto.supplierId && !(await tx.party.findFirst({ where: { id: dto.supplierId, organizationId: org, status: "ACTIVE", roles: { hasSome: ["SUPPLIER", "VENDOR"] } } }))) throw new NotFoundException("Supplier not found");
      if (dto.destinationWarehouseId && !(await tx.warehouse.findFirst({ where: { id: dto.destinationWarehouseId, organizationId: org, isActive: true } }))) throw new NotFoundException("Warehouse not found");
      await this.validateBankAllocations(tx, org, allocations);
      const lcNumber = dto.lcNumber?.trim().toUpperCase() || await this.numbering.next(org, "LC", tx);
      const lc = await tx.lcMaster.create({ data: { organizationId: org, lcNumber, lcDate: new Date(dto.lcDate), supplierId: dto.supplierId, supplierName: dto.supplierName.trim(), supplierCountry: dto.supplierCountry?.trim(), purchaseOrderRef: dto.purchaseOrderRef?.trim(), piReference: dto.piReference?.trim(), bankName: dto.bankName?.trim(), bankBranch: dto.bankBranch?.trim(), lcType: dto.lcType?.trim(), currency: dto.currency?.trim().toUpperCase() || "USD", exchangeRate, incoterm: dto.incoterm?.trim(), originCountry: dto.originCountry?.trim(), originPort: dto.originPort?.trim(), destinationPort: dto.destinationPort?.trim(), destinationWarehouseId: dto.destinationWarehouseId, lastShipmentDate: dto.lastShipmentDate ? new Date(dto.lastShipmentDate) : undefined, expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined, remarks: dto.remarks?.trim(), purchasePaymentStatus: status, purchasePaidAmount: paid, paymentReference: dto.paymentReference?.trim(), paymentAllocations: allocations as never, status: "DRAFT", createdById: userId, items: { create: rows } }, include: { items: true } });
      await this.postPurchase(tx, org, userId, lc);
      await tx.lcStatusHistory.create({ data: { organizationId: org, lcId: lc.id, toStatus: "DRAFT", changedById: userId } });
      return lc.id;
    });
    await this.log(org, userId, "LC_CREATED", result, { itemCount: dto.items.length });
    return this.load(org, result);
  }

  async update(org: string, userId: string, id: string, dto: UpdateLcDto) {
    const old = await this.load(org, id);
    if (["FINALIZED", "CLOSED", "CANCELLED"].includes(old.status)) throw new BadRequestException("Finalized, closed or cancelled LCs cannot be edited");
    if (dto.items && old.grns.length) throw new ConflictException("Products cannot be changed after a GRN is recorded");
    const nextRate = dto.exchangeRate === undefined ? old.exchangeRate : D(dto.exchangeRate);
    const inputs: LcItemInputDto[] = dto.items ?? old.items.map((item) => ({ itemId: item.itemId ?? undefined, productName: item.productName, description: item.description ?? undefined, unit: item.unit, quantity: item.quantity.toNumber(), foreignUnitPrice: item.foreignUnitPrice.toNumber(), acceptedBdtUnitPrice: item.acceptedBdtUnitPrice?.toNumber(), weight: item.weight?.toNumber(), cbm: item.cbm?.toNumber(), hsCode: item.hsCode ?? undefined }));
    const itemRows = this.itemData(org, inputs, nextRate), total = itemRows.reduce((sum, row) => sum.add(row.totalPurchaseCostBdt), D(0));
    const allocations = dto.paymentAllocations ?? this.readAllocations(old.paymentAllocations);
    const paid = dto.purchasePaidAmount === undefined ? old.purchasePaidAmount : money(dto.purchasePaidAmount);
    const paymentStatus = dto.purchasePaymentStatus ?? old.purchasePaymentStatus;
    this.validatePaymentState(total, paymentStatus, paid, allocations);
    const financial = Boolean(dto.items || dto.exchangeRate !== undefined || dto.lcDate || dto.supplierId !== undefined || dto.supplierName || dto.purchasePaidAmount !== undefined || dto.purchasePaymentStatus || dto.paymentAllocations);
    await this.prisma.$transaction(async (tx) => {
      await this.validateItems(tx, org, inputs);
      if (dto.supplierId && !(await tx.party.findFirst({ where: { id: dto.supplierId, organizationId: org, status: "ACTIVE", roles: { hasSome: ["SUPPLIER", "VENDOR"] } } }))) throw new NotFoundException("Supplier not found");
      if (dto.destinationWarehouseId && !(await tx.warehouse.findFirst({ where: { id: dto.destinationWarehouseId, organizationId: org, isActive: true } }))) throw new NotFoundException("Warehouse not found");
      await this.validateBankAllocations(tx, org, allocations);
      if (financial) await this.reversePurchase(tx, org, userId, old);
      if (dto.items) {
        await tx.lcItem.deleteMany({ where: { lcId: id, organizationId: org } });
        await tx.lcItem.createMany({ data: itemRows.map((row) => ({ ...row, lcId: id })) });
      } else if (dto.exchangeRate !== undefined) {
        for (const item of old.items) {
          const calculated = money(item.foreignUnitPrice.mul(nextRate));
          await tx.lcItem.update({ where: { id: item.id }, data: { exchangeRate: nextRate, calculatedBdtUnitPrice: calculated, totalPurchaseCostBdt: money((item.acceptedBdtUnitPrice ?? calculated).mul(item.quantity)) } });
        }
      }
      await tx.lcMaster.update({ where: { id }, data: { lcDate: dto.lcDate ? new Date(dto.lcDate) : undefined, supplierId: dto.supplierId, supplierName: dto.supplierName?.trim(), supplierCountry: dto.supplierCountry !== undefined ? dto.supplierCountry?.trim() || null : undefined, purchaseOrderRef: dto.purchaseOrderRef !== undefined ? dto.purchaseOrderRef?.trim() || null : undefined, piReference: dto.piReference !== undefined ? dto.piReference?.trim() || null : undefined, bankName: dto.bankName !== undefined ? dto.bankName?.trim() || null : undefined, bankBranch: dto.bankBranch !== undefined ? dto.bankBranch?.trim() || null : undefined, lcType: dto.lcType !== undefined ? dto.lcType?.trim() || null : undefined, exchangeRate: dto.exchangeRate, incoterm: dto.incoterm !== undefined ? dto.incoterm?.trim() || null : undefined, originCountry: dto.originCountry !== undefined ? dto.originCountry?.trim() || null : undefined, originPort: dto.originPort !== undefined ? dto.originPort?.trim() || null : undefined, destinationPort: dto.destinationPort !== undefined ? dto.destinationPort?.trim() || null : undefined, destinationWarehouseId: dto.destinationWarehouseId, lastShipmentDate: dto.lastShipmentDate !== undefined ? dto.lastShipmentDate ? new Date(dto.lastShipmentDate) : null : undefined, expiryDate: dto.expiryDate !== undefined ? dto.expiryDate ? new Date(dto.expiryDate) : null : undefined, remarks: dto.remarks !== undefined ? dto.remarks?.trim() || null : undefined, purchasePaymentStatus: paymentStatus, purchasePaidAmount: paid, paymentReference: dto.paymentReference !== undefined ? dto.paymentReference?.trim() || null : undefined, paymentAllocations: allocations as never, purchaseJournalId: financial ? null : undefined, purchasePayableId: financial ? null : undefined, purchasePostingVersion: financial ? { increment: 1 } : undefined } });
      if (financial) {
        const fresh = await tx.lcMaster.findUniqueOrThrow({ where: { id }, include: { items: true } });
        await this.postPurchase(tx, org, userId, fresh);
      }
      if (dto.items) {
        const freshItems = await tx.lcItem.findMany({ where: { lcId: id, organizationId: org } });
        const autoEntries = await tx.lcCostEntry.findMany({ where: { lcId: id, organizationId: org, allocationMode: "AUTO" } });
        for (const entry of autoEntries) await this.applyAllocation(tx, org, freshItems, entry.id, entry.bdtAmount, { allocationMode: "AUTO", allocationBasis: entry.allocationBasis ?? "PURCHASE_VALUE", rows: freshItems.map((item) => ({ lcItemId: item.id })) });
      }
    });
    await this.log(org, userId, "LC_UPDATED", id);
    return this.load(org, id);
  }

  async setStatus(org: string, userId: string, id: string, dto: LcStatusDto) {
    const lc = await this.load(org, id), next = dto.status as LcStatus;
    if (lc.status === next) return lc;
    if (lc.status === "CLOSED") throw new BadRequestException("Closed LCs cannot be changed");
    if (lc.status === "FINALIZED" && next !== "CLOSED") throw new BadRequestException("Use Reopen to change a finalized LC");
    if (next === "CLOSED") {
      if (lc.landedCost?.status !== "FINALIZED") throw new BadRequestException("Finalize landed cost before closing");
      if (lc.items.some((item) => !item.inventoryPosting)) throw new BadRequestException("Post every LC item to inventory before closing");
    }
    await this.prisma.$transaction(async (tx) => { await tx.lcMaster.update({ where: { id }, data: { status: next } }); await tx.lcStatusHistory.create({ data: { organizationId: org, lcId: id, fromStatus: lc.status, toStatus: next, reason: dto.reason?.trim(), changedById: userId } }); });
    await this.log(org, userId, "LC_STATUS_CHANGED", id, { from: lc.status, to: next, reason: dto.reason });
    return this.load(org, id);
  }

  async remove(org: string, userId: string, id: string) {
    const lc = await this.load(org, id);
    if (lc.costEntries.length || lc.grns.length || lc.items.some((item) => item.inventoryPosting)) throw new ConflictException("Remove LC cost entries, GRNs and inventory postings before deleting");
    await this.prisma.$transaction(async (tx) => { if (lc.landedCost?.journalEntryId) await this.accounting.reverseSource(tx, org, userId, "LC_LANDED_COST", `${id}:v${lc.landedCost.postingVersion}`); await this.reversePurchase(tx, org, userId, lc); await tx.lcMaster.delete({ where: { id } }); });
    await this.log(org, userId, "LC_DELETED", id, { lcNumber: lc.lcNumber });
    return { id, success: true };
  }

  listWarehouses(org: string) { return this.prisma.warehouse.findMany({ where: { organizationId: org }, orderBy: [{ isActive: "desc" }, { name: "asc" }] }); }
  async createWarehouse(org: string, userId: string, dto: WarehouseDto) { const row = await this.prisma.warehouse.create({ data: { organizationId: org, code: dto.code.trim().toUpperCase(), name: dto.name.trim(), address: dto.address?.trim() } }); await this.log(org, userId, "WAREHOUSE_CREATED", row.id, row); return row; }

  async listCostHeads(org: string) {
    await this.prisma.lcCostHead.createMany({ data: defaultCostHeads.map((head, sortOrder) => ({ organizationId: org, ...head, fallbackAllocationMethod: "EQUAL" as LcAllocationBasis, includeInLandedCost: true, manualOverrideAllowed: true, isSystem: true, sortOrder })), skipDuplicates: true });
    return this.prisma.lcCostHead.findMany({ where: { organizationId: org }, include: { glAccount: { select: { id: true, code: true, name: true } }, _count: { select: { costEntries: true } } }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  }
  async createCostHead(org: string, userId: string, dto: LcCostHeadDto) {
    if (dto.glAccountId && !(await this.prisma.ledgerAccount.findFirst({ where: { id: dto.glAccountId, organizationId: org, isActive: true } }))) throw new NotFoundException("GL account not found");
    const code = dto.code?.trim().toUpperCase() || dto.name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 24);
    const row = await this.prisma.lcCostHead.create({ data: { organizationId: org, code, name: dto.name.trim(), category: dto.category as LcCostCategory, defaultCurrency: dto.defaultCurrency?.trim().toUpperCase(), defaultAllocationMethod: dto.defaultAllocationMethod as LcAllocationBasis, fallbackAllocationMethod: dto.fallbackAllocationMethod as LcAllocationBasis, includeInLandedCost: dto.includeInLandedCost, manualOverrideAllowed: dto.manualOverrideAllowed, glAccountId: dto.glAccountId, isSystem: false } });
    await this.log(org, userId, "LC_COST_HEAD_CREATED", row.id); return row;
  }
  async updateCostHead(org: string, userId: string, id: string, dto: UpdateLcCostHeadDto) { const old = await this.prisma.lcCostHead.findFirst({ where: { id, organizationId: org } }); if (!old) throw new NotFoundException("LC cost head not found"); if (old.isSystem && (dto.isActive === false || dto.glAccountId === null)) throw new BadRequestException("System LC cost heads cannot be disabled or detached"); if (dto.glAccountId && !(await this.prisma.ledgerAccount.findFirst({ where: { id: dto.glAccountId, organizationId: org, isActive: true } }))) throw new NotFoundException("GL account not found"); const row = await this.prisma.lcCostHead.update({ where: { id }, data: { ...dto, name: dto.name?.trim(), defaultAllocationMethod: dto.defaultAllocationMethod as LcAllocationBasis, fallbackAllocationMethod: dto.fallbackAllocationMethod as LcAllocationBasis } }); await this.log(org, userId, "LC_COST_HEAD_UPDATED", id); return row; }
  async deleteCostHead(org: string, userId: string, id: string) { const row = await this.prisma.lcCostHead.findFirst({ where: { id, organizationId: org }, include: { _count: { select: { costEntries: true } } } }); if (!row) throw new NotFoundException("LC cost head not found"); if (row.isSystem || row._count.costEntries) throw new ConflictException("This cost head is protected or in use"); await this.prisma.lcCostHead.delete({ where: { id } }); await this.log(org, userId, "LC_COST_HEAD_DELETED", id); return { id, success: true }; }

  async addShipment(org: string, userId: string, lcId: string, dto: ShipmentDto) { const lc = await this.load(org, lcId); if (["FINALIZED", "CLOSED", "CANCELLED"].includes(lc.status)) throw new BadRequestException("This LC cannot be edited"); const row = await this.prisma.lcShipment.create({ data: { organizationId: org, lcId, transportMode: dto.transportMode, shipmentNumber: dto.shipmentNumber?.trim(), blAwbNumber: dto.blAwbNumber?.trim(), etd: dto.etd ? new Date(dto.etd) : undefined, eta: dto.eta ? new Date(dto.eta) : undefined, containerNumber: dto.containerNumber?.trim(), forwarderName: dto.forwarderName?.trim(), shippingLine: dto.shippingLine?.trim(), remarks: dto.remarks?.trim() } }); await this.log(org, userId, "LC_SHIPMENT_CREATED", lcId, { shipmentId: row.id }); return row; }
  async deleteShipment(org: string, userId: string, lcId: string, shipmentId: string) { const row = await this.prisma.lcShipment.findFirst({ where: { id: shipmentId, lcId, organizationId: org }, include: { _count: { select: { costEntries: true } } } }); if (!row) throw new NotFoundException("Shipment not found"); if (row._count.costEntries) throw new ConflictException("Shipment has cost entries and cannot be deleted"); await this.prisma.lcShipment.delete({ where: { id: shipmentId } }); await this.log(org, userId, "LC_SHIPMENT_DELETED", lcId, { shipmentId }); return { id: shipmentId, success: true }; }

  private costAmount(dto: { currency?: string; foreignAmount?: number; exchangeRate?: number; bdtAmount?: number }, fallback?: Prisma.Decimal) {
    const currency = dto.currency?.trim().toUpperCase() ?? "BDT";
    if (currency === "BDT") {
      const amount = dto.bdtAmount === undefined ? fallback : D(dto.bdtAmount);
      if (!amount || amount.lte(0)) throw new BadRequestException("BDT amount must be positive");
      return money(amount);
    }
    if (dto.foreignAmount === undefined || dto.exchangeRate === undefined) throw new BadRequestException("Foreign amount and exchange rate are required");
    const amount = D(dto.foreignAmount).mul(dto.exchangeRate);
    if (amount.lte(0)) throw new BadRequestException("Converted cost amount must be positive");
    return money(amount);
  }

  private async postCostAccounting(tx: Tx, org: string, userId: string, entry: { id: string; lcId: string; costHeadId: string; vendorName: string | null; creditPayeeName: string | null; invoiceNumber: string | null; invoiceDate: Date | null; bdtAmount: Prisma.Decimal; paymentMethod: string | null; paymentAllocations: Prisma.JsonValue | null; postingVersion: number }) {
    const lc = await tx.lcMaster.findFirst({ where: { id: entry.lcId, organizationId: org }, select: { lcNumber: true } });
    if (!lc) throw new NotFoundException("LC not found");
    const { clearing } = await this.lcLedgers(tx, org);
    const allocations = this.readAllocations(entry.paymentAllocations);
    const method = entry.paymentMethod ?? "CREDIT";
    const sourceId = `${entry.id}:v${entry.postingVersion}`;
    let payableId: string | undefined;
    let creditLines: Array<{ bankAccountId?: string; systemKey?: string; debit: number; credit: Prisma.Decimal | number; partyName?: string; partyType?: string; description?: string }>;
    if (method === "CASH_BANK_MFS") {
      await this.validateBankAllocations(tx, org, allocations);
      const allocated = allocations.reduce((sum, row) => sum.add(row.amount), D(0));
      if (!allocated.eq(entry.bdtAmount)) throw new BadRequestException("Cost payment allocations must equal the BDT cost amount");
      for (let index = 0; index < allocations.length; index += 1) {
        const allocation = allocations[index];
        await this.cashBank.post(tx, { organizationId: org, accountId: allocation.accountId, direction: "OUT", amount: allocation.amount, sourceModule: "LC_COST", sourceType: "COST_PAYMENT", sourceId: `${sourceId}:${index}`, referenceNo: allocation.reference ?? entry.invoiceNumber ?? lc.lcNumber, description: `LC cost payment ${lc.lcNumber}`, transactionDate: entry.invoiceDate ?? new Date(), createdById: userId });
      }
      creditLines = allocations.map((allocation) => ({ bankAccountId: allocation.accountId, debit: 0, credit: allocation.amount, description: allocation.reference }));
    } else {
      if (allocations.length) throw new BadRequestException("Credit costs cannot include cash/bank allocations");
      const partyName = entry.creditPayeeName ?? entry.vendorName ?? `LC cost payable ${lc.lcNumber}`;
      const payable = await tx.payable.create({ data: { organizationId: org, partyName, partyType: "SERVICE_PROVIDER", billNo: `LC-COST-${entry.id}-V${entry.postingVersion}`, billDate: entry.invoiceDate ?? new Date(), amount: entry.bdtAmount, description: `LC cost ${lc.lcNumber}`, createdById: userId } });
      payableId = payable.id;
      creditLines = [{ systemKey: "ACCOUNTS_PAYABLE", debit: 0, credit: entry.bdtAmount, partyName, partyType: "SERVICE_PROVIDER" }];
    }
    const journal = await this.accounting.post(tx, { organizationId: org, userId, journalDate: entry.invoiceDate ?? new Date(), referenceNo: entry.invoiceNumber ?? lc.lcNumber, description: `LC import cost for ${lc.lcNumber}`, sourceModule: "LC_COST", sourceType: "COST", sourceId, lines: [{ accountId: clearing.id, debit: entry.bdtAmount, credit: 0 }, ...creditLines] });
    await tx.lcCostEntry.update({ where: { id: entry.id }, data: { paymentJournalId: journal.id, payableId } });
  }

  private async reverseCostAccounting(tx: Tx, org: string, userId: string, entry: { id: string; paymentMethod: string | null; paymentAllocations: Prisma.JsonValue | null; postingVersion: number; payableId: string | null }) {
    const sourceId = `${entry.id}:v${entry.postingVersion}`;
    await this.accounting.reverseSource(tx, org, userId, "LC_COST", sourceId);
    if (entry.paymentMethod === "CASH_BANK_MFS") {
      const allocations = this.readAllocations(entry.paymentAllocations);
      for (let index = 0; index < allocations.length; index += 1) await this.cashBank.reverseSource(tx, { organizationId: org, sourceModule: "LC_COST", sourceId: `${sourceId}:${index}`, userId, reason: "LC cost revision" });
    }
    if (entry.payableId) {
      const payments = await tx.supplierPayment.count({ where: { organizationId: org, payableId: entry.payableId } });
      if (payments) throw new ConflictException("LC cost payable has supplier payments and cannot be revised");
      await tx.lcCostEntry.updateMany({ where: { id: entry.id, organizationId: org, payableId: entry.payableId }, data: { payableId: null, paymentJournalId: null } });
      await tx.payable.deleteMany({ where: { id: entry.payableId, organizationId: org } });
    }
  }

  private allocationPreview(items: Array<{ id: string; totalPurchaseCostBdt: Prisma.Decimal; foreignUnitPrice: Prisma.Decimal; quantity: Prisma.Decimal; weight: Prisma.Decimal | null; cbm: Prisma.Decimal | null }>, amount: Prisma.Decimal, dto: SaveAllocationDto) {
    return allocateLcCost(items, amount, dto);
  }

  private async applyAllocation(tx: Tx, org: string, items: Array<{ id: string; totalPurchaseCostBdt: Prisma.Decimal; foreignUnitPrice: Prisma.Decimal; quantity: Prisma.Decimal; weight: Prisma.Decimal | null; cbm: Prisma.Decimal | null }>, costEntryId: string, amount: Prisma.Decimal, dto: SaveAllocationDto) {
    const rows = this.allocationPreview(items, amount, dto);
    await tx.lcCostAllocation.deleteMany({ where: { organizationId: org, costEntryId } });
    await tx.lcCostAllocation.createMany({ data: rows.map((row) => ({ organizationId: org, costEntryId, ...row })) });
    await tx.lcCostEntry.update({ where: { id: costEntryId }, data: { allocationMode: dto.allocationMode as LcAllocationMode, allocationBasis: (dto.allocationBasis ?? "PURCHASE_VALUE") as LcAllocationBasis } });
    return rows;
  }

  async createCostEntry(org: string, userId: string, lcId: string, dto: LcCostEntryDto) {
    const lc = await this.load(org, lcId);
    if (["FINALIZED", "CLOSED", "CANCELLED"].includes(lc.status)) throw new BadRequestException("Costs cannot be added to this LC");
    const head = await this.prisma.lcCostHead.findFirst({ where: { id: dto.costHeadId, organizationId: org, isActive: true } });
    if (!head) throw new NotFoundException("LC cost head not found");
    if (dto.shipmentId && !lc.shipments.some((shipment) => shipment.id === dto.shipmentId)) throw new NotFoundException("LC shipment not found");
    const bdtAmount = this.costAmount(dto), paymentMethod = dto.paymentMethod ?? "CREDIT", allocations = dto.paymentAllocations ?? [];
    const id = await this.prisma.$transaction(async (tx) => {
      const entry = await tx.lcCostEntry.create({ data: { organizationId: org, lcId, costHeadId: head.id, shipmentId: dto.shipmentId, vendorName: dto.vendorName?.trim(), invoiceNumber: dto.invoiceNumber?.trim(), invoiceDate: dto.invoiceDate ? new Date(dto.invoiceDate) : undefined, currency: dto.currency?.trim().toUpperCase() || "BDT", foreignAmount: dto.foreignAmount, exchangeRate: dto.exchangeRate, bdtAmount, allocationMode: (dto.allocationMode ?? "AUTO") as LcAllocationMode, allocationBasis: (dto.allocationBasis ?? head.defaultAllocationMethod) as LcAllocationBasis, includeInLandedCost: dto.includeInLandedCost ?? head.includeInLandedCost, attachmentUrl: dto.attachmentUrl?.trim(), attachmentName: dto.attachmentName?.trim(), remarks: dto.remarks?.trim(), paymentMethod, creditPayeeName: dto.creditPayeeName?.trim(), paymentAllocations: allocations as never, createdById: userId } });
      await this.postCostAccounting(tx, org, userId, entry);
      await this.applyAllocation(tx, org, lc.items, entry.id, bdtAmount, { allocationMode: dto.allocationMode ?? "AUTO", allocationBasis: dto.allocationBasis ?? head.defaultAllocationMethod, rows: lc.items.map((item) => ({ lcItemId: item.id })) });
      await tx.lcMaster.update({ where: { id: lcId }, data: { status: "COSTING_PENDING" } });
      return entry.id;
    });
    await this.log(org, userId, "LC_COST_CREATED", lcId, { costEntryId: id, amount: bdtAmount.toFixed(4) });
    return this.load(org, lcId);
  }

  async updateCostEntry(org: string, userId: string, lcId: string, id: string, dto: UpdateLcCostEntryDto) {
    const lc = await this.load(org, lcId), old = lc.costEntries.find((entry) => entry.id === id);
    if (!old) throw new NotFoundException("LC cost entry not found");
    if (old.isLocked) throw new ConflictException("Finalized costs are locked; reopen the landed cost first");
    const financial = dto.foreignAmount !== undefined || dto.exchangeRate !== undefined || dto.bdtAmount !== undefined || dto.paymentMethod !== undefined || dto.paymentAllocations !== undefined;
    const bdtAmount = this.costAmount({ currency: old.currency, foreignAmount: dto.foreignAmount ?? old.foreignAmount?.toNumber(), exchangeRate: dto.exchangeRate ?? old.exchangeRate?.toNumber(), bdtAmount: dto.bdtAmount }, old.bdtAmount);
    await this.prisma.$transaction(async (tx) => {
      if (financial) await this.reverseCostAccounting(tx, org, userId, old);
      const entry = await tx.lcCostEntry.update({ where: { id }, data: { vendorName: dto.vendorName !== undefined ? dto.vendorName?.trim() || null : undefined, invoiceNumber: dto.invoiceNumber !== undefined ? dto.invoiceNumber?.trim() || null : undefined, invoiceDate: dto.invoiceDate ? new Date(dto.invoiceDate) : undefined, foreignAmount: dto.foreignAmount, exchangeRate: dto.exchangeRate, bdtAmount, includeInLandedCost: dto.includeInLandedCost, attachmentUrl: dto.attachmentUrl !== undefined ? dto.attachmentUrl?.trim() || null : undefined, attachmentName: dto.attachmentName !== undefined ? dto.attachmentName?.trim() || null : undefined, remarks: dto.remarks !== undefined ? dto.remarks?.trim() || null : undefined, paymentMethod: dto.paymentMethod, creditPayeeName: dto.creditPayeeName !== undefined ? dto.creditPayeeName?.trim() || null : undefined, paymentAllocations: dto.paymentAllocations === undefined ? undefined : dto.paymentAllocations as never, paymentJournalId: financial ? null : undefined, payableId: financial ? null : undefined, postingVersion: financial ? { increment: 1 } : undefined } });
      if (financial) await this.postCostAccounting(tx, org, userId, entry);
      const allocation = old.allocationMode === "AUTO" ? { allocationMode: "AUTO", allocationBasis: old.allocationBasis ?? "PURCHASE_VALUE", rows: lc.items.map((item) => ({ lcItemId: item.id })) } : { allocationMode: old.allocationMode, allocationBasis: old.allocationBasis ?? "PURCHASE_VALUE", rows: old.allocations.map((row) => ({ lcItemId: row.lcItemId, manualAmount: row.manualAmount?.toNumber(), overrideReason: row.overrideReason ?? undefined })) };
      await this.applyAllocation(tx, org, lc.items, id, bdtAmount, allocation);
    });
    await this.log(org, userId, "LC_COST_UPDATED", lcId, { costEntryId: id });
    return this.load(org, lcId);
  }

  async deleteCostEntry(org: string, userId: string, lcId: string, id: string) { const lc = await this.load(org, lcId), entry = lc.costEntries.find((row) => row.id === id); if (!entry) throw new NotFoundException("LC cost entry not found"); if (entry.isLocked) throw new ConflictException("Reopen landed cost before deleting a locked entry"); await this.prisma.$transaction(async (tx) => { await this.reverseCostAccounting(tx, org, userId, entry); await tx.lcCostEntry.delete({ where: { id } }); }); await this.log(org, userId, "LC_COST_DELETED", lcId, { costEntryId: id }); return this.load(org, lcId); }

  async previewAllocation(org: string, lcId: string, costEntryId: string, basis?: string) { const lc = await this.load(org, lcId), entry = lc.costEntries.find((row) => row.id === costEntryId); if (!entry) throw new NotFoundException("LC cost entry not found"); return this.allocationPreview(lc.items, entry.bdtAmount, { allocationMode: "AUTO", allocationBasis: basis ?? entry.allocationBasis ?? "PURCHASE_VALUE", rows: lc.items.map((item) => ({ lcItemId: item.id })) }); }
  async saveAllocation(org: string, userId: string, lcId: string, costEntryId: string, dto: SaveAllocationDto) { const lc = await this.load(org, lcId), entry = lc.costEntries.find((row) => row.id === costEntryId); if (!entry) throw new NotFoundException("LC cost entry not found"); if (entry.isLocked) throw new ConflictException("Finalized allocation is locked"); const rows = await this.prisma.$transaction((tx) => this.applyAllocation(tx, org, lc.items, costEntryId, entry.bdtAmount, dto)); await this.log(org, userId, "LC_COST_ALLOCATED", lcId, { costEntryId }); return rows; }

  private async recomputeReceived(tx: Tx, org: string, lcId: string) {
    const items = await tx.lcItem.findMany({ where: { organizationId: org, lcId }, select: { id: true } });
    for (const item of items) {
      const aggregate = await tx.lcGrnItem.aggregate({ where: { organizationId: org, lcItemId: item.id }, _sum: { receivedQuantity: true } });
      await tx.lcItem.update({ where: { id: item.id }, data: { receivedQuantity: aggregate._sum.receivedQuantity ?? 0 } });
    }
  }

  private grnRows(lc: Awaited<ReturnType<LcService["load"]>>, dto: LcGrnDto, excludeGrnId?: string) {
    const ids = new Set<string>();
    return dto.items.map((input) => {
      if (ids.has(input.lcItemId)) throw new BadRequestException("A product can appear only once in a GRN"); ids.add(input.lcItemId);
      const item = lc.items.find((row) => row.id === input.lcItemId); if (!item) throw new BadRequestException("GRN product does not belong to this LC");
      const outside = item.grnItems.filter((row) => row.grnId !== excludeGrnId).reduce((sum, row) => sum.add(row.receivedQuantity), D(0));
      const expected = Prisma.Decimal.max(D(0), item.quantity.sub(outside)), received = D(input.receivedQuantity), damaged = D(input.damagedQuantity), rejected = D(input.rejectedQuantity);
      if (damaged.add(rejected).gt(received)) throw new BadRequestException("Damaged and rejected quantity cannot exceed received quantity");
      return { organizationId: lc.organizationId, lcItemId: item.id, expectedQuantity: expected, receivedQuantity: received, shortQuantity: Prisma.Decimal.max(D(0), expected.sub(received)), excessQuantity: Prisma.Decimal.max(D(0), received.sub(expected)), damagedQuantity: damaged, rejectedQuantity: rejected };
    });
  }

  async createGrn(org: string, userId: string, lcId: string, dto: LcGrnDto) {
    const lc = await this.load(org, lcId); if (["FINALIZED", "CLOSED", "CANCELLED"].includes(lc.status)) throw new BadRequestException("This LC cannot accept a GRN");
    if (dto.warehouseId && !(await this.prisma.warehouse.findFirst({ where: { id: dto.warehouseId, organizationId: org, isActive: true } }))) throw new NotFoundException("Warehouse not found");
    const rows = this.grnRows(lc, dto), grnNumber = dto.grnNumber?.trim().toUpperCase() || await this.numbering.next(org, "LC_GRN");
    const grn = await this.prisma.$transaction(async (tx) => { const saved = await tx.lcGrn.create({ data: { organizationId: org, lcId, grnNumber, receivedDate: new Date(dto.receivedDate), warehouseId: dto.warehouseId, remarks: dto.remarks?.trim(), createdById: userId, items: { create: rows } } }); await this.recomputeReceived(tx, org, lcId); return saved; });
    await this.log(org, userId, "LC_GRN_CREATED", lcId, { grnId: grn.id, grnNumber }); return this.load(org, lcId);
  }
  async updateGrn(org: string, userId: string, lcId: string, grnId: string, dto: LcGrnDto) { const lc = await this.load(org, lcId); if (["FINALIZED", "CLOSED", "CANCELLED"].includes(lc.status)) throw new BadRequestException("Reopen LC before editing its GRN"); if (!lc.grns.some((row) => row.id === grnId)) throw new NotFoundException("GRN not found"); if (dto.warehouseId && !(await this.prisma.warehouse.findFirst({ where: { id: dto.warehouseId, organizationId: org, isActive: true } }))) throw new NotFoundException("Warehouse not found"); const rows = this.grnRows(lc, dto, grnId); await this.prisma.$transaction(async (tx) => { await tx.lcGrnItem.deleteMany({ where: { organizationId: org, grnId } }); await tx.lcGrn.update({ where: { id: grnId }, data: { grnNumber: dto.grnNumber?.trim().toUpperCase(), receivedDate: new Date(dto.receivedDate), warehouseId: dto.warehouseId, remarks: dto.remarks !== undefined ? dto.remarks?.trim() || null : undefined, items: { create: rows } } }); await this.recomputeReceived(tx, org, lcId); }); await this.log(org, userId, "LC_GRN_UPDATED", lcId, { grnId }); return this.load(org, lcId); }

  private categoryFields: Record<LcCostCategory, keyof Pick<Prisma.LcLandedCostItemUncheckedCreateInput, "lcBankingCost" | "originCost" | "freightCost" | "insuranceCost" | "customsCost" | "taxCost" | "cnfCost" | "portCost" | "destinationTransportCost" | "localCost" | "otherCost">> = {
    LC_BANKING: "lcBankingCost", ORIGIN: "originCost", FREIGHT: "freightCost", INSURANCE: "insuranceCost", CUSTOMS: "customsCost", TAX: "taxCost", CNF: "cnfCost", PORT: "portCost", DESTINATION_TRANSPORT: "destinationTransportCost", LOCAL: "localCost", OTHER: "otherCost",
  };

  private computeLanded(lc: Awaited<ReturnType<LcService["load"]>>) {
    const purchaseCostTotal = lc.items.reduce((sum, item) => sum.add(item.totalPurchaseCostBdt), D(0));
    const eligible = lc.costEntries.filter((entry) => entry.includeInLandedCost), importCostTotal = eligible.reduce((sum, entry) => sum.add(entry.bdtAmount), D(0));
    const buckets = new Map(lc.items.map((item) => [item.id, { purchaseCost: item.totalPurchaseCostBdt, lcBankingCost: D(0), originCost: D(0), freightCost: D(0), insuranceCost: D(0), customsCost: D(0), taxCost: D(0), cnfCost: D(0), portCost: D(0), destinationTransportCost: D(0), localCost: D(0), otherCost: D(0) }]));
    let allocationDifference = D(0);
    for (const entry of eligible) {
      const allocated = entry.allocations.reduce((sum, allocation) => sum.add(allocation.finalAmount), D(0)); allocationDifference = allocationDifference.add(entry.bdtAmount.sub(allocated));
      const field = this.categoryFields[entry.costHead.category];
      for (const allocation of entry.allocations) { const bucket = buckets.get(allocation.lcItemId); if (bucket) bucket[field] = bucket[field].add(allocation.finalAmount); }
    }
    const items = lc.items.map((item) => { const bucket = buckets.get(item.id)!; const totalLandedCost = Object.values(bucket).reduce((sum, value) => sum.add(value), D(0)); const unitLandedCost = item.receivedQuantity.gt(0) ? totalLandedCost.div(item.receivedQuantity).toDecimalPlaces(6) : D(0); const profit = item.profitValue ?? D(0); const sellingPricePerUnit = item.profitMode === "FIXED" ? unitLandedCost.add(profit) : item.profitMode === "PERCENTAGE" ? unitLandedCost.mul(D(1).add(profit.div(100))) : D(0); return { lcItemId: item.id, ...bucket, totalLandedCost, receivedQuantity: item.receivedQuantity, unitLandedCost, profitMode: item.profitMode, profitValue: profit, sellingPricePerUnit, sellingPriceTotal: sellingPricePerUnit.mul(item.receivedQuantity) }; });
    return { purchaseCostTotal, importCostTotal, landedCostTotal: purchaseCostTotal.add(importCostTotal), allocationDifference, items };
  }

  async previewLandedCost(org: string, lcId: string) { return this.computeLanded(await this.load(org, lcId)); }
  async updateProfit(org: string, userId: string, lcId: string, dto: ProfitDto) { const lc = await this.load(org, lcId); if (lc.landedCost?.status === "FINALIZED") throw new ConflictException("Reopen landed cost before changing profit"); const valid = new Set(lc.items.map((item) => item.id)); if (dto.items.some((item) => !valid.has(item.lcItemId))) throw new BadRequestException("Profit product does not belong to this LC"); await this.prisma.$transaction(async (tx) => { for (const item of dto.items) await tx.lcItem.update({ where: { id: item.lcItemId }, data: { profitMode: item.profitMode as LcProfitMode, profitValue: item.profitValue } }); }); await this.log(org, userId, "LC_PROFIT_UPDATED", lcId); return this.load(org, lcId); }

  async finalize(org: string, userId: string, lcId: string) {
    const lc = await this.load(org, lcId); if (lc.landedCost?.status === "FINALIZED") return lc;
    const computed = this.computeLanded(lc), problems: string[] = [];
    if (lc.purchasePaymentStatus !== "PAID" || lc.purchasePaidAmount.lt(computed.purchaseCostTotal)) problems.push("Purchase value must be fully paid");
    if (!lc.items.length) problems.push("LC has no products");
    for (const item of lc.items) { if (item.totalPurchaseCostBdt.lte(0)) problems.push(`${item.productName} has no purchase cost`); if (item.receivedQuantity.lte(0)) problems.push(`${item.productName} has no received quantity`); }
    for (const entry of lc.costEntries.filter((row) => row.includeInLandedCost)) if (!entry.allocations.reduce((sum, row) => sum.add(row.finalAmount), D(0)).eq(entry.bdtAmount)) problems.push(`${entry.costHead.name} is not fully allocated`);
    if (!computed.allocationDifference.eq(0)) problems.push(`Allocation difference is ${computed.allocationDifference.toFixed(4)}`);
    if (problems.length) throw new BadRequestException(`Cannot finalize landed cost: ${problems.join("; ")}`);
    await this.prisma.$transaction(async (tx) => {
      const ledgers = await this.lcLedgers(tx, org), existing = await tx.lcLandedCost.findUnique({ where: { lcId } }), version = (existing?.postingVersion ?? 0) + 1;
      const journal = await this.accounting.post(tx, { organizationId: org, userId, journalDate: new Date(), referenceNo: lc.lcNumber, description: `Landed cost finalized for ${lc.lcNumber}`, sourceModule: "LC_LANDED_COST", sourceType: "FINALIZATION", sourceId: `${lcId}:v${version}`, lines: [{ accountId: ledgers.inventory.id, debit: computed.landedCostTotal, credit: 0 }, { accountId: ledgers.clearing.id, debit: 0, credit: computed.landedCostTotal }] });
      const landed = await tx.lcLandedCost.upsert({ where: { lcId }, update: { purchaseCostTotal: computed.purchaseCostTotal, importCostTotal: computed.importCostTotal, landedCostTotal: computed.landedCostTotal, allocationDifference: computed.allocationDifference, status: "FINALIZED", finalizedById: userId, finalizedAt: new Date(), reopenedById: null, reopenedAt: null, reopenReason: null, journalEntryId: journal.id, postingVersion: version }, create: { organizationId: org, lcId, purchaseCostTotal: computed.purchaseCostTotal, importCostTotal: computed.importCostTotal, landedCostTotal: computed.landedCostTotal, allocationDifference: computed.allocationDifference, status: "FINALIZED", finalizedById: userId, finalizedAt: new Date(), journalEntryId: journal.id, postingVersion: version } });
      await tx.lcLandedCostItem.deleteMany({ where: { organizationId: org, landedCostId: landed.id } });
      await tx.lcLandedCostItem.createMany({ data: computed.items.map((item) => ({ organizationId: org, landedCostId: landed.id, lcItemId: item.lcItemId, purchaseCost: item.purchaseCost, lcBankingCost: item.lcBankingCost, originCost: item.originCost, freightCost: item.freightCost, insuranceCost: item.insuranceCost, customsCost: item.customsCost, taxCost: item.taxCost, cnfCost: item.cnfCost, portCost: item.portCost, destinationTransportCost: item.destinationTransportCost, localCost: item.localCost, otherCost: item.otherCost, totalLandedCost: item.totalLandedCost, receivedQuantity: item.receivedQuantity, unitLandedCost: item.unitLandedCost })) });
      for (const item of computed.items) await tx.lcItem.update({ where: { id: item.lcItemId }, data: { landedCostAmount: item.totalLandedCost, landedCostPerUnit: item.unitLandedCost } });
      await tx.lcCostEntry.updateMany({ where: { organizationId: org, lcId }, data: { isLocked: true } });
      await tx.lcMaster.update({ where: { id: lcId }, data: { status: "FINALIZED" } });
      await tx.lcStatusHistory.create({ data: { organizationId: org, lcId, fromStatus: lc.status, toStatus: "FINALIZED", reason: "Landed cost finalized", changedById: userId } });
    });
    await this.log(org, userId, "LC_LANDED_COST_FINALIZED", lcId, { total: computed.landedCostTotal.toFixed(4) }); return this.load(org, lcId);
  }

  private async resolveInventoryItem(tx: Tx, org: string, userId: string, input: { postingType: string; itemId?: string }, lcItem: { productName: string; description: string | null; landedCostPerUnit: Prisma.Decimal | null }) {
    if (input.postingType === "EXISTING") { if (!input.itemId) throw new BadRequestException("Existing item is required"); const item = await tx.item.findFirst({ where: { id: input.itemId, organizationId: org, status: "ACTIVE" } }); if (!item) throw new NotFoundException("Inventory item not found"); return item; }
    const itemCode = await this.numbering.next(org, "ITEM", tx);
    return tx.item.create({ data: { organizationId: org, itemCode, itemName: lcItem.productName, description: lcItem.description ?? (input.postingType === "ONE_TIME" ? "One-time LC inventory item" : undefined), itemType: "MATERIAL", defaultPurchaseRate: lcItem.landedCostPerUnit?.toDecimalPlaces(2), status: "ACTIVE", createdById: userId } });
  }

  async postInventory(org: string, userId: string, lcId: string, dto: InventoryPostingDto) {
    const lc = await this.load(org, lcId); if (lc.landedCost?.status !== "FINALIZED") throw new BadRequestException("Finalize landed cost before posting inventory");
    const seen = new Set<string>();
    await this.prisma.$transaction(async (tx) => {
      for (const input of dto.items) {
        if (seen.has(input.lcItemId)) throw new BadRequestException("A product can be posted once per request"); seen.add(input.lcItemId);
        const lcItem = lc.items.find((item) => item.id === input.lcItemId); if (!lcItem) throw new NotFoundException("LC item not found"); if (lcItem.inventoryPosting) continue;
        if (lcItem.receivedQuantity.lte(0) || !lcItem.landedCostPerUnit) throw new BadRequestException(`${lcItem.productName} has no finalized received cost`);
        const warehouse = await tx.warehouse.findFirst({ where: { id: input.warehouseId, organizationId: org, isActive: true } }); if (!warehouse) throw new NotFoundException("Warehouse not found");
        const item = await this.resolveInventoryItem(tx, org, userId, input, lcItem), total = money(lcItem.receivedQuantity.mul(lcItem.landedCostPerUnit));
        await tx.lcItem.update({ where: { id: lcItem.id }, data: { itemId: item.id } });
        const movement = await tx.stockMovement.create({ data: { organizationId: org, itemId: item.id, warehouseId: warehouse.id, movementType: "LC_RECEIPT", quantity: lcItem.receivedQuantity, unitCost: lcItem.landedCostPerUnit, totalCost: total, sourceModule: "LC", sourceType: "LANDED_COST", sourceId: randomUUID(), referenceNo: lc.lcNumber, occurredAt: new Date(), createdById: userId } });
        await tx.lcInventoryPosting.create({ data: { organizationId: org, lcId, lcItemId: lcItem.id, warehouseId: warehouse.id, stockMovementId: movement.id, quantity: lcItem.receivedQuantity, unitCost: lcItem.landedCostPerUnit, totalCost: total, postedById: userId } });
      }
    });
    await this.log(org, userId, "LC_INVENTORY_POSTED", lcId, { itemCount: dto.items.length }); return this.load(org, lcId);
  }

  async updateInventoryPosting(org: string, userId: string, lcId: string, dto: UpdateInventoryPostingDto) {
    const lc = await this.load(org, lcId); if (lc.landedCost?.status !== "FINALIZED") throw new BadRequestException("Inventory mappings can only change while finalized");
    await this.prisma.$transaction(async (tx) => { for (const input of dto.items) { const lcItem = lc.items.find((item) => item.id === input.lcItemId), posting = lcItem?.inventoryPosting; if (!lcItem || !posting) throw new NotFoundException("Inventory posting not found"); const [warehouse, item] = await Promise.all([tx.warehouse.findFirst({ where: { id: input.warehouseId, organizationId: org, isActive: true } }), tx.item.findFirst({ where: { id: input.itemId, organizationId: org, status: "ACTIVE" } })]); if (!warehouse || !item) throw new NotFoundException("Warehouse or inventory item not found"); await tx.stockMovement.create({ data: { organizationId: org, itemId: posting.stockMovement.itemId, warehouseId: posting.warehouseId, movementType: "LC_REVERSAL", quantity: posting.quantity.neg(), unitCost: posting.unitCost, totalCost: posting.totalCost.neg(), sourceModule: "LC", sourceType: "INVENTORY_REMAP_REVERSAL", sourceId: randomUUID(), referenceNo: lc.lcNumber, occurredAt: new Date(), createdById: userId } }); const movement = await tx.stockMovement.create({ data: { organizationId: org, itemId: item.id, warehouseId: warehouse.id, movementType: "LC_RECEIPT", quantity: posting.quantity, unitCost: posting.unitCost, totalCost: posting.totalCost, sourceModule: "LC", sourceType: "INVENTORY_REMAP", sourceId: randomUUID(), referenceNo: lc.lcNumber, occurredAt: new Date(), createdById: userId } }); await tx.lcItem.update({ where: { id: lcItem.id }, data: { itemId: item.id } }); await tx.lcInventoryPosting.update({ where: { id: posting.id }, data: { warehouseId: warehouse.id, stockMovementId: movement.id, postedById: userId, postedAt: new Date() } }); } });
    await this.log(org, userId, "LC_INVENTORY_MAPPING_UPDATED", lcId); return this.load(org, lcId);
  }

  async reopen(org: string, userId: string, lcId: string, dto: ReopenLcDto) {
    const lc = await this.load(org, lcId); if (lc.landedCost?.status !== "FINALIZED") throw new BadRequestException("Only finalized landed cost can be reopened"); if (lc.status === "CLOSED") throw new ConflictException("Closed LCs cannot be reopened");
    const landedCost = lc.landedCost;
    await this.prisma.$transaction(async (tx) => {
      for (const item of lc.items) if (item.inventoryPosting) { const posting = item.inventoryPosting; await tx.stockMovement.create({ data: { organizationId: org, itemId: posting.stockMovement.itemId, warehouseId: posting.warehouseId, movementType: "LC_REVERSAL", quantity: posting.quantity.neg(), unitCost: posting.unitCost, totalCost: posting.totalCost.neg(), sourceModule: "LC", sourceType: "REOPEN_REVERSAL", sourceId: randomUUID(), referenceNo: lc.lcNumber, occurredAt: new Date(), createdById: userId } }); await tx.lcInventoryPosting.delete({ where: { id: posting.id } }); }
      await this.accounting.reverseSource(tx, org, userId, "LC_LANDED_COST", `${lcId}:v${landedCost.postingVersion}`);
      await tx.lcLandedCost.update({ where: { id: landedCost.id }, data: { status: "DRAFT", reopenedById: userId, reopenedAt: new Date(), reopenReason: dto.reason.trim(), journalEntryId: null } });
      await tx.lcCostEntry.updateMany({ where: { organizationId: org, lcId }, data: { isLocked: false } }); await tx.lcMaster.update({ where: { id: lcId }, data: { status: "READY_TO_FINALIZE" } }); await tx.lcStatusHistory.create({ data: { organizationId: org, lcId, fromStatus: lc.status, toStatus: "READY_TO_FINALIZE", reason: dto.reason.trim(), changedById: userId } });
    });
    await this.log(org, userId, "LC_LANDED_COST_REOPENED", lcId, { reason: dto.reason }); return this.load(org, lcId);
  }

  async registerReport(org: string) { const rows = await this.prisma.lcMaster.findMany({ where: { organizationId: org }, include: { items: true, costEntries: true, landedCost: true, supplier: true }, orderBy: { lcDate: "desc" } }); return rows.map((row) => ({ id: row.id, lcNumber: row.lcNumber, lcDate: row.lcDate, supplier: row.supplier?.name ?? row.supplierName, status: row.status, purchaseCost: row.items.reduce((sum, item) => sum.add(item.totalPurchaseCostBdt), D(0)).toFixed(4), importCost: row.costEntries.filter((entry) => entry.includeInLandedCost).reduce((sum, entry) => sum.add(entry.bdtAmount), D(0)).toFixed(4), landedCost: row.landedCost?.landedCostTotal.toFixed(4) ?? null })); }
  async categoryReport(org: string, category: string) { if (!(Object.values(LcCostCategory) as string[]).includes(category)) throw new BadRequestException("Invalid LC cost category"); const rows = await this.prisma.lcCostEntry.findMany({ where: { organizationId: org, costHead: { category: category as LcCostCategory } }, include: { lc: { select: { id: true, lcNumber: true, lcDate: true } }, costHead: true }, orderBy: { createdAt: "desc" } }); return { category, total: rows.reduce((sum, row) => sum.add(row.bdtAmount), D(0)).toFixed(4), items: rows } }
  async costSheet(org: string, lcId: string) { const lc = await this.load(org, lcId); return { lc, landedCost: this.computeLanded(lc) }; }
  async allocationReport(org: string, lcId: string) { const lc = await this.load(org, lcId); return lc.costEntries.map((entry) => ({ id: entry.id, costHead: entry.costHead.name, category: entry.costHead.category, amount: entry.bdtAmount, allocated: entry.allocations.reduce((sum, row) => sum.add(row.finalAmount), D(0)), allocations: entry.allocations })); }
}
