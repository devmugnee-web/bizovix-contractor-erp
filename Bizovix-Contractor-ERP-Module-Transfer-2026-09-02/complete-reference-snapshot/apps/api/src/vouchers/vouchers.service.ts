import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Optional } from "@nestjs/common";
import {
  Prisma,
  SettlementMode,
  TransactionWorkflowPolicy,
  VoucherEntryStatus,
  VoucherEntryType,
  VoucherWorkflowOrigin,
} from "../generated/prisma/index.js";

import {
  mapDiscountTypeInput,
  mapPartyTypeFromVoucherType,
  mapSettlementModeInput,
  mapVoucherStatusInput,
  mapVoucherTypeInput,
  mapVoucherTypeToPermissionResource,
  nextVoucherNumber,
  voucherNumberStem,
  toDayBookRecord,
} from "../accounting/accounting.utils.js";
import { moneyEquals, roundMoney, sumMoney } from "../accounting/money.util.js";
import { PostingEngineService } from "../accounting/posting-engine.service.js";
import { AuditService } from "../audit/audit.service.js";
import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import { PermissionsService } from "../common/services/permissions.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { rebuildMovingAverageCosts } from "../inventory/moving-average.js";
import { InventoryService } from "../inventory/inventory.service.js";
import { CreateVoucherDto } from "./dto/create-voucher.dto.js";
import { ListDayBookDto } from "./dto/list-day-book.dto.js";
import { assertSalesInvoiceAllocation } from "./sales-invoice-allocation.js";

// documentKind values for the sales-order-to-invoice chain that must never
// carry a financial (debit/credit) effect — see persistVoucher().
const NON_FINANCIAL_SALES_DOCUMENT_KINDS = new Set(["quotation", "proforma", "sale-order", "delivery-note"]);
const NON_FINANCIAL_PURCHASE_DOCUMENT_KINDS = new Set(["purchase-order"]);

type PurchaseWorkflowStage = "purchase-order" | "receipt-note" | "bill";
type SalesWorkflowStage = "sale-order" | "delivery-note" | "invoice";

const inventoryLineLineageSelect = {
  id: true,
  voucherId: true,
  sourceInventoryLineId: true,
} satisfies Prisma.VoucherInventoryItemSelect;

type InventoryLineLineage = Prisma.VoucherInventoryItemGetPayload<{
  select: typeof inventoryLineLineageSelect;
}>;

const includedVoucherRelations = {
  lines: true,
  warehouse: true,
  inventoryItems: {
    include: {
      inventoryItem: true,
      warehouse: true,
    },
  },
} satisfies Prisma.VoucherEntryInclude;

@Injectable()
export class VouchersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PostingEngineService) private readonly postingEngine: PostingEngineService,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(PermissionsService) private readonly permissionsService: PermissionsService,
    @Optional() @Inject(InventoryService) private readonly inventoryService?: InventoryService,
  ) {}

  /** Resolves what this user may do with a voucher of this type. The Users &
   * Roles permission matrix only has rows for the sales-side/general types
   * mapVoucherTypeToPermissionResource() recognizes; every other type
   * (Purchase, Purchase Order, Receipt Note, Debit Note, Contra, Journal)
   * falls back to the legacy coarse accounting.voucher.* keys exactly as
   * enforced before this matrix existed — "view" in particular was never
   * gated for those, so it stays open here too. */
  private resolveVoucherScope(
    granted: Set<string>,
    voucherType: VoucherEntryType,
    action: "view" | "create" | "edit" | "delete",
    documentKind?: string | null,
  ): { resource: string | null; scope: "full" | "own" | "none" } {
    const normalizedKind = documentKind?.trim();
    const documentResource = voucherType === VoucherEntryType.SALES
      ? normalizedKind === "quotation"
        ? "estimate"
        : normalizedKind === "proforma"
          ? "proforma"
          : normalizedKind === "sale-order"
            ? "sale_order"
            : normalizedKind === "delivery-note"
              ? "delivery_challan"
              : "sale"
      : null;
    const resource = documentResource ?? mapVoucherTypeToPermissionResource(voucherType);

    if (resource) {
      if (action === "create") {
        return { resource, scope: granted.has(`${resource}.create`) ? "full" : "none" };
      }
      return { resource, scope: this.permissionsService.resolveScope(granted, resource, action) };
    }

    if (action === "view") {
      return { resource: null, scope: "full" };
    }

    const coarseKey = action === "create" ? "accounting.voucher.create" : action === "edit" ? "accounting.voucher.post" : "accounting.voucher.delete";
    return { resource: null, scope: granted.has(coarseKey) ? "full" : "none" };
  }

  private async assertVoucherAction(
    currentUser: AuthenticatedRequestUser,
    voucherType: VoucherEntryType,
    action: "view" | "create" | "edit" | "delete",
    recordCreatedByUserId?: string | null,
    documentKind?: string | null,
  ) {
    const granted = await this.permissionsService.getGrantedKeys(currentUser);
    const { resource, scope } = this.resolveVoucherScope(granted, voucherType, action, documentKind);
    // The web app exposes unrestricted voucher actions to the tenant Owner.
    // Keep the API authoritative and aligned even when an older/default Owner
    // role assignment does not contain every newer fine-grained permission key.
    if (scope !== "full" && await this.isTenantOwner(currentUser)) {
      return;
    }
    if (scope === "none") {
      throw new ForbiddenException(`You do not have permission to ${action} this voucher`);
    }
    if (scope === "own" && recordCreatedByUserId !== undefined && recordCreatedByUserId !== currentUser.id) {
      throw new ForbiddenException(`You can only ${action} ${resource?.replace(/_/g, " ") ?? "voucher"} records you created`);
    }
  }

  async listDayBook(currentUser: AuthenticatedRequestUser, filters: ListDayBookDto) {
    const workspaceId = filters.workspaceId ?? currentUser.workspaceId;
    if (!workspaceId) {
      throw new ForbiddenException("No active workspace");
    }

    await this.ensureWorkspaceAccess(currentUser, workspaceId);

    const voucherType = filters.voucherType && filters.voucherType !== "all" ? mapVoucherTypeInput(filters.voucherType) : undefined;
    const status = filters.status && filters.status !== "all" ? mapVoucherStatusInput(filters.status) : undefined;

    // Own-record scoping only applies when the caller asks for one specific
    // voucher type — a mixed "all types" list can span types with different
    // scopes (some full, some own-only, some off), and this endpoint doesn't
    // need to solve that: every real caller of this list filters by type.
    let ownFilterUserId: string | undefined;
    let documentScopedSalesGrants: Set<string> | undefined;
    if (voucherType) {
      const granted = await this.permissionsService.getGrantedKeys(currentUser);
      if (voucherType === VoucherEntryType.SALES && !(await this.isTenantOwner(currentUser))) {
        const salesDocumentKinds = [undefined, "quotation", "proforma", "sale-order", "delivery-note"] as const;
        const hasAnySalesDocumentAccess = salesDocumentKinds.some(
          (documentKind) => this.resolveVoucherScope(granted, voucherType, "view", documentKind).scope !== "none",
        );
        if (!hasAnySalesDocumentAccess) {
          throw new ForbiddenException("You do not have permission to view this voucher type");
        }
        // Generic SALES rows contain invoices and the pre-sale/order/delivery
        // stages. Their permissions may differ, so filter each returned row by
        // its canonical document resource instead of applying the invoice
        // permission to the entire mixed result set.
        documentScopedSalesGrants = granted;
      } else {
        const { scope } = this.resolveVoucherScope(granted, voucherType, "view");
        if (scope === "none") {
          throw new ForbiddenException("You do not have permission to view this voucher type");
        }
        if (scope === "own") {
          ownFilterUserId = currentUser.id;
        }
      }
    }

    const entries = await this.prisma.voucherEntry.findMany({
      where: {
        workspaceId,
        voucherType,
        status,
        createdByUserId: ownFilterUserId,
        voucherDate: {
          gte: filters.from ? new Date(filters.from) : undefined,
          lte: filters.to ? new Date(filters.to) : undefined,
        },
        OR: filters.query
          ? [
              { voucherNumber: { contains: filters.query, mode: "insensitive" } },
              { partyName: { contains: filters.query, mode: "insensitive" } },
              { narration: { contains: filters.query, mode: "insensitive" } },
              { reference: { contains: filters.query, mode: "insensitive" } },
              { inventoryItems: { some: { itemName: { contains: filters.query, mode: "insensitive" } } } },
            ]
          : undefined,
      },
      include: includedVoucherRelations,
      // Attachments are stored inline as base64. A list of a few hundred vouchers would
      // otherwise ship megabytes of file data no list ever displays; the single-voucher
      // endpoint still returns them in full.
      omit: { attachmentImageUrl: true, attachmentDocumentUrl: true },
      orderBy: [{ voucherDate: "desc" }, { createdAt: "desc" }],
    });

    const visibleEntries = documentScopedSalesGrants
      ? entries.filter((entry) => {
          const { scope } = this.resolveVoucherScope(documentScopedSalesGrants, entry.voucherType, "view", entry.documentKind);
          return scope === "full" || (scope === "own" && entry.createdByUserId === currentUser.id);
        })
      : entries;

    return visibleEntries.map((entry) => toDayBookRecord({ ...entry, attachmentImageUrl: null, attachmentDocumentUrl: null }));
  }

  async create(currentUser: AuthenticatedRequestUser, dto: CreateVoucherDto) {
    await this.assertVoucherAction(currentUser, mapVoucherTypeInput(dto.voucherType), "create", undefined, dto.documentKind);
    await this.ensureWorkspaceAccess(currentUser, dto.workspaceId);

    if (dto.idempotencyKey) {
      const existing = await this.postingEngine.findByIdempotencyKey(dto.workspaceId, dto.idempotencyKey);
      if (existing) {
        return toDayBookRecord(existing);
      }
    }

    return this.persistVoucher(currentUser, dto);
  }

  async getById(currentUser: AuthenticatedRequestUser, voucherId: string, workspaceId?: string) {
    const entry = await this.prisma.voucherEntry.findUnique({
      where: { id: voucherId },
      include: includedVoucherRelations,
    });

    if (!entry) {
      throw new BadRequestException("Voucher not found");
    }

    const targetWorkspaceId = workspaceId ?? entry.workspaceId ?? currentUser.workspaceId;
    await this.ensureWorkspaceAccess(currentUser, targetWorkspaceId);

    if (entry.workspaceId !== targetWorkspaceId) {
      throw new ForbiddenException("Workspace access denied");
    }

    await this.assertVoucherAction(currentUser, entry.voucherType, "view", entry.createdByUserId, entry.documentKind);

    return toDayBookRecord(entry);
  }

  async update(currentUser: AuthenticatedRequestUser, voucherId: string, dto: CreateVoucherDto) {
    const existing = await this.prisma.voucherEntry.findUnique({
      where: { id: voucherId },
    });

    if (!existing) {
      throw new BadRequestException("Voucher not found");
    }

    await this.assertVoucherAction(currentUser, existing.voucherType, "edit", existing.createdByUserId, existing.documentKind);

    await this.ensureWorkspaceAccess(currentUser, existing.workspaceId);

    if (existing.workspaceId !== dto.workspaceId) {
      throw new BadRequestException("Voucher workspace cannot be changed");
    }

    const ownerMayAlterPostedVoucher =
      (existing.status === VoucherEntryStatus.POSTED || existing.status === VoucherEntryStatus.APPROVED) &&
      await this.isTenantOwner(currentUser);

    if (ownerMayAlterPostedVoucher && existing.status === VoucherEntryStatus.POSTED) {
      const [postedStockMovementCount, postedCostRevaluationCount, submittedVoucherMayMoveStock] = await Promise.all([
        this.prisma.stockMovement.count({ where: { transactionId: existing.id, voidedAt: null } }),
        this.prisma.inventoryCostRevaluation.count({ where: { billingVoucherId: existing.id } }),
        this.voucherPayloadMayMoveStock(dto, existing),
      ]);
      if (postedStockMovementCount > 0 || postedCostRevaluationCount > 0 || submittedVoucherMayMoveStock) {
        throw new BadRequestException(
          "A posted stock-affecting voucher cannot be edited in place. Reverse it and create the corrected voucher instead.",
        );
      }
    }

    await this.assertPurchaseDocumentHasNoChild(existing, "edited");
    await this.assertWorkflowSourceHasNoActiveChild(existing, "edited");

    if (!ownerMayAlterPostedVoucher) {
      this.postingEngine.assertEditable(existing.status);
    }

    const updated = await this.persistVoucher(currentUser, dto, existing, ownerMayAlterPostedVoucher);
    if (existing.status === VoucherEntryStatus.POSTED) {
      await this.postingEngine.repostVoucherMovements(currentUser, existing.id);
    }
    return updated;
  }

  private purchaseWorkflowStage(voucherType: VoucherEntryType, documentKind?: string | null): PurchaseWorkflowStage | null {
    const kind = documentKind?.trim() ?? "";
    if (voucherType === VoucherEntryType.PURCHASE_ORDER || kind === "purchase-order") return "purchase-order";
    if (voucherType === VoucherEntryType.RECEIPT_NOTE || kind === "receipt-note") return "receipt-note";
    if (voucherType === VoucherEntryType.PURCHASE && (kind === "" || kind === "bill")) return "bill";
    return null;
  }

  private salesWorkflowStage(voucherType: VoucherEntryType, documentKind?: string | null): SalesWorkflowStage | null {
    const kind = documentKind?.trim() ?? "";
    if (voucherType === VoucherEntryType.SALES_ORDER || kind === "sale-order") return "sale-order";
    if (voucherType === VoucherEntryType.DELIVERY_NOTE || kind === "delivery-note") return "delivery-note";
    if (voucherType === VoucherEntryType.SALES && !NON_FINANCIAL_SALES_DOCUMENT_KINDS.has(kind)) return "invoice";
    return null;
  }

  private canonicalDocumentKind(voucherType: VoucherEntryType, documentKind?: string | null) {
    const supplied = documentKind?.trim();
    if (supplied) return supplied;
    const byType: Partial<Record<VoucherEntryType, string>> = {
      [VoucherEntryType.PURCHASE_ORDER]: "purchase-order",
      [VoucherEntryType.RECEIPT_NOTE]: "receipt-note",
      [VoucherEntryType.QUOTATION]: "quotation",
      [VoucherEntryType.PROFORMA_INVOICE]: "proforma",
      [VoucherEntryType.SALES_ORDER]: "sale-order",
      [VoucherEntryType.DELIVERY_NOTE]: "delivery-note",
    };
    return byType[voucherType];
  }

  private assertDocumentKindMatchesVoucherType(voucherType: VoucherEntryType, documentKind?: string | null) {
    const kind = documentKind?.trim() ?? "";
    const allowedByType: Partial<Record<VoucherEntryType, Set<string>>> = {
      [VoucherEntryType.PURCHASE]: new Set(["", "purchase-order", "receipt-note", "bill"]),
      [VoucherEntryType.PURCHASE_ORDER]: new Set(["purchase-order"]),
      [VoucherEntryType.RECEIPT_NOTE]: new Set(["receipt-note"]),
      [VoucherEntryType.SALES]: new Set(["", "quotation", "proforma", "sale-order", "delivery-note"]),
      [VoucherEntryType.QUOTATION]: new Set(["quotation"]),
      [VoucherEntryType.PROFORMA_INVOICE]: new Set(["proforma"]),
      [VoucherEntryType.SALES_ORDER]: new Set(["sale-order"]),
      [VoucherEntryType.DELIVERY_NOTE]: new Set(["delivery-note"]),
    };
    const allowed = allowedByType[voucherType];
    if (allowed && !allowed.has(kind)) {
      throw new BadRequestException(`Document kind ${kind || "(none)"} is not valid for ${voucherType.toLowerCase().replaceAll("_", " ")}`);
    }
    const workflowKinds = new Set(["purchase-order", "receipt-note", "bill", "quotation", "proforma", "sale-order", "delivery-note"]);
    if (!allowed && workflowKinds.has(kind)) {
      throw new BadRequestException(`Document kind ${kind} is not valid for ${voucherType.toLowerCase().replaceAll("_", " ")}`);
    }
  }

  /**
   * Derive origin from the document itself, never from a caller-supplied flag.
   * Company policy decides which new roots may start; a child of an existing
   * order flow may always finish after the company switches to Direct mode.
   */
  private async resolveWorkflowOrigin(
    currentUser: AuthenticatedRequestUser,
    dto: CreateVoucherDto,
    voucherType: VoucherEntryType,
    existing?: {
      workflowOrigin?: VoucherWorkflowOrigin | null;
      sourceVoucherId?: string | null;
    },
  ) {
    const purchaseStage = this.purchaseWorkflowStage(voucherType, dto.documentKind);
    const salesStage = this.salesWorkflowStage(voucherType, dto.documentKind);
    const sourceVoucherId = dto.sourceVoucherId?.trim();
    const derivedOrigin =
      purchaseStage === "purchase-order" || purchaseStage === "receipt-note" ||
      salesStage === "sale-order" || salesStage === "delivery-note" ||
      ((purchaseStage === "bill" || salesStage === "invoice") && Boolean(sourceVoucherId))
        ? VoucherWorkflowOrigin.ORDER_FLOW
        : VoucherWorkflowOrigin.DIRECT;

    // A stored value is authoritative. A small number of legacy Sales Invoices
    // were created directly from a Sales Order before Delivery Notes became a
    // mandatory intermediate document. Their unchanged source makes the generic
    // shape-based derivation look like ORDER_FLOW, but they must retain DIRECT:
    // that invoice itself moved stock and history must not be reinterpreted.
    // Any attempt to attach or replace a source still fails here (and again in
    // the stage-specific link validator below).
    if (existing) {
      const storedOrigin = existing.workflowOrigin ?? derivedOrigin;
      if (storedOrigin !== derivedOrigin) {
        const keepsUnchangedLegacyDirectSource =
          storedOrigin === VoucherWorkflowOrigin.DIRECT &&
          Boolean(sourceVoucherId) &&
          sourceVoucherId === existing.sourceVoucherId?.trim();
        if (keepsUnchangedLegacyDirectSource) {
          return storedOrigin;
        }
        throw new BadRequestException("Voucher workflow origin cannot be changed after creation");
      }
      return storedOrigin;
    }

    if (!purchaseStage && !salesStage) return derivedOrigin;

    const company = await this.prisma.company.findUnique({
      where: { id: currentUser.companyId },
      select: { purchaseWorkflow: true, salesWorkflow: true },
    });
    if (!company) throw new ForbiddenException("Company access denied");

    const policy = purchaseStage ? company.purchaseWorkflow : company.salesWorkflow;
    const side = purchaseStage ? "Purchase" : "Sales";
    const isDirectFinancialDocument =
      derivedOrigin === VoucherWorkflowOrigin.DIRECT &&
      (purchaseStage === "bill" || salesStage === "invoice");
    if (isDirectFinancialDocument && policy === TransactionWorkflowPolicy.ORDER_BASED) {
      throw new BadRequestException(`${side} workflow is Order Based. Create this document from its goods receipt/delivery document.`);
    }

    // Only the order itself starts a new advanced chain. Receipt/Delivery and
    // their financial child may complete an older chain under any current mode.
    const startsOrderFlow = purchaseStage === "purchase-order" || salesStage === "sale-order";
    if (startsOrderFlow && policy === TransactionWorkflowPolicy.DIRECT) {
      throw new BadRequestException(`${side} workflow is Direct. Change the company workflow before starting a new order.`);
    }

    return derivedOrigin;
  }

  private async isTenantOwner(currentUser: AuthenticatedRequestUser) {
    const membership = await this.prisma.tenantMember.findFirst({
      where: { tenantId: currentUser.tenantId, userId: currentUser.id, membershipRole: "OWNER" },
      select: { id: true },
    });
    return Boolean(membership);
  }

  /**
   * Updating a posted stock document and rebuilding its stock movements are two
   * separate writes today. Until the voucher row/items and the movement replay
   * share one serializable transaction, do not allow an Owner override to turn a
   * posted voucher into (or alter) a stock event.
   */
  private async voucherPayloadMayMoveStock(
    dto: CreateVoucherDto,
    existing: { voucherType: VoucherEntryType; documentKind: string | null; sourceVoucherId: string | null; workspaceId: string },
  ) {
    if (!dto.inventoryItems?.some((item) => Number(item.quantity) > 0)) {
      return false;
    }

    const voucherType = mapVoucherTypeInput(dto.voucherType) ?? existing.voucherType;
    const documentKind = dto.documentKind?.trim() || existing.documentKind || "";
    const sourceVoucherId = dto.sourceVoucherId?.trim() || existing.sourceVoucherId;

    if (voucherType === VoucherEntryType.CREDIT_NOTE || voucherType === VoucherEntryType.DEBIT_NOTE) {
      return true;
    }
    if (voucherType === VoucherEntryType.RECEIPT_NOTE) {
      return true;
    }
    if (voucherType === VoucherEntryType.PURCHASE_ORDER || documentKind === "purchase-order") {
      return false;
    }
    if (voucherType === VoucherEntryType.DELIVERY_NOTE || documentKind === "delivery-note") {
      return true;
    }
    if (
      voucherType === VoucherEntryType.QUOTATION ||
      voucherType === VoucherEntryType.PROFORMA_INVOICE ||
      voucherType === VoucherEntryType.SALES_ORDER ||
      documentKind === "quotation" ||
      documentKind === "proforma" ||
      documentKind === "sale-order"
    ) {
      return false;
    }

    if (
      sourceVoucherId &&
      (voucherType === VoucherEntryType.PURCHASE || voucherType === VoucherEntryType.SALES)
    ) {
      const source = await this.prisma.voucherEntry.findFirst({
        where: { id: sourceVoucherId, workspaceId: existing.workspaceId },
        select: { documentKind: true },
      });
      // A Bill raised from a Receipt Note does not move quantity a second time,
      // but it finalises the receipt's acquisition cost and is therefore still
      // valuation-affecting/immutable once posted.
      if (voucherType === VoucherEntryType.PURCHASE && source?.documentKind === "receipt-note") return true;
      // A sourced Sales Invoice does not move quantity a second time, but it
      // consumes exact Delivery Note allocations and recognizes their inventory
      // cost. Once posted it is therefore just as immutable as a stock voucher.
      if (voucherType === VoucherEntryType.SALES && source?.documentKind === "delivery-note") return true;
    }

    return voucherType === VoucherEntryType.PURCHASE || voucherType === VoucherEntryType.SALES;
  }

  async remove(currentUser: AuthenticatedRequestUser, voucherId: string, workspaceId?: string) {
    const entry = await this.prisma.voucherEntry.findUnique({
      where: { id: voucherId },
      include: includedVoucherRelations,
    });

    if (!entry) {
      throw new BadRequestException("Voucher not found");
    }

    const targetWorkspaceId = workspaceId ?? entry.workspaceId ?? currentUser.workspaceId;
    await this.ensureWorkspaceAccess(currentUser, targetWorkspaceId);

    if (entry.workspaceId !== targetWorkspaceId) {
      throw new ForbiddenException("Workspace access denied");
    }

    await this.assertVoucherAction(currentUser, entry.voucherType, "delete", entry.createdByUserId, entry.documentKind);
    await this.assertPurchaseDocumentHasNoChild(entry, "deleted");
    await this.assertWorkflowSourceHasNoActiveChild(entry, "deleted");

    return this.deleteVoucherWithDependencies(currentUser, entry, targetWorkspaceId);
  }

  async submit(currentUser: AuthenticatedRequestUser, voucherId: string) {
    const entry = await this.getOwnedVoucher(currentUser, voucherId);
    await this.assertVoucherAction(currentUser, entry.voucherType, "edit", entry.createdByUserId, entry.documentKind);
    const updated = await this.postingEngine.transitionStatus(currentUser, entry.id, VoucherEntryStatus.PENDING);
    return toDayBookRecord(updated);
  }

  async approve(currentUser: AuthenticatedRequestUser, voucherId: string) {
    const entry = await this.getOwnedVoucher(currentUser, voucherId);
    const updated = await this.postingEngine.transitionStatus(currentUser, entry.id, VoucherEntryStatus.POSTED);
    return toDayBookRecord(updated);
  }

  async reject(currentUser: AuthenticatedRequestUser, voucherId: string) {
    const entry = await this.getOwnedVoucher(currentUser, voucherId);
    const updated = await this.postingEngine.transitionStatus(currentUser, entry.id, VoucherEntryStatus.REJECTED);
    return toDayBookRecord(updated);
  }

  async cancel(currentUser: AuthenticatedRequestUser, voucherId: string) {
    const entry = await this.getOwnedVoucher(currentUser, voucherId);
    await this.assertVoucherAction(currentUser, entry.voucherType, "delete", entry.createdByUserId, entry.documentKind);
    await this.assertPurchaseDocumentHasNoChild(entry, "cancelled");
    await this.assertWorkflowSourceHasNoActiveChild(entry, "cancelled");
    const updated = await this.postingEngine.transitionStatus(currentUser, entry.id, VoucherEntryStatus.CANCELLED);
    return toDayBookRecord(updated);
  }

  async reverse(currentUser: AuthenticatedRequestUser, voucherId: string, reason?: string) {
    const entry = await this.getOwnedVoucher(currentUser, voucherId);
    await this.assertWorkflowSourceHasNoActiveChild(entry, "reversed");
    const reversal = await this.postingEngine.reverseVoucher(currentUser, entry.id, reason);
    const withRelations = await this.prisma.voucherEntry.findUniqueOrThrow({
      where: { id: reversal.id },
      include: includedVoucherRelations,
    });
    return toDayBookRecord(withRelations);
  }

  private async getOwnedVoucher(currentUser: AuthenticatedRequestUser, voucherId: string) {
    const entry = await this.prisma.voucherEntry.findUnique({
      where: { id: voucherId },
      select: { id: true, workspaceId: true, voucherType: true, documentKind: true, voucherNumber: true, reference: true, createdByUserId: true },
    });

    if (!entry) {
      throw new BadRequestException("Voucher not found");
    }

    await this.ensureWorkspaceAccess(currentUser, entry.workspaceId);

    return entry;
  }

  private async assertPurchaseDocumentHasNoChild(
    entry: { id: string; workspaceId: string; voucherType?: VoucherEntryType | null; documentKind?: string | null; voucherNumber?: string | null; reference?: string | null },
    operation: "edited" | "deleted" | "cancelled" | "reversed",
  ) {
    if (entry.voucherType !== VoucherEntryType.PURCHASE && entry.voucherType !== VoucherEntryType.PURCHASE_ORDER) return;
    const kind = entry.documentKind?.trim();
    if (kind !== "purchase-order" && kind !== "receipt-note" && kind !== "bill") return;

    const references = [entry.voucherNumber, entry.reference].map((value) => value?.trim()).filter((value): value is string => Boolean(value));
    const expectedChildKind = kind === "purchase-order" ? "receipt-note" : kind === "receipt-note" ? "bill" : null;
    const child = await this.prisma.voucherEntry.findFirst({
      where: {
        workspaceId: entry.workspaceId,
        ...(expectedChildKind
          ? { voucherType: VoucherEntryType.PURCHASE, documentKind: expectedChildKind }
          : {}),
        OR: [
          { sourceVoucherId: entry.id },
          ...(kind === "receipt-note" && references.length
            ? references.map((reference) => ({ lines: { some: { billReference: { contains: reference } } } }))
            : []),
        ],
      },
      select: { documentKind: true, voucherNumber: true },
    });
    if (!child) return;

    const childLabel = child.documentKind === "bill" ? "Purchase Bill" : child.documentKind === "receipt-note" ? "Receipt Note" : "child document";
    throw new BadRequestException(
      `${kind === "purchase-order" ? "Purchase Order" : kind === "receipt-note" ? "Receipt Note" : "Purchase Bill"} cannot be ${operation} while ${childLabel} ${child.voucherNumber} exists. Delete the child document first.`,
    );
  }

  /**
   * A source document may only be reversed after every downstream document is
   * inactive. Otherwise the reversal would remove stock/intent underneath a
   * still-live bill or invoice and leave the order-flow ledger inconsistent.
   *
   * This is deliberately separate from the older purchase edit/delete guard:
   * reversal needs to cover both purchase and sales chains, and cancelled,
   * rejected, reversed, or superseded children must not block a legitimate
   * cleanup of their source.
   */
  private async assertWorkflowSourceHasNoActiveChild(
    entry: {
      id: string;
      workspaceId: string;
      voucherType?: VoucherEntryType | null;
      documentKind?: string | null;
      voucherNumber?: string | null;
      reference?: string | null;
    },
    operation: "edited" | "deleted" | "cancelled" | "reversed",
  ) {
    if (!entry.voucherType) return;
    const kind = this.canonicalDocumentKind(entry.voucherType, entry.documentKind);
    if (kind !== "purchase-order" && kind !== "receipt-note" && kind !== "sale-order" && kind !== "delivery-note") {
      return;
    }

    const childStage: Prisma.VoucherEntryWhereInput =
      kind === "purchase-order"
        ? {
            OR: [
              { voucherType: VoucherEntryType.PURCHASE, documentKind: "receipt-note" },
              { voucherType: VoucherEntryType.RECEIPT_NOTE },
            ],
          }
        : kind === "receipt-note"
          ? {
              voucherType: VoucherEntryType.PURCHASE,
              OR: [{ documentKind: "bill" }, { documentKind: null }],
            }
          : kind === "sale-order"
            ? {
                OR: [
                  { voucherType: VoucherEntryType.SALES, documentKind: "delivery-note" },
                  { voucherType: VoucherEntryType.DELIVERY_NOTE },
                ],
              }
            : {
                voucherType: VoucherEntryType.SALES,
                OR: [{ documentKind: null }, { documentKind: "bill" }],
              };
    const references = [entry.voucherNumber, entry.reference]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value));
    const sourceInventoryLineIds = kind === "delivery-note"
      ? (await this.prisma.voucherInventoryItem.findMany({
          where: { voucherId: entry.id },
          select: { id: true },
        })).map((line) => line.id)
      : [];
    const lineage: Prisma.VoucherEntryWhereInput = {
      OR: [
        { sourceVoucherId: entry.id },
        ...(kind === "receipt-note" && references.length
          ? references.map((reference) => ({ lines: { some: { billReference: { contains: reference } } } }))
          : []),
        ...(kind === "delivery-note" && sourceInventoryLineIds.length
          ? [{ inventoryItems: { some: { sourceInventoryLineId: { in: sourceInventoryLineIds } } } }]
          : []),
      ],
    };
    const child = await this.prisma.voucherEntry.findFirst({
      where: {
        workspaceId: entry.workspaceId,
        status: {
          notIn: [
            VoucherEntryStatus.REJECTED,
            VoucherEntryStatus.CANCELLED,
            VoucherEntryStatus.REVERSED,
            VoucherEntryStatus.SUPERSEDED_BY_ALTERATION,
          ],
        },
        AND: [childStage, lineage],
      },
      select: { voucherNumber: true },
    });
    if (!child) return;

    const sourceLabel =
      kind === "purchase-order" ? "Purchase Order" :
      kind === "receipt-note" ? "Receipt Note" :
      kind === "sale-order" ? "Sales Order" : "Delivery Note";
    const childLabel =
      kind === "purchase-order" ? "Receipt Note" :
      kind === "receipt-note" ? "Purchase Bill" :
      kind === "sale-order" ? "Delivery Note" : "Sales Invoice";
    throw new BadRequestException(
      `${sourceLabel} cannot be ${operation} while active ${childLabel} ${child.voucherNumber} exists. Reverse or cancel the child document first.`,
    );
  }

  private async validatePurchaseWorkflowLink(
    dto: CreateVoucherDto,
    workflowOrigin: VoucherWorkflowOrigin,
    existingId?: string,
    existingSourceVoucherId?: string | null,
  ) {
    const voucherType = mapVoucherTypeInput(dto.voucherType);
    if (!voucherType) return;
    const stage = this.purchaseWorkflowStage(voucherType, dto.documentKind);
    if (stage !== "receipt-note" && stage !== "bill") return;
    const sourceVoucherId = dto.sourceVoucherId?.trim();

    if (stage === "bill" && workflowOrigin === VoucherWorkflowOrigin.DIRECT) {
      if (sourceVoucherId) {
        throw new BadRequestException("A Direct Purchase Bill cannot keep an order-flow source reference");
      }
      return;
    }

    if (!sourceVoucherId) {
      throw new BadRequestException(`${stage === "receipt-note" ? "Receipt Note" : "Purchase Bill"} must keep its source document reference`);
    }
    const source = await this.prisma.voucherEntry.findFirst({
      where: { id: sourceVoucherId, workspaceId: dto.workspaceId },
      select: { id: true, voucherType: true, documentKind: true, voucherNumber: true, sourceVoucherId: true, status: true },
    });
    const expectedSourceKind = stage === "receipt-note" ? "purchase-order" : "receipt-note";
    const actualSourceKind = source ? this.canonicalDocumentKind(source.voucherType, source.documentKind) : null;
    if (!source || actualSourceKind !== expectedSourceKind) {
      throw new BadRequestException(`${stage === "receipt-note" ? "Receipt Note" : "Purchase Bill"} must reference a valid ${expectedSourceKind === "purchase-order" ? "Purchase Order" : "Receipt Note"}`);
    }
    if (sourceVoucherId !== existingSourceVoucherId && source.status !== VoucherEntryStatus.POSTED) {
      throw new BadRequestException(
        `${expectedSourceKind === "purchase-order" ? "Purchase Order" : "Receipt Note"} ${source.voucherNumber} must be posted before creating a ${stage === "receipt-note" ? "Receipt Note" : "Purchase Bill"}`,
      );
    }
    // One Purchase Order may be fulfilled by several partial Receipt Notes.
    // Exact line/remaining-quantity validation runs after inventory lines have
    // been normalized in assertReceiptNoteAgainstPurchaseOrder(). A Purchase
    // Bill remains one-to-one with its source Receipt Note below.
    if (stage === "receipt-note") return;
    if (stage === "bill") {
      const purchaseOrder = source.sourceVoucherId
          ? await this.prisma.voucherEntry.findFirst({
            where: {
              id: source.sourceVoucherId,
              workspaceId: dto.workspaceId,
              OR: [
                { documentKind: "purchase-order" },
                { voucherType: VoucherEntryType.PURCHASE_ORDER },
              ],
            },
            select: { id: true },
          })
        : null;
      if (!purchaseOrder) {
        throw new BadRequestException("Purchase Bill source Receipt Note must retain its Purchase Order reference");
      }
    }
    const existingChild = await this.prisma.voucherEntry.findFirst({
      where: {
        workspaceId: dto.workspaceId,
        sourceVoucherId,
        OR: [
          { voucherType: VoucherEntryType.PURCHASE, documentKind: "bill" },
          { voucherType: VoucherEntryType.PURCHASE, documentKind: null },
        ],
        ...(existingId ? { id: { not: existingId } } : {}),
      },
      select: { voucherNumber: true, documentKind: true },
    });
    if (existingChild) {
      throw new BadRequestException(`${source.voucherNumber} has already been converted to ${existingChild.voucherNumber}`);
    }
  }

  private async validateSalesWorkflowLink(
    dto: CreateVoucherDto,
    workflowOrigin: VoucherWorkflowOrigin,
    existingId?: string,
    existingSourceVoucherId?: string | null,
  ) {
    const voucherType = mapVoucherTypeInput(dto.voucherType);
    if (!voucherType) return;
    const stage = this.salesWorkflowStage(voucherType, dto.documentKind);
    if (stage !== "invoice") return;
    const sourceVoucherId = dto.sourceVoucherId?.trim();

    if (workflowOrigin === VoucherWorkflowOrigin.DIRECT) {
      if (sourceVoucherId) {
        // Compatibility for invoices that historically converted straight from
        // a Sales Order. The immutable DIRECT snapshot remains authoritative,
        // but callers may neither add nor swap this legacy source.
        if (existingId && sourceVoucherId === existingSourceVoucherId?.trim()) {
          return;
        }
        throw new BadRequestException("A Direct Sales Invoice cannot keep an order-flow source reference");
      }
      return;
    }
    if (!sourceVoucherId) {
      throw new BadRequestException("Sales Invoice must keep its Delivery Note reference");
    }

    const deliveryNote = await this.prisma.voucherEntry.findFirst({
      where: { id: sourceVoucherId, workspaceId: dto.workspaceId },
      select: { voucherType: true, documentKind: true, voucherNumber: true, sourceVoucherId: true, status: true },
    });
    const deliveryKind = deliveryNote ? this.canonicalDocumentKind(deliveryNote.voucherType, deliveryNote.documentKind) : null;
    if (!deliveryNote || deliveryKind !== "delivery-note") {
      throw new BadRequestException("Sales Invoice must reference a valid Delivery Note");
    }
    if (sourceVoucherId !== existingSourceVoucherId && deliveryNote.status !== VoucherEntryStatus.POSTED) {
      throw new BadRequestException(`Delivery Note ${deliveryNote.voucherNumber} must be posted before creating a Sales Invoice`);
    }
    const saleOrder = deliveryNote.sourceVoucherId
      ? await this.prisma.voucherEntry.findFirst({
          where: {
            id: deliveryNote.sourceVoucherId,
            workspaceId: dto.workspaceId,
            OR: [
              { documentKind: "sale-order" },
              { voucherType: VoucherEntryType.SALES_ORDER },
            ],
          },
          select: { id: true },
        })
      : null;
    if (!saleOrder) {
      throw new BadRequestException("Sales Invoice source Delivery Note must retain its Sales Order reference");
    }
    // Quantity allocation is line-authoritative and validated after item
    // normalization. A Delivery Note may be billed by several partial invoices,
    // and one invoice may combine several notes, so a one-header/one-child guard
    // would reject valid workflows and miss every non-primary source note.
  }

  private async ensureWorkspaceAccess(currentUser: AuthenticatedRequestUser, workspaceId: string) {
    const membership = await this.prisma.workspaceMember.findFirst({
      where: {
        userId: currentUser.id,
        workspaceId,
      },
    });

    if (!membership) {
      throw new ForbiddenException("Workspace access denied");
    }
  }

  /**
   * New GL postings are account-id authoritative. A supplied id wins and is
   * validated by PostingEngine; application-owned system labels are resolved
   * by protected code and Party lines resolve through Party.ledgerAccountId.
   * Every other non-zero line must supply its Account id. The persisted ledger
   * is only the account's current display-name snapshot, never an independent
   * accounting identity.
   */
  private async bindLinesToAccountIds(
    companyId: string,
    dto: CreateVoucherDto,
    partyAccount: { id: string; name: string; accountGroup: { code: string } | null } | null,
  ) {
    const systemCodeByLedger = new Map([
      ["cash in hand", "1221001"],
      ["petty cash", "1221002"],
      ["inventory control", "1210001"],
      ["inventory delivered pending invoice", "1232001"],
      ["purchase bill pending", "2212001"],
      ["provident fund payable", "2250001"],
      ["opening balance equity", "3100001"],
      ["sales account", "4110001"],
      ["sales return", "4120001"],
      ["inventory adjustment gain", "4200001"],
      ["cost of goods sold", "5110001"],
      ["provident fund expense", "5210006"],
      ["round off", "5210007"],
      ["inventory adjustment loss", "5210008"],
    ]);
    const nonZeroLines = dto.lines.filter((line) => Number(line.debit || 0) !== 0 || Number(line.credit || 0) !== 0);
    const requiredSystemCodes = [...new Set(nonZeroLines
      .map((line) => systemCodeByLedger.get(line.ledger.trim().toLowerCase()))
      .filter((code): code is string => Boolean(code)))];

    const systemAccounts = requiredSystemCodes.length
      ? await this.prisma.account.findMany({
          where: { companyId, code: { in: requiredSystemCodes }, isSystem: true, status: "ACTIVE", level: "LEDGER" },
          select: { id: true, code: true, name: true },
        })
      : [];

    const systemByCode = new Map(systemAccounts.map((account) => [account.code, account]));
    const missingSystemCode = requiredSystemCodes.find((code) => !systemByCode.has(code));
    if (missingSystemCode) {
      throw new BadRequestException(`Required system account ${missingSystemCode} is missing or inactive`);
    }
    const partyNameKey = dto.partyName.trim().toLowerCase();

    dto.lines = dto.lines.map((line) => {
      if (Number(line.debit || 0) === 0 && Number(line.credit || 0) === 0) return line;

      const ledgerKey = line.ledger.trim().toLowerCase();
      const systemCode = systemCodeByLedger.get(ledgerKey);
      const systemAccount = systemCode ? systemByCode.get(systemCode) : undefined;
      if (systemAccount) {
        if (line.accountId?.trim() && line.accountId.trim() !== systemAccount.id) {
          throw new BadRequestException(`${systemAccount.name} must post to protected account ${systemAccount.code}`);
        }
        return { ...line, accountId: systemAccount.id, ledger: systemAccount.name };
      }

      const isPartyLine = Boolean(partyAccount) && (
        ledgerKey === partyNameKey
        || line.accountId?.trim() === partyAccount?.id
      );
      if (isPartyLine && partyAccount) {
        if (line.accountId?.trim() && line.accountId.trim() !== partyAccount.id) {
          throw new BadRequestException("Customer/Supplier posting account does not match the selected Party");
        }
        return { ...line, accountId: partyAccount.id, ledger: partyAccount.name };
      }

      if (line.accountId?.trim()) return { ...line, accountId: line.accountId.trim() };
      throw new BadRequestException(`Select one active Chart of Accounts ledger by ID for ${line.ledger || "this voucher line"}`);
    });

    const missingAccountLine = dto.lines.find(
      (line) => (Number(line.debit || 0) !== 0 || Number(line.credit || 0) !== 0) && !line.accountId?.trim(),
    );
    if (missingAccountLine) {
      throw new BadRequestException(`Select an active Chart of Accounts ledger for ${missingAccountLine.ledger || "every voucher line"}`);
    }
  }

  private async persistVoucher(
    currentUser: AuthenticatedRequestUser,
    dto: CreateVoucherDto,
    existing?: {
      id: string;
      voucherNumber: string;
      status?: VoucherEntryStatus;
      sourceVoucherId?: string | null;
      workflowOrigin?: VoucherWorkflowOrigin | null;
      voucherType?: VoucherEntryType;
      documentKind?: string | null;
    },
    allowOwnerPostedEdit = false,
  ) {
    await this.ensureWorkspaceAccess(currentUser, dto.workspaceId);
    const auditExisting = existing
      ? await this.prisma.voucherEntry.findUnique({
          where: { id: existing.id },
          include: { inventoryItems: true },
        })
      : null;

    // Edit payloads historically omit conversion metadata. Keeping the stored
    // source prevents an edit from silently severing Bill/Return lineage and
    // also ensures the return validators below still run on every revision.
    if (dto.sourceVoucherId == null && existing?.sourceVoucherId) {
      dto.sourceVoucherId = existing.sourceVoucherId;
    }
    if (dto.documentKind == null && existing?.documentKind) {
      dto.documentKind = existing.documentKind;
    }

    const voucherType = mapVoucherTypeInput(dto.voucherType);
    // The edit screen submits its normal pre-posting form status (usually
    // "pending"). During an Owner-authorised alteration that must not demote a
    // posted document or make the update fail: retain the authoritative status
    // already stored on the voucher.
    const status = allowOwnerPostedEdit && existing?.status
      ? existing.status
      : mapVoucherStatusInput(dto.status);

    if (!voucherType || !status) {
      throw new BadRequestException("Invalid voucher type or status");
    }
    if (existing?.voucherType && voucherType !== existing.voucherType) {
      throw new BadRequestException("Voucher type cannot be changed after creation");
    }
    dto.documentKind = this.canonicalDocumentKind(voucherType, dto.documentKind);
    this.assertDocumentKindMatchesVoucherType(voucherType, dto.documentKind);
    if (existing?.voucherType) {
      const previousPurchaseStage = this.purchaseWorkflowStage(existing.voucherType, existing.documentKind);
      const nextPurchaseStage = this.purchaseWorkflowStage(voucherType, dto.documentKind);
      const previousSalesStage = this.salesWorkflowStage(existing.voucherType, existing.documentKind);
      const nextSalesStage = this.salesWorkflowStage(voucherType, dto.documentKind);
      if (previousPurchaseStage !== nextPurchaseStage || previousSalesStage !== nextSalesStage) {
        throw new BadRequestException("Voucher document stage cannot be changed after creation");
      }
      const previousKind = this.canonicalDocumentKind(existing.voucherType, existing.documentKind);
      if (!previousPurchaseStage && !previousSalesStage && previousKind && previousKind !== dto.documentKind) {
        throw new BadRequestException("Voucher document kind cannot be changed after creation");
      }
    }
    const workflowOrigin = await this.resolveWorkflowOrigin(currentUser, dto, voucherType, existing);

    // The Purchase Return form submits its own Return No. in `reference`.
    // preparePurchaseReturn subsequently replaces `reference` with the verified
    // source Purchase Bill number so the document lineage remains searchable.
    // Preserve the submitted Return No. first; otherwise the generic numbering
    // fallback below mistakes the source PB number for the new return's voucher
    // number and collides with the already-existing Purchase Bill.
    if (voucherType === VoucherEntryType.DEBIT_NOTE && !dto.voucherNumber?.trim() && dto.reference?.trim()) {
      dto.voucherNumber = dto.reference.trim();
    }

    if (voucherType === VoucherEntryType.CREDIT_NOTE) {
      await this.prepareSalesReturn(dto, existing?.id);
    }
    if (voucherType === VoucherEntryType.DEBIT_NOTE) {
      await this.preparePurchaseReturn(dto, existing?.id);
    }
    if (voucherType === VoucherEntryType.RECEIPT) {
      await this.validateCustomerReceipt(dto, existing?.id);
    }
    await this.validatePurchaseWorkflowLink(dto, workflowOrigin, existing?.id, existing?.sourceVoucherId);
    await this.validateSalesWorkflowLink(dto, workflowOrigin, existing?.id, existing?.sourceVoucherId);

    // A Quotation, Proforma, Sale Order, or Delivery Note is a record of intent
    // or handover, not a financial event — it must never touch the books.
    // Enforced here (not just left to the client) so no caller can post a
    // Receivable/Sales entry against one of these stages. Item quantities are
    // untouched — the inventory snapshot decides stock effect from documentKind
    // separately, and still needs them.
    if (NON_FINANCIAL_SALES_DOCUMENT_KINDS.has(dto.documentKind?.trim() ?? "")) {
      dto.lines = [];
    }

    const purchaseDocumentKind = dto.documentKind?.trim() ?? "";
    if (NON_FINANCIAL_PURCHASE_DOCUMENT_KINDS.has(purchaseDocumentKind)) {
      dto.lines = [];
    }

    if (this.purchaseWorkflowStage(voucherType, purchaseDocumentKind) === "receipt-note") {
      const amount = roundMoney(dto.totalAmount ?? Math.max(
        sumMoney(dto.lines.map((line) => line.debit)),
        sumMoney(dto.lines.map((line) => line.credit)),
      ));
      // Preserved from whatever the client sent — for a receipt note billed against a
      // Purchase Order this is the order's own reference/number, and it is the only
      // trail back to that order once these lines get replaced below.
      const billReference = dto.lines.find((line) => line.billReference?.trim())?.billReference?.trim() || undefined;
      dto.lines = [
        { id: "receipt-note-stock", ledger: "Inventory Control", description: "Goods received", debit: amount, credit: 0, billReference },
        { id: "receipt-note-pending", ledger: "Purchase Bill Pending", description: "Supplier bill pending", debit: 0, credit: amount, billReference },
      ];
    }

    if (this.purchaseWorkflowStage(voucherType, purchaseDocumentKind) === "bill" && dto.sourceVoucherId?.trim()) {
      const source = await this.prisma.voucherEntry.findFirst({
        where: { id: dto.sourceVoucherId.trim(), workspaceId: dto.workspaceId },
        select: { documentKind: true },
      });
      if (source?.documentKind === "receipt-note") {
        const amount = roundMoney(dto.totalAmount ?? Math.max(
          sumMoney(dto.lines.map((line) => line.debit)),
          sumMoney(dto.lines.map((line) => line.credit)),
        ));
        // Keep the client's complete credit side: new money-account payments plus
        // the supplier-payable remainder. Earlier PO advances are already posted.
        const clientCreditLines = dto.lines.filter((line) => Number(line.credit || 0) > 0);
        // The schema only lets a bill carry one sourceVoucherId, so when several
        // Receipt Notes are combined into one bill (see applyMultiReceiptNoteSelection
        // in voucher-entry-screen.tsx) only the first is linked by id — every other
        // combined note's number lives in this "+"-joined billReference instead. Losing
        // it here (the previous behavior) left those other notes permanently stuck
        // showing "Pending Bill" with an active "Convert to Purchase Bill" action, even
        // though they had already been billed as part of this very voucher.
        const billReference = dto.lines.find((line) => line.billReference?.trim())?.billReference?.trim() || undefined;
        // Account ids stay attached so the posting guard still validates each chosen
        // Cash/Bank/MFS ledger rather than trusting free-text ledger names.
        dto.lines = [
          { id: "bill-clear-pending", ledger: "Purchase Bill Pending", description: "Receipt note billed", debit: amount, credit: 0, billReference },
          ...clientCreditLines.map((line) => ({
            ...line,
            debit: 0,
            billReference: line.billReference?.trim() || billReference,
          })),
        ];
      }
    }

    const partyType = mapPartyTypeFromVoucherType(voucherType);
    const party = partyType !== null
      ? dto.partyId?.trim()
        ? await this.prisma.party.findFirst({
            where: {
              id: dto.partyId.trim(),
              workspaceId: dto.workspaceId,
              type: partyType,
              status: "ACTIVE",
            },
            include: {
              ledgerAccount: {
                include: { accountGroup: { select: { code: true } } },
              },
            },
          })
        : await this.prisma.party.findUnique({
            where: {
              workspaceId_type_name: {
                workspaceId: dto.workspaceId,
                type: partyType,
                name: dto.partyName.trim(),
              },
            },
            include: {
              ledgerAccount: {
                include: { accountGroup: { select: { code: true } } },
              },
            },
          })
      : null;
    if (partyType !== null && !party) {
      throw new BadRequestException("Create the buyer / party first from Parties master");
    }
    if (party) {
      dto.partyId = party.id;
      dto.partyName = party.name;
      const expectedGroup = party.type === "SUPPLIER" ? "AP" : "AR";
      if (
        !party.ledgerAccount
        || party.ledgerAccount.companyId !== currentUser.companyId
        || party.ledgerAccount.level !== "LEDGER"
        || party.ledgerAccount.status !== "ACTIVE"
        || party.ledgerAccount.accountGroup?.code !== expectedGroup
      ) {
        throw new BadRequestException(`The selected ${party.type === "SUPPLIER" ? "supplier" : "customer"} is not linked to one active Chart of Accounts ledger`);
      }
    }
    await this.bindLinesToAccountIds(currentUser.companyId, dto, party?.ledgerAccount ?? null);

    if (!allowOwnerPostedEdit) {
      this.postingEngine.assertDirectlySettable(status);
    } else if (status !== VoucherEntryStatus.POSTED && status !== VoucherEntryStatus.APPROVED) {
      throw new BadRequestException("Owner alteration must preserve the approved/posted voucher status");
    }
    dto.lines = this.postingEngine.normalizeLines(dto.lines);
    this.postingEngine.assertBalanced(dto.lines, `voucher ${dto.reference ?? ""}`.trim());
    if (voucherType === VoucherEntryType.PAYMENT || voucherType === VoucherEntryType.RECEIPT) {
      const paymentSourceWithoutLedger = dto.lines.find((line) => Number(voucherType === VoucherEntryType.RECEIPT ? line.debit : line.credit || 0) > 0 && Boolean(line.moneyAccountType) && !line.accountId?.trim());
      if (paymentSourceWithoutLedger) {
        throw new BadRequestException(`Select an active account ledger for every ${voucherType === VoucherEntryType.RECEIPT ? "receipt" : "payment"} source`);
      }
    }
    await this.postingEngine.assertPostableAccounts(currentUser.companyId, dto.lines);
    const referencedAccountIds = [...new Set(dto.lines.map((line) => line.accountId?.trim()).filter((id): id is string => Boolean(id)))];
    if (referencedAccountIds.length) {
      const referencedAccounts = await this.prisma.account.findMany({
        where: { companyId: currentUser.companyId, id: { in: referencedAccountIds } },
        select: { id: true, name: true },
      });
      const authoritativeNames = new Map(referencedAccounts.map((account) => [account.id, account.name]));
      dto.lines = dto.lines.map((line) => line.accountId
        ? { ...line, ledger: authoritativeNames.get(line.accountId.trim()) ?? line.ledger }
        : line);
    }

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: dto.workspaceId },
    });

    if (!workspace || workspace.companyId !== currentUser.companyId || workspace.tenantId !== currentUser.tenantId) {
      throw new ForbiddenException("Workspace access denied");
    }

    const sourceVoucher = dto.sourceVoucherId?.trim()
      ? await this.prisma.voucherEntry.findFirst({
          where: { id: dto.sourceVoucherId.trim(), workspaceId: dto.workspaceId },
          select: {
            documentKind: true,
            warehouseId: true,
            inventoryItems: {
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
              select: {
                id: true,
                inventoryItemId: true,
                itemName: true,
                warehouseId: true,
                manufacturingInventoryLotId: true,
                manufacturingSerialIds: true,
                batchNumber: true,
                manufacturedAt: true,
                expiresAt: true,
              },
            },
          },
        })
      : null;
    const defaultWarehouse = !dto.warehouseId?.trim() && !sourceVoucher?.warehouseId
      ? await this.prisma.warehouse.findFirst({
          where: { workspaceId: dto.workspaceId, isDefault: true, isActive: true, deletedAt: null },
        })
      : null;
    const warehouseId = dto.warehouseId?.trim() || sourceVoucher?.warehouseId || defaultWarehouse?.id || null;

    // Older/API clients may omit line warehouseId during a conversion. Match each
    // occurrence against the source's stable creation order, grouped by product,
    // so two rows for the same fridge can still inherit two different warehouses.
    const sourceMatchOffsets = new Map<string, number>();
    const sourceLineDefaults = (dto.inventoryItems ?? []).map((item) => {
      const itemNameKey = item.itemName.trim().toLowerCase();
      const requestedId = item.id?.trim();
      const requestedSourceLineId = item.sourceInventoryLineId?.trim();
      const exactSourceLine = sourceVoucher?.inventoryItems.find(
        (sourceItem) => sourceItem.id === requestedSourceLineId || sourceItem.id === requestedId,
      );
      if (exactSourceLine) {
        return exactSourceLine;
      }

      const matchingSourceItems = (sourceVoucher?.inventoryItems ?? []).filter(
        (sourceItem) =>
          sourceItem.itemName.trim().toLowerCase() === itemNameKey ||
          (requestedId && sourceItem.inventoryItemId === requestedId),
      );
      const matchKey = requestedId && matchingSourceItems.some((sourceItem) => sourceItem.inventoryItemId === requestedId)
        ? `inventory:${requestedId}`
        : `name:${itemNameKey}`;
      const matchOffset = sourceMatchOffsets.get(matchKey) ?? 0;
      sourceMatchOffsets.set(matchKey, matchOffset + 1);
      return matchingSourceItems[matchOffset] ?? (matchingSourceItems.length === 1 ? matchingSourceItems[0] : null);
    });
    const sourceLineWarehouseIds = sourceLineDefaults.map((sourceLine) => sourceLine?.warehouseId ?? null);
    const warehouseIdsToValidate = Array.from(
      new Set(
        [
          warehouseId,
          ...(dto.inventoryItems ?? []).map((item) => item.warehouseId?.trim() || null),
          ...sourceLineWarehouseIds,
        ].filter((id): id is string => Boolean(id)),
      ),
    );
    const warehouseRecords = warehouseIdsToValidate.length
      ? await this.prisma.warehouse.findMany({
          where: { id: { in: warehouseIdsToValidate }, workspaceId: dto.workspaceId },
          select: { id: true, isActive: true, deletedAt: true },
        })
      : [];
    const activeWarehouseIds = new Set(
      warehouseRecords.filter((warehouse) => warehouse.isActive && !warehouse.deletedAt).map((warehouse) => warehouse.id),
    );
    const sourceAlreadyMovedStock =
      (voucherType === VoucherEntryType.PURCHASE && sourceVoucher?.documentKind === "receipt-note") ||
      (voucherType === VoucherEntryType.SALES && sourceVoucher?.documentKind === "delivery-note");
    const validWarehouseIds = new Set(activeWarehouseIds);
    if (sourceAlreadyMovedStock) {
      // A bill/invoice raised from a goods document has no second stock effect.
      // Preserve historical locations even when a warehouse was deactivated after
      // receipt/delivery. This also covers one bill combining several receipt notes;
      // only its first source can be represented by sourceVoucherId. Foreign/deleted
      // warehouses remain invalid because warehouseRecords is workspace-scoped.
      warehouseRecords.forEach((warehouse) => {
        if (!warehouse.deletedAt) validWarehouseIds.add(warehouse.id);
      });
    }
    if (warehouseId && !validWarehouseIds.has(warehouseId)) {
      throw new BadRequestException("Select an active warehouse in this workspace");
    }

    const debit = sumMoney(dto.lines.map((line) => line.debit));
    const credit = sumMoney(dto.lines.map((line) => line.credit));
    // `|| ` rather than `?? ` on purpose: a caller sending a literal 0 (a client
    // bug computing totalAmount from an unrelated item grid instead of the
    // actual lines, e.g. a Journal entry) means "not really provided" exactly
    // like omitting it — no voucher type has a legitimate reason to carry real,
    // non-zero double-entry lines under a total of exactly 0.
    const totalAmount = roundMoney(dto.totalAmount || Math.max(debit, credit));
    const requestedPaidAmount = Number(dto.paidAmount ?? 0);
    if (!Number.isFinite(requestedPaidAmount) || requestedPaidAmount < 0) {
      throw new BadRequestException("Paid amount must be zero or greater");
    }
    const paidAmount = roundMoney(requestedPaidAmount);
    if (paidAmount > totalAmount) {
      throw new BadRequestException("Paid amount cannot be greater than the document total");
    }
    const voucherDate = new Date(dto.voucherDate);

    const previousVoucherNumbers = !existing
      ? await this.prisma.voucherEntry.findMany({
          where: {
            workspaceId: dto.workspaceId,
            voucherType,
            ...(dto.documentKind?.trim() ? { documentKind: dto.documentKind.trim() } : {}),
            voucherNumber: {
              startsWith: voucherNumberStem(voucherType, voucherDate, dto.documentKind),
            },
          },
          select: { voucherNumber: true },
        })
      : [];

    const inventoryItems = dto.inventoryItems?.length
      ? await Promise.all(
          dto.inventoryItems.map(async (item, index) => {
            const itemName = item.itemName.trim();
            const inventoryItem = await this.prisma.inventoryItem.findUnique({
              where: {
                workspaceId_itemName: {
                  workspaceId: dto.workspaceId,
                  itemName,
                },
              },
              select: { id: true, trackBatchExpiry: true },
            });
            if (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0) {
              throw new BadRequestException(`${itemName}: quantity must be greater than zero`);
            }
            if (!Number.isFinite(Number(item.unitPrice)) || Number(item.unitPrice) < 0) {
              throw new BadRequestException(`${itemName}: rate cannot be negative`);
            }
            const sourceInventoryLineId = item.sourceInventoryLineId?.trim() || null;
            if (sourceInventoryLineId) {
              const validSourceLine = await this.prisma.voucherInventoryItem.findFirst({
                where: { id: sourceInventoryLineId, voucher: { workspaceId: dto.workspaceId } },
                select: { id: true },
              });
              if (!validSourceLine) throw new BadRequestException(`${itemName}: source stock line is invalid`);
            }
            const lineWarehouseId = item.warehouseId?.trim() || sourceLineWarehouseIds[index] || warehouseId;
            if (lineWarehouseId && !validWarehouseIds.has(lineWarehouseId)) {
              throw new BadRequestException(`${itemName}: select an active warehouse in this workspace`);
            }

            const manufacturingInventoryLotId =
              item.manufacturingInventoryLotId?.trim() ||
              sourceLineDefaults[index]?.manufacturingInventoryLotId ||
              null;
            const manufacturingSerialIds = [
              ...new Set(
                (item.manufacturingSerialIds === undefined
                  ? sourceLineDefaults[index]?.manufacturingSerialIds ?? []
                  : item.manufacturingSerialIds
                )
                  .map((serialId) => serialId.trim())
                  .filter(Boolean),
              ),
            ];
            const batchNumber = item.batchNumber?.trim() || sourceLineDefaults[index]?.batchNumber || null;
            const manufacturedAt = item.manufacturedAt
              ? new Date(item.manufacturedAt)
              : sourceLineDefaults[index]?.manufacturedAt ?? null;
            const expiresAt = item.expiresAt
              ? new Date(item.expiresAt)
              : sourceLineDefaults[index]?.expiresAt ?? null;
            if (manufacturedAt && expiresAt && manufacturedAt > expiresAt) {
              throw new BadRequestException(`${itemName}: Manufacturing Date cannot be after Expiry Date`);
            }

            // Only a purchase can move the item's cost basis; a sale must never
            // overwrite it with the selling price (see Phase 1 audit finding #8 —
            // real moving-weighted-average costing is Phase 3 scope).
            return {
              inventoryItemId: inventoryItem?.id ?? null,
              warehouseId: lineWarehouseId || null,
              sourceInventoryLineId,
              manufacturingInventoryLotId,
              manufacturingSerialIds,
              batchNumber,
              manufacturedAt,
              expiresAt,
              itemName,
              quantity: Number(item.quantity || 0),
              // Valuation rates retain their schema precision; only the posted
              // monetary extension is rounded to the BDT minor unit.
              unitPrice: Number(item.unitPrice || 0),
              lineTotal: roundMoney(Number(item.quantity || 0) * Number(item.unitPrice || 0)),
            };
          }),
        )
      : [];

    if (this.salesWorkflowStage(voucherType, dto.documentKind) === "delivery-note") {
      await this.assertDeliveryNoteAgainstSaleOrder(dto, inventoryItems, existing?.id, existing?.sourceVoucherId);
    }
    if (this.purchaseWorkflowStage(voucherType, dto.documentKind) === "receipt-note") {
      await this.assertReceiptNoteAgainstPurchaseOrder(dto, inventoryItems, existing?.id, existing?.sourceVoucherId);
    }
    if (
      workflowOrigin === VoucherWorkflowOrigin.ORDER_FLOW &&
      this.salesWorkflowStage(voucherType, dto.documentKind) === "invoice"
    ) {
      await assertSalesInvoiceAllocation(
        this.prisma as unknown as Prisma.TransactionClient,
        {
          workspaceId: dto.workspaceId,
          companyId: currentUser.companyId,
          partyId: party?.id ?? null,
          partyName: dto.partyName,
          voucherDate,
          headerSourceVoucherId: dto.sourceVoucherId,
          lines: inventoryItems,
          excludeVoucherId: existing?.id,
        },
      );
    }

    const voucherNumber =
      existing?.voucherNumber ??
      dto.voucherNumber?.trim() ??
      (voucherType === VoucherEntryType.PAYMENT || voucherType === VoucherEntryType.CREDIT_NOTE ? null : dto.reference?.trim()) ??
      nextVoucherNumber(
        previousVoucherNumbers.map((entry) => entry.voucherNumber),
        voucherType,
        voucherDate,
        dto.documentKind,
      );
    const reference = dto.reference?.trim() || null;
    const narration = dto.narration?.trim() || null;

    let loyaltyPointsEarned = 0;
    let loyaltyPointsRedeemed = 0;
    let loyaltyDiscountAmount = 0;
    const isSalesInvoice = voucherType === VoucherEntryType.SALES && !dto.documentKind?.trim() && !dto.idempotencyKey?.startsWith("tally:");
    if (isSalesInvoice && party) {
      const loyaltyRow = await this.prisma.workspaceAppSettings.findUnique({
        where: { workspaceId_namespace: { workspaceId: dto.workspaceId, namespace: "loyalty" } },
        select: { settings: true },
      });
      const loyalty = (loyaltyRow?.settings && typeof loyaltyRow.settings === "object" ? loyaltyRow.settings : {}) as Record<string, unknown>;
      if (loyalty.enabled === true) {
        const rewardAmount = Number(loyalty.rewardAmount || 0);
        const minimumInvoiceAmount = Number(loyalty.minimumInvoiceAmount || 0);
        const redeemPoints = Math.floor(Number(loyalty.redeemPoints || 0));
        const redeemAmount = Number(loyalty.redeemAmount || 0);
        loyaltyPointsRedeemed = Math.floor(Number(dto.loyaltyPointsRedeemed || 0));
        loyaltyDiscountAmount = roundMoney(dto.loyaltyDiscountAmount || 0);
        if (loyaltyPointsRedeemed < 0 || loyaltyDiscountAmount < 0) throw new BadRequestException("Loyalty redemption cannot be negative");
        if ((loyaltyPointsRedeemed > 0 || loyaltyDiscountAmount > 0) && (redeemPoints <= 0 || redeemAmount <= 0)) throw new BadRequestException("Loyalty redeem conversion is not configured");
        const expectedDiscount = roundMoney(redeemPoints > 0 ? (loyaltyPointsRedeemed / redeemPoints) * redeemAmount : 0);
        if (loyaltyPointsRedeemed > 0 && (loyaltyPointsRedeemed % redeemPoints !== 0 || !moneyEquals(expectedDiscount, loyaltyDiscountAmount))) throw new BadRequestException("Redeemed points do not match the configured conversion");
        if (loyaltyDiscountAmount > roundMoney(dto.subtotal || totalAmount)) throw new BadRequestException("Loyalty discount cannot exceed the invoice amount");
        const expiryDays = Math.max(0, Math.floor(Number(loyalty.expiryDays || 0)));
        const expiryCutoff = new Date();
        expiryCutoff.setUTCDate(expiryCutoff.getUTCDate() - expiryDays);
        const balances = await this.prisma.$queryRaw<Array<{ earned: bigint; redeemed: bigint; expired: bigint }>>`
          SELECT COALESCE(SUM("loyaltyPointsEarned"), 0)::bigint AS earned,
                 COALESCE(SUM("loyaltyPointsRedeemed"), 0)::bigint AS redeemed,
                 COALESCE(SUM(CASE WHEN ${expiryDays} > 0 AND "voucherDate" < ${expiryCutoff} THEN "loyaltyPointsEarned" ELSE 0 END), 0)::bigint AS expired
          FROM "VoucherEntry"
          WHERE "workspaceId" = ${dto.workspaceId} AND "partyId" = ${party.id}
            AND "voucherType" = 'SALES' AND "documentKind" IS NULL
            AND "status" IN ('APPROVED', 'POSTED')
            ${existing ? Prisma.sql`AND "id" <> ${existing.id}` : Prisma.empty}
        `;
        const priorEarned = Number(balances[0]?.earned ?? 0);
        const priorRedeemed = Number(balances[0]?.redeemed ?? 0);
        const expiredUnspent = Math.max(0, Number(balances[0]?.expired ?? 0) - priorRedeemed);
        const availablePoints = Math.max(0, priorEarned - priorRedeemed - expiredUnspent);
        if (loyaltyPointsRedeemed > availablePoints) throw new BadRequestException("Customer does not have enough loyalty points");
        const eligibleSpend = totalAmount >= minimumInvoiceAmount ? totalAmount : 0;
        loyaltyPointsEarned = rewardAmount > 0 ? Math.floor(eligibleSpend / rewardAmount) : 0;
      }
    }

    const payload = {
      tenantId: currentUser.tenantId,
      companyId: currentUser.companyId,
      workspaceId: dto.workspaceId,
      createdByUserId: currentUser.id,
      voucherType,
      documentKind: dto.documentKind?.trim() || null,
      sourceVoucherId: dto.sourceVoucherId?.trim() || null,
      workflowOrigin,
      warehouseId,
      voucherNumber,
      voucherDate,
      partyName: dto.partyName.trim(),
      partyId: party?.id ?? null,
      reference,
      narration,
      status,
      settlementMode: mapSettlementModeInput(dto.settlementMode),
      paidAmount,
      supplierAddress: dto.supplierAddress?.trim() || null,
      condition: dto.condition?.trim() || null,
      buyerSignature: dto.buyerSignature?.trim() || null,
      sellerSignature: dto.sellerSignature?.trim() || null,
      attachmentImageUrl: dto.attachmentImageUrl?.trim() || null,
      attachmentDocumentUrl: dto.attachmentDocumentUrl?.trim() || null,
      attachmentDocumentName: dto.attachmentDocumentName?.trim() || null,
      discountType: mapDiscountTypeInput(dto.discountType),
      discountAmount: dto.discountAmount == null ? null : roundMoney(dto.discountAmount),
      roundOffAmount: dto.roundOffAmount == null ? null : roundMoney(dto.roundOffAmount),
      loyaltyPointsEarned,
      loyaltyPointsRedeemed,
      loyaltyDiscountAmount,
      subtotal: dto.subtotal == null ? null : roundMoney(dto.subtotal),
      totalAmount,
      debit,
      credit,
      idempotencyKey: existing ? undefined : dto.idempotencyKey?.trim() || null,
    } satisfies Omit<Prisma.VoucherEntryUncheckedCreateInput, "id">;

    const entry = await this.writeVoucherEntry(existing, payload, dto, inventoryItems);

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      companyId: currentUser.companyId,
      workspaceId: dto.workspaceId,
      userId: currentUser.id,
      action: existing ? "VOUCHER_UPDATED" : "VOUCHER_CREATED",
      entityType: "VoucherEntry",
      entityId: entry.id,
      oldValues: auditExisting
        ? {
            status: auditExisting.status,
            totalAmount: Number(auditExisting.totalAmount),
            voucherNumber: auditExisting.voucherNumber,
            voucherType: auditExisting.voucherType,
            partyName: auditExisting.partyName,
            reference: auditExisting.reference,
            narration: auditExisting.narration,
            paidAmount: Number(auditExisting.paidAmount),
            discountType: auditExisting.discountType,
            discountAmount: auditExisting.discountAmount === null ? null : Number(auditExisting.discountAmount),
            inventoryItems: auditExisting.inventoryItems.map((item) => ({ itemName: item.itemName, quantity: Number(item.quantity) })),
          }
        : undefined,
      newValues: {
        status: entry.status,
        totalAmount: Number(entry.totalAmount),
        voucherNumber: entry.voucherNumber,
        voucherType: entry.voucherType,
        partyName: entry.partyName,
        reference: entry.reference,
        narration: entry.narration,
        paidAmount: Number(entry.paidAmount),
        discountType: entry.discountType,
        discountAmount: entry.discountAmount === null ? null : Number(entry.discountAmount),
        inventoryItems: entry.inventoryItems.map((item) => ({ itemName: item.itemName, quantity: Number(item.quantity) })),
      },
    });

    return toDayBookRecord(entry);
  }

  /** Deletes a transaction and every document derived from it. */
  async resetSalesInvoice(currentUser: AuthenticatedRequestUser, voucherId: string, workspaceId?: string) {
    const root = await this.prisma.voucherEntry.findUnique({ where: { id: voucherId }, include: includedVoucherRelations });
    if (!root) throw new BadRequestException("Sales Invoice not found");
    const targetWorkspaceId = workspaceId ?? root.workspaceId ?? currentUser.workspaceId;
    await this.ensureWorkspaceAccess(currentUser, targetWorkspaceId);
    if (root.workspaceId !== targetWorkspaceId) throw new ForbiddenException("Workspace access denied");
    await this.assertVoucherAction(currentUser, root.voucherType, "delete", root.createdByUserId, root.documentKind);
    return this.deleteVoucherWithDependencies(currentUser, root, targetWorkspaceId);
  }

  private async deleteVoucherWithDependencies(
    currentUser: AuthenticatedRequestUser,
    root: Prisma.VoucherEntryGetPayload<{ include: typeof includedVoucherRelations }>,
    targetWorkspaceId: string,
  ) {

    const entries = [root];
    const seen = new Set([root.id]);
    let voucherFrontier = [root.id];
    let inventoryLineFrontier = root.inventoryItems.map((line) => line.id);
    while (voucherFrontier.length || inventoryLineFrontier.length) {
      const related = await this.prisma.voucherEntry.findMany({
        where: {
          OR: [
            ...(voucherFrontier.length ? [
              { sourceVoucherId: { in: voucherFrontier } },
              { reversalOfId: { in: voucherFrontier } },
              { sourceType: "INVENTORY_COST_REVALUATION", sourceId: { in: voucherFrontier } },
            ] : []),
            ...(inventoryLineFrontier.length ? [{
              inventoryItems: { some: { sourceInventoryLineId: { in: inventoryLineFrontier } } },
            }] : []),
          ],
        },
        include: includedVoucherRelations,
      });
      voucherFrontier = [];
      inventoryLineFrontier = [];
      for (const entry of related) {
        if (seen.has(entry.id)) continue;
        if (entry.workspaceId !== targetWorkspaceId || entry.companyId !== root.companyId) {
          throw new BadRequestException(
            `Voucher ${entry.voucherNumber} has a cross-workspace inventory/source dependency and cannot be deleted safely`,
          );
        }
        seen.add(entry.id);
        entries.push(entry);
        voucherFrontier.push(entry.id);
        inventoryLineFrontier.push(...entry.inventoryItems.map((line) => line.id));
      }
    }

    const entryIds = entries.map((entry) => entry.id);
    const inventoryLineIds = entries.flatMap((entry) => entry.inventoryItems.map((line) => line.id));
    await this.prisma.$transaction(async (tx) => {
      for (const entry of entries) {
        await tx.recycleBinEntry.create({
          data: {
            tenantId: entry.tenantId,
            companyId: entry.companyId,
            workspaceId: entry.workspaceId,
            kind: "VOUCHER",
            entityId: entry.id,
            transactionDate: entry.voucherDate,
            refNo: entry.reference || entry.voucherNumber,
            partyName: entry.partyName || "-",
            txnType: entry.voucherType,
            paymentType: entry.settlementMode ?? "Cash",
            amount: Number(entry.totalAmount || 0),
            deletedByUserId: currentUser.id,
            snapshot: JSON.parse(JSON.stringify(entry)),
          },
        });
      }

      const movements = await tx.stockMovement.findMany({
        where: { workspaceId: targetWorkspaceId, transactionId: { in: entryIds }, voidedAt: null },
        select: { id: true, inventoryItemId: true },
      });
      if (movements.length) {
        await tx.stockMovement.updateMany({
          where: { id: { in: movements.map((movement) => movement.id) } },
          data: { voidedAt: new Date(), voidReason: `Voucher reset by ${currentUser.name}` },
        });
      }
      await tx.inventoryCostRevaluation.deleteMany({
        where: {
          OR: [
            { billingVoucherId: { in: entryIds } },
            ...(inventoryLineIds.length ? [{ sourceInventoryLineId: { in: inventoryLineIds } }, { billingInventoryLineId: { in: inventoryLineIds } }] : []),
          ],
        },
      });
      // `sourceInventoryLineId` is RESTRICT, so one bulk delete is unsafe even
      // when every row belongs to this reset. Delete leaf/child lines first and
      // walk back toward their sources. The descendant closure above ensures a
      // secondary Delivery Note referenced only by an Invoice item is included.
      const lineById = new Map(entries.flatMap((entry) => entry.inventoryItems).map((line) => [line.id, line]));
      const remainingLineIds = new Set(lineById.keys());
      while (remainingLineIds.size) {
        const referencedSourceIds = new Set<string>();
        for (const lineId of remainingLineIds) {
          const sourceLineId = lineById.get(lineId)?.sourceInventoryLineId;
          if (sourceLineId && remainingLineIds.has(sourceLineId)) referencedSourceIds.add(sourceLineId);
        }
        const childLineIds = [...remainingLineIds].filter((lineId) => !referencedSourceIds.has(lineId));
        if (!childLineIds.length) {
          throw new BadRequestException("Inventory source-line dependency contains a cycle and cannot be deleted safely");
        }
        const deleted = await tx.voucherInventoryItem.deleteMany({ where: { id: { in: childLineIds } } });
        if (typeof deleted.count === "number" && deleted.count !== childLineIds.length) {
          throw new BadRequestException("Inventory source-line dependency changed during deletion; retry the operation");
        }
        childLineIds.forEach((lineId) => remainingLineIds.delete(lineId));
      }
      await tx.voucherEntryLine.deleteMany({ where: { voucherId: { in: entryIds } } });
      // Children first keeps this safe even if sourceVoucherId becomes a formal FK later.
      for (const entry of [...entries].reverse()) await tx.voucherEntry.delete({ where: { id: entry.id } });
      if (movements.length) {
        const valuation = await rebuildMovingAverageCosts(tx, targetWorkspaceId, [...new Set(movements.map((movement) => movement.inventoryItemId))]);
        await this.inventoryService?.reconcileMovingAverageLedger(tx, targetWorkspaceId, valuation.movements, currentUser.id);
      }
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      companyId: currentUser.companyId,
      workspaceId: targetWorkspaceId,
      userId: currentUser.id,
      action: "VOUCHER_DELETED",
      entityType: "VoucherEntry",
      entityId: root.id,
      oldValues: {
        voucherNumber: root.voucherNumber,
        voucherType: root.voucherType,
        voucherDate: root.voucherDate.toISOString(),
        partyName: root.partyName,
        totalAmount: Number(root.totalAmount),
        reference: root.reference,
        deletedVoucherIds: entryIds,
      },
    });
    return { ...toDayBookRecord(root), deletedLinkedCount: entries.length - 1 };
  }

  /**
   * A Purchase Return may point at a Purchase Bill. Once it does, every item
   * row must point at the exact bill line it is returning. Quantities are
   * checked cumulatively against prior live returns, following the line's
   * source chain as well (Bill -> Receipt Note -> Purchase Order) so an older
   * return linked to an intermediate line cannot be returned a second time.
   *
   * A source is mandatory: without it the exact acquisition cost and maximum
   * returnable quantity cannot be proven.
   */
  private async preparePurchaseReturn(dto: CreateVoucherDto, existingId?: string) {
    const requestedSettlementMode = dto.settlementMode ?? "accounts-payable";
    const requestedRefundLines = dto.lines.filter(
      (line) => Boolean(line.accountId && line.moneyAccountType) && Number(line.debit) > 0 && Number(line.credit) === 0,
    );
    const sourceVoucherId = dto.sourceVoucherId?.trim();
    if (!sourceVoucherId) {
      throw new BadRequestException("Select the original Purchase Bill for this Purchase Return");
    }

    const purchase = await this.prisma.voucherEntry.findFirst({
      where: { id: sourceVoucherId, workspaceId: dto.workspaceId },
      include: includedVoucherRelations,
    });
    if (
      !purchase ||
      purchase.voucherType !== VoucherEntryType.PURCHASE ||
      (Boolean(purchase.documentKind) && purchase.documentKind !== "bill") ||
      purchase.status !== VoucherEntryStatus.POSTED
    ) {
      throw new BadRequestException("The selected source must be a posted Purchase Bill");
    }
    if (purchase.partyName.trim() !== dto.partyName.trim()) {
      throw new BadRequestException("Purchase Return supplier must match the original bill supplier");
    }
    if (new Date(dto.voucherDate).getTime() < purchase.voucherDate.getTime()) {
      throw new BadRequestException("Purchase Return date cannot be earlier than the source Purchase Bill date");
    }
    if (!dto.inventoryItems?.length) {
      throw new BadRequestException("Add at least one returned Purchase Bill item");
    }
    if (!purchase.inventoryItems.length) {
      throw new BadRequestException(`Purchase Bill ${purchase.voucherNumber} has no returnable inventory lines`);
    }

    const sourceLinesById = new Map(purchase.inventoryItems.map((line) => [line.id, line]));
    const currentQuantityBySourceLine = new Map<string, number>();
    const normalizedItems = dto.inventoryItems.map((requested) => {
      const sourceInventoryLineId = requested.sourceInventoryLineId?.trim();
      if (!sourceInventoryLineId) {
        throw new BadRequestException(`${requested.itemName}: select the original Purchase Bill line`);
      }
      const sourceLine = sourceLinesById.get(sourceInventoryLineId);
      if (!sourceLine) {
        throw new BadRequestException(
          `${requested.itemName}: source stock line does not belong to Purchase Bill ${purchase.voucherNumber}`,
        );
      }
      if (sourceLine.itemName.trim().toLowerCase() !== requested.itemName.trim().toLowerCase()) {
        throw new BadRequestException(
          `${requested.itemName}: source stock line belongs to ${sourceLine.itemName}, not this item`,
        );
      }

      const quantity = Number(requested.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new BadRequestException(`${sourceLine.itemName}: return quantity must be greater than zero`);
      }
      currentQuantityBySourceLine.set(
        sourceLine.id,
        (currentQuantityBySourceLine.get(sourceLine.id) ?? 0) + quantity,
      );

      return {
        id: sourceLine.inventoryItemId ?? sourceLine.id,
        sourceInventoryLineId: sourceLine.id,
        itemName: sourceLine.itemName,
        quantity,
        unitPrice: Number(sourceLine.unitPrice),
        warehouseId: sourceLine.warehouseId ?? purchase.warehouseId ?? undefined,
      };
    });

    const purchaseGross = sumMoney(
      purchase.inventoryItems.map((line) => Number(line.quantity) * Number(line.unitPrice)),
    );
    const purchaseTotal = Number(purchase.totalAmount);
    const commercialFactor = purchaseGross > 0 ? purchaseTotal / purchaseGross : 1;
    const returnGross = sumMoney(
      normalizedItems.map((line) => Number(line.quantity) * Number(line.unitPrice)),
    );
    const authoritativeReturnTotal = roundMoney(returnGross * commercialFactor);
    const submittedReturnTotal = roundMoney(
      dto.totalAmount ?? Math.max(
        sumMoney(dto.lines.map((line) => line.debit)),
        sumMoney(dto.lines.map((line) => line.credit)),
      ),
    );
    if (!Number.isFinite(submittedReturnTotal) || !moneyEquals(submittedReturnTotal, authoritativeReturnTotal)) {
      throw new BadRequestException(
        `Purchase Return total must be ${authoritativeReturnTotal} based on the source bill's item rates and net discount`,
      );
    }
    dto.subtotal = roundMoney(returnGross);
    dto.discountAmount = Math.max(0, sumMoney([returnGross, -authoritativeReturnTotal]));
    dto.totalAmount = authoritativeReturnTotal;

    const sourceLineage = await this.loadInventoryLineLineage(dto.workspaceId, [...sourceLinesById.keys()]);
    const sourceLineIdsByChainLineId = new Map<string, Set<string>>();
    for (const sourceLineId of sourceLinesById.keys()) {
      const path = this.inventorySourcePath(sourceLineId, sourceLineage);
      for (const chainLineId of path) {
        const sourceIds = sourceLineIdsByChainLineId.get(chainLineId) ?? new Set<string>();
        sourceIds.add(sourceLineId);
        sourceLineIdsByChainLineId.set(chainLineId, sourceIds);
      }
    }

    const chainLineIds = [...sourceLineIdsByChainLineId.keys()];
    const chainVoucherIds = [
      ...new Set(
        chainLineIds
          .map((lineId) => sourceLineage.get(lineId)?.voucherId)
          .filter((voucherId): voucherId is string => Boolean(voucherId)),
      ),
    ];
    const inactiveReturnStatuses = [
      VoucherEntryStatus.DRAFT,
      VoucherEntryStatus.REJECTED,
      VoucherEntryStatus.CANCELLED,
      VoucherEntryStatus.REVERSED,
      VoucherEntryStatus.SUPERSEDED_BY_ALTERATION,
    ];
    const earlierReturns = await this.prisma.voucherEntry.findMany({
      where: {
        workspaceId: dto.workspaceId,
        voucherType: VoucherEntryType.DEBIT_NOTE,
        id: existingId ? { not: existingId } : undefined,
        status: { notIn: inactiveReturnStatuses },
        OR: [
          { sourceVoucherId: { in: chainVoucherIds } },
          { inventoryItems: { some: { sourceInventoryLineId: { in: chainLineIds } } } },
        ],
      },
      select: {
        id: true,
        sourceVoucherId: true,
        inventoryItems: {
          select: {
            inventoryItemId: true,
            sourceInventoryLineId: true,
            itemName: true,
            quantity: true,
          },
        },
      },
    });

    const priorSourceLineIds = earlierReturns.flatMap((entry) =>
      entry.inventoryItems
        .map((line) => line.sourceInventoryLineId)
        .filter((lineId): lineId is string => Boolean(lineId)),
    );
    const priorLineage = await this.loadInventoryLineLineage(dto.workspaceId, priorSourceLineIds);
    priorLineage.forEach((line, lineId) => sourceLineage.set(lineId, line));

    const isSameInventoryItem = (
      left: { inventoryItemId: string | null; itemName: string },
      right: { inventoryItemId: string | null; itemName: string },
    ) =>
      left.inventoryItemId && right.inventoryItemId
        ? left.inventoryItemId === right.inventoryItemId
        : left.itemName.trim().toLowerCase() === right.itemName.trim().toLowerCase();
    const previouslyReturnedBySourceLine = new Map<string, number>();
    const ambiguousPriorQuantities = new Map<string, { sourceLineIds: string[]; quantity: number }>();

    for (const earlierReturn of earlierReturns) {
      for (const returnedLine of earlierReturn.inventoryItems) {
        const quantity = Number(returnedLine.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          continue;
        }

        let candidateSourceLineIds = new Set<string>();
        if (returnedLine.sourceInventoryLineId) {
          const priorPath = this.inventorySourcePath(returnedLine.sourceInventoryLineId, sourceLineage);
          for (const chainLineId of priorPath) {
            sourceLineIdsByChainLineId.get(chainLineId)?.forEach((sourceLineId) => candidateSourceLineIds.add(sourceLineId));
          }
        } else if (earlierReturn.sourceVoucherId && chainVoucherIds.includes(earlierReturn.sourceVoucherId)) {
          purchase.inventoryItems.forEach((line) => candidateSourceLineIds.add(line.id));
        }

        candidateSourceLineIds = new Set(
          [...candidateSourceLineIds].filter((sourceLineId) => {
            const sourceLine = sourceLinesById.get(sourceLineId);
            return Boolean(sourceLine && isSameInventoryItem(sourceLine, returnedLine));
          }),
        );
        if (candidateSourceLineIds.size === 0) {
          continue;
        }
        if (candidateSourceLineIds.size === 1) {
          const [sourceLineId] = candidateSourceLineIds;
          previouslyReturnedBySourceLine.set(
            sourceLineId,
            (previouslyReturnedBySourceLine.get(sourceLineId) ?? 0) + quantity,
          );
          continue;
        }

        // Legacy rows may point at a shared ancestor rather than the exact bill
        // line. Preserve safety without guessing: cap the whole candidate set.
        const sortedSourceLineIds = [...candidateSourceLineIds].sort();
        const constraintKey = sortedSourceLineIds.join("|");
        const existingConstraint = ambiguousPriorQuantities.get(constraintKey);
        ambiguousPriorQuantities.set(constraintKey, {
          sourceLineIds: sortedSourceLineIds,
          quantity: (existingConstraint?.quantity ?? 0) + quantity,
        });
      }
    }

    for (const [sourceLineId, currentQuantity] of currentQuantityBySourceLine) {
      const sourceLine = sourceLinesById.get(sourceLineId)!;
      const previouslyReturned = previouslyReturnedBySourceLine.get(sourceLineId) ?? 0;
      const remaining = Math.max(0, Number(sourceLine.quantity) - previouslyReturned);
      if (currentQuantity > remaining + 0.000001) {
        throw new BadRequestException(`${sourceLine.itemName}: maximum returnable quantity is ${remaining}`);
      }
    }

    for (const constraint of ambiguousPriorQuantities.values()) {
      const purchasedQuantity = constraint.sourceLineIds.reduce(
        (total, sourceLineId) => total + Number(sourceLinesById.get(sourceLineId)?.quantity ?? 0),
        0,
      );
      const unambiguousPriorQuantity = constraint.sourceLineIds.reduce(
        (total, sourceLineId) => total + (previouslyReturnedBySourceLine.get(sourceLineId) ?? 0),
        0,
      );
      const currentQuantity = constraint.sourceLineIds.reduce(
        (total, sourceLineId) => total + (currentQuantityBySourceLine.get(sourceLineId) ?? 0),
        0,
      );
      if (constraint.quantity + unambiguousPriorQuantity + currentQuantity > purchasedQuantity + 0.000001) {
        const sourceLine = sourceLinesById.get(constraint.sourceLineIds[0]);
        const remaining = Math.max(0, purchasedQuantity - constraint.quantity - unambiguousPriorQuantity);
        throw new BadRequestException(`${sourceLine?.itemName ?? "Item"}: maximum returnable quantity is ${remaining}`);
      }
    }

    dto.inventoryItems = normalizedItems;
    dto.reference = purchase.voucherNumber;

    // A purchase return physically sends stock out. Under the perpetual
    // inventory model its balancing credit must therefore reduce Inventory
    // Control; a free-text "Purchase Return" credit leaves the stock ledger
    // overstated even though the warehouse quantity was reduced. Rebuild the
    // journal from the verified source bill so callers cannot bypass this rule.
    const refundedNow = sumMoney(requestedRefundLines.map((line) => line.debit));
    if (refundedNow > authoritativeReturnTotal) {
      throw new BadRequestException(
        `Cash/Bank/MFS refund cannot exceed the Purchase Return total (${authoritativeReturnTotal})`,
      );
    }
    if (requestedSettlementMode !== "accounts-payable" && requestedRefundLines.length === 0) {
      throw new BadRequestException("Select at least one Cash, Bank, or MFS ledger for the Purchase Return refund");
    }
    const payableAdjustment = roundMoney(authoritativeReturnTotal - refundedNow);
    dto.paidAmount = refundedNow;
    dto.settlementMode = refundedNow > 0
      ? requestedRefundLines.every((line) => line.moneyAccountType === "CASH") ? "cash" : "bank"
      : "accounts-payable";
    dto.lines = [
      ...requestedRefundLines.map((line, index) => ({
        id: `purchase-return-refund-${index + 1}`,
        accountId: line.accountId,
        moneyAccountType: line.moneyAccountType,
        ledger: line.ledger,
        description: line.description || `Supplier refund against ${purchase.voucherNumber}`,
        debit: Number(line.debit),
        credit: 0,
        costCenter: line.costCenter,
        project: line.project,
        billReference: purchase.voucherNumber,
      })),
      ...(payableAdjustment > 0
        ? [{
            id: "purchase-return-payable-adjustment",
            ledger: purchase.partyName,
            description: `Supplier payable reduced against ${purchase.voucherNumber}`,
            debit: payableAdjustment,
            credit: 0,
            billReference: purchase.voucherNumber,
          }]
        : []),
      {
        id: "purchase-return-inventory",
        ledger: "Inventory Control",
        description: `Inventory returned against ${purchase.voucherNumber}`,
        debit: 0,
        credit: authoritativeReturnTotal,
        billReference: purchase.voucherNumber,
      },
    ];
  }

  private async loadInventoryLineLineage(workspaceId: string, seedLineIds: string[]) {
    const lineage = new Map<string, InventoryLineLineage>();
    let pendingLineIds = [...new Set(seedLineIds.filter(Boolean))];
    let depth = 0;

    while (pendingLineIds.length) {
      if (depth >= 64) {
        throw new BadRequestException("Inventory source chain is too deep or contains a cycle");
      }
      depth += 1;
      const rows = await this.prisma.voucherInventoryItem.findMany({
        where: { id: { in: pendingLineIds }, voucher: { workspaceId } },
        select: inventoryLineLineageSelect,
      });
      rows.forEach((line) => lineage.set(line.id, line));
      pendingLineIds = [
        ...new Set(
          rows
            .map((line) => line.sourceInventoryLineId)
            .filter((lineId): lineId is string => Boolean(lineId))
            .filter((lineId) => !lineage.has(lineId)),
        ),
      ];
    }

    return lineage;
  }

  private inventorySourcePath(startLineId: string, lineage: Map<string, InventoryLineLineage>) {
    const path: string[] = [];
    const visited = new Set<string>();
    let currentLineId: string | null = startLineId;

    while (currentLineId) {
      if (visited.has(currentLineId)) {
        throw new BadRequestException("Inventory source chain contains a cycle");
      }
      visited.add(currentLineId);
      const line = lineage.get(currentLineId);
      if (!line) {
        throw new BadRequestException("Inventory source line is missing or belongs to another workspace");
      }
      path.push(line.id);
      currentLineId = line.sourceInventoryLineId;
    }

    return path;
  }

  /**
   * Sales Returns are corrections to a real Sales Invoice, never standalone
   * vouchers. Rebuild all commercial and accounting values from the source
   * invoice so a client cannot change the sold rate, return an unrelated item,
   * or return the same quantity twice.
   */
  private async prepareSalesReturn(dto: CreateVoucherDto, existingId?: string) {
    const requestedSettlementMode = dto.settlementMode ?? "accounts-payable";
    const requestedRefundLines = dto.lines.filter(
      (line) => Boolean(line.accountId && line.moneyAccountType) && Number(line.credit) > 0 && Number(line.debit) === 0,
    );
    const sourceVoucherId = dto.sourceVoucherId?.trim();
    if (!sourceVoucherId) {
      throw new BadRequestException("Select the original sales invoice for this Sales Return");
    }

    const invoice = await this.prisma.voucherEntry.findFirst({
      where: { id: sourceVoucherId, workspaceId: dto.workspaceId },
      include: includedVoucherRelations,
    });
    if (
      !invoice ||
      invoice.voucherType !== VoucherEntryType.SALES ||
      Boolean(invoice.documentKind) ||
      invoice.status !== VoucherEntryStatus.POSTED
    ) {
      throw new BadRequestException("The selected source must be a posted Sales Invoice");
    }
    if (invoice.partyName.trim() !== dto.partyName.trim()) {
      throw new BadRequestException("Sales Return customer must match the original invoice customer");
    }
    if (new Date(dto.voucherDate).getTime() < invoice.voucherDate.getTime()) {
      throw new BadRequestException("Sales Return date cannot be earlier than the source Sales Invoice date");
    }
    if (!dto.inventoryItems?.length) {
      throw new BadRequestException("Add at least one returned invoice item");
    }

    const earlierReturns = await this.prisma.voucherEntry.findMany({
      where: {
        workspaceId: dto.workspaceId,
        voucherType: VoucherEntryType.CREDIT_NOTE,
        sourceVoucherId,
        id: existingId ? { not: existingId } : undefined,
        status: {
          notIn: [
            VoucherEntryStatus.DRAFT,
            VoucherEntryStatus.REJECTED,
            VoucherEntryStatus.CANCELLED,
            VoucherEntryStatus.REVERSED,
            VoucherEntryStatus.SUPERSEDED_BY_ALTERATION,
          ],
        },
      },
      include: includedVoucherRelations,
    });
    const buildReturnGroupKey = (inventoryItemId: string | null, itemName: string, warehouseId: string | null) =>
      `${inventoryItemId ? `item:${inventoryItemId}` : `name:${itemName.trim().toLowerCase()}`}::warehouse:${warehouseId ?? ""}`;
    const sourceLinesById = new Map(invoice.inventoryItems.map((line) => [line.id, line]));
    const soldByGroup = new Map<string, number>();
    for (const line of invoice.inventoryItems) {
      const key = buildReturnGroupKey(line.inventoryItemId, line.itemName, line.warehouseId ?? invoice.warehouseId);
      soldByGroup.set(key, (soldByGroup.get(key) ?? 0) + Number(line.quantity));
    }

    // Keep both constraints. Exact-line totals protect the original issue-cost
    // link; group totals also make old return rows without a source-line link
    // safe without guessing which same-item invoice line they belonged to.
    const previouslyReturnedByLine = new Map<string, number>();
    const previouslyReturnedByGroup = new Map<string, number>();
    earlierReturns.forEach((entry) => {
      entry.inventoryItems.forEach((item) => {
        const quantity = Number(item.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) return;
        const sourceLine = item.sourceInventoryLineId
          ? sourceLinesById.get(item.sourceInventoryLineId)
          : undefined;
        if (sourceLine) {
          previouslyReturnedByLine.set(
            sourceLine.id,
            (previouslyReturnedByLine.get(sourceLine.id) ?? 0) + quantity,
          );
        }
        const key = sourceLine
          ? buildReturnGroupKey(
              sourceLine.inventoryItemId,
              sourceLine.itemName,
              sourceLine.warehouseId ?? invoice.warehouseId,
            )
          : buildReturnGroupKey(item.inventoryItemId, item.itemName, item.warehouseId ?? entry.warehouseId);
        previouslyReturnedByGroup.set(key, (previouslyReturnedByGroup.get(key) ?? 0) + quantity);
      });
    });

    const quantitiesByLineInThisReturn = new Map<string, number>();
    const quantitiesByGroupInThisReturn = new Map<string, number>();
    const normalizedItems = dto.inventoryItems.map((requested) => {
      const sourceInventoryLineId = requested.sourceInventoryLineId?.trim();
      if (!sourceInventoryLineId) {
        throw new BadRequestException(`${requested.itemName}: select the original Sales Invoice line`);
      }
      const sold = sourceLinesById.get(sourceInventoryLineId);
      if (!sold) {
        throw new BadRequestException(
          `${requested.itemName}: source stock line does not belong to Sales Invoice ${invoice.voucherNumber}`,
        );
      }
      if (sold.itemName.trim().toLowerCase() !== requested.itemName.trim().toLowerCase()) {
        throw new BadRequestException(
          `${requested.itemName}: source stock line belongs to ${sold.itemName}, not this item`,
        );
      }

      const quantity = Number(requested.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new BadRequestException(`${sold.itemName}: return quantity must be greater than zero`);
      }

      const sourceLotId = sold.manufacturingInventoryLotId;
      const requestedLotId = requested.manufacturingInventoryLotId?.trim() || null;
      const soldManufacturingSerialIds = sold.manufacturingSerialIds ?? [];
      const manufacturingSerialIds = [
        ...new Set((requested.manufacturingSerialIds ?? []).map((serialId) => serialId.trim()).filter(Boolean)),
      ];
      if (!sourceLotId && (requestedLotId || manufacturingSerialIds.length)) {
        throw new BadRequestException(`${sold.itemName}: manufacturing lot/serial provenance does not belong to the source sale line`);
      }
      if (sourceLotId && requestedLotId && requestedLotId !== sourceLotId) {
        throw new BadRequestException(`${sold.itemName}: return must use the exact manufacturing lot from the source sale line`);
      }
      if (soldManufacturingSerialIds.length) {
        if (!Number.isInteger(quantity) || manufacturingSerialIds.length !== quantity) {
          throw new BadRequestException(`${sold.itemName}: select exactly ${quantity} source serial number(s) for this return`);
        }
        const soldSerialIds = new Set(soldManufacturingSerialIds);
        if (manufacturingSerialIds.some((serialId) => !soldSerialIds.has(serialId))) {
          throw new BadRequestException(`${sold.itemName}: return serials must come from the selected source sale line`);
        }
      } else if (manufacturingSerialIds.length) {
        throw new BadRequestException(`${sold.itemName}: the source sale line has no serial provenance`);
      }

      const lineQuantityThisReturn = (quantitiesByLineInThisReturn.get(sold.id) ?? 0) + quantity;
      const lineRemaining = Math.max(0, Number(sold.quantity) - (previouslyReturnedByLine.get(sold.id) ?? 0));
      if (lineQuantityThisReturn > lineRemaining + 0.000001) {
        throw new BadRequestException(`${sold.itemName}: maximum returnable quantity for this invoice line is ${lineRemaining}`);
      }
      quantitiesByLineInThisReturn.set(sold.id, lineQuantityThisReturn);

      const warehouseId = sold.warehouseId ?? invoice.warehouseId;
      const groupKey = buildReturnGroupKey(sold.inventoryItemId, sold.itemName, warehouseId);
      const groupQuantityThisReturn = (quantitiesByGroupInThisReturn.get(groupKey) ?? 0) + quantity;
      const groupRemaining = Math.max(
        0,
        (soldByGroup.get(groupKey) ?? 0) - (previouslyReturnedByGroup.get(groupKey) ?? 0),
      );
      if (groupQuantityThisReturn > groupRemaining + 0.000001) {
        throw new BadRequestException(`${sold.itemName}: maximum returnable quantity is ${groupRemaining}`);
      }
      quantitiesByGroupInThisReturn.set(groupKey, groupQuantityThisReturn);

      return {
        id: sold.inventoryItemId ?? sold.id,
        sourceInventoryLineId: sold.id,
        manufacturingInventoryLotId: sourceLotId ?? undefined,
        manufacturingSerialIds,
        itemName: sold.itemName,
        quantity,
        unitPrice: Number(sold.unitPrice),
        warehouseId: warehouseId ?? undefined,
      };
    });

    const invoiceGross = sumMoney(
      invoice.inventoryItems.map((item) => Number(item.quantity) * Number(item.unitPrice)),
    );
    const returnGross = sumMoney(
      normalizedItems.map((item) => item.quantity * item.unitPrice),
    );
    const invoiceTotal = Number(invoice.totalAmount);
    const commercialFactor = invoiceGross > 0 ? invoiceTotal / invoiceGross : 1;
    const returnAmount = roundMoney(returnGross * commercialFactor);
    const discountShare = Math.max(0, sumMoney([returnGross, -returnAmount]));
    dto.inventoryItems = normalizedItems.map((item) => ({
      id: item.id,
      sourceInventoryLineId: item.sourceInventoryLineId,
      manufacturingInventoryLotId: item.manufacturingInventoryLotId,
      manufacturingSerialIds: item.manufacturingSerialIds,
      itemName: item.itemName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      warehouseId: item.warehouseId,
    }));
    dto.reference = invoice.voucherNumber;
    dto.subtotal = roundMoney(returnGross);
    dto.discountAmount = discountShare;
    dto.totalAmount = returnAmount;
    const refundNow = requestedSettlementMode !== "accounts-payable";
    if (refundNow) {
      const refundTotal = sumMoney(requestedRefundLines.map((line) => line.credit));
      if (!requestedRefundLines.length || !moneyEquals(refundTotal, returnAmount)) {
        throw new BadRequestException(`Cash/Bank/MFS refund total must equal the Sales Return total (${returnAmount})`);
      }
      const customerReceipts = await this.prisma.voucherEntry.findMany({
        where: {
          workspaceId: dto.workspaceId,
          voucherType: VoucherEntryType.RECEIPT,
          sourceVoucherId,
          status: VoucherEntryStatus.POSTED,
        },
        select: { totalAmount: true },
      });
      // Cash/Bank/MFS collected directly on a Sales Invoice is represented by
      // debit money-ledger lines. Older/imported invoices can have those valid
      // postings while paidAmount is still zero, so paidAmount alone is not a
      // reliable refund ceiling. Use the larger of the invoice summary and its
      // actual inline money postings to avoid both false zeroes and double count.
      const inlineCollectedAmount = sumMoney(invoice.lines.map((line) => {
        // moneyAccountType is a request-time validation hint and is not stored
        // on VoucherEntryLine. Sales Invoice creation stamps every inline money
        // debit as a customer collection, which is therefore the durable marker.
        if (!line.accountId || !line.description?.toLowerCase().includes("customer collection")) return 0;
        return Math.max(0, sumMoney([line.debit, new Prisma.Decimal(line.credit || 0).negated()]));
      }));
      // A converted Sales Invoice can inherit an advance collected on its
      // Sales Order through the Delivery Note. That money is deliberately not
      // posted again on the invoice, so the invoice's own paidAmount/lines may
      // be zero even though the document chain is fully paid. Walk the parent
      // chain and take the maximum carried amount (never the sum, because the
      // same advance is copied forward at each conversion).
      let inheritedCollectedAmount = 0;
      let parentVoucherId = invoice.sourceVoucherId;
      const visitedSourceIds = new Set<string>();
      while (parentVoucherId && !visitedSourceIds.has(parentVoucherId)) {
        visitedSourceIds.add(parentVoucherId);
        const parent = await this.prisma.voucherEntry.findFirst({
          where: {
            id: parentVoucherId,
            workspaceId: dto.workspaceId,
            partyName: invoice.partyName,
            voucherType: VoucherEntryType.SALES,
          },
          select: { paidAmount: true, sourceVoucherId: true },
        });
        if (!parent) break;
        inheritedCollectedAmount = Math.max(inheritedCollectedAmount, roundMoney(parent.paidAmount));
        parentVoucherId = parent.sourceVoucherId;
      }
      const invoiceCollectedAmount = roundMoney(Math.max(
        roundMoney(invoice.paidAmount),
        inlineCollectedAmount,
        inheritedCollectedAmount,
      ));
      const collectedAmount = roundMoney(invoiceCollectedAmount + sumMoney(
        customerReceipts.map((receipt) => receipt.totalAmount),
      ));
      const previouslyRefunded = sumMoney(earlierReturns
        .filter((entry) => entry.settlementMode !== SettlementMode.ACCOUNTS_PAYABLE)
        .map((entry) => entry.totalAmount));
      const refundableAmount = roundMoney(Math.max(0, collectedAmount - previouslyRefunded));
      if (returnAmount > refundableAmount) {
        throw new BadRequestException(
          `Cash/Bank/MFS refund cannot exceed the collected amount still available (${refundableAmount})`,
        );
      }
    }

    dto.settlementMode = refundNow
      ? requestedRefundLines.every((line) => line.moneyAccountType === "CASH") ? "cash" : "bank"
      : "accounts-payable";
    dto.paidAmount = refundNow ? returnAmount : 0;
    dto.lines = [
      { id: "sales-return", ledger: "Sales Return", description: `Sales return against ${invoice.voucherNumber}`, debit: returnAmount, credit: 0, billReference: invoice.voucherNumber },
      ...(refundNow
        ? requestedRefundLines.map((line, index) => ({
            id: `sales-return-refund-${index + 1}`,
            accountId: line.accountId,
            moneyAccountType: line.moneyAccountType,
            ledger: line.ledger,
            description: line.description || `Refund against ${invoice.voucherNumber}`,
            debit: 0,
            credit: Number(line.credit),
            costCenter: line.costCenter,
            project: line.project,
            billReference: invoice.voucherNumber,
          }))
        : [{ id: "reduce-receivable", ledger: invoice.partyName, description: `Receivable reduced against ${invoice.voucherNumber}`, debit: 0, credit: returnAmount, billReference: invoice.voucherNumber }]),
    ];
  }

  /** Protects Accounts Receivable even when a caller bypasses the web form. */
  private async validateCustomerReceipt(dto: CreateVoucherDto, existingId?: string) {
    const partyKey = dto.partyName.trim().toLowerCase();
    const allocations = dto.lines.filter((line) => Number(line.credit || 0) > 0 && Boolean(line.billReference?.trim()) && !line.moneyAccountType);
    if (!allocations.length) return; // An unapplied amount is a valid customer advance.

    for (const allocation of allocations) {
      const reference = allocation.billReference!.trim();
      const invoice = await this.prisma.voucherEntry.findFirst({
        where: {
          workspaceId: dto.workspaceId,
          voucherType: VoucherEntryType.SALES,
          status: VoucherEntryStatus.POSTED,
          OR: [{ voucherNumber: reference }, { reference }],
        },
        select: { id: true, voucherNumber: true, reference: true, partyName: true, totalAmount: true, paidAmount: true },
      });
      if (!invoice || invoice.partyName.trim().toLowerCase() !== partyKey) {
        throw new BadRequestException(`${reference}: select an outstanding Sales Invoice for this customer`);
      }
      const references = [invoice.voucherNumber, invoice.reference].filter((value): value is string => Boolean(value?.trim()));
      const priorReceipts = await this.prisma.voucherEntry.findMany({
        where: {
          workspaceId: dto.workspaceId,
          voucherType: VoucherEntryType.RECEIPT,
          status: VoucherEntryStatus.POSTED,
          id: existingId ? { not: existingId } : undefined,
          lines: { some: { billReference: { in: references } } },
        },
        include: { lines: true },
      });
      const previouslyReceived = sumMoney(priorReceipts.flatMap((receipt) => receipt.lines
        .filter((line) => Number(line.credit || 0) > 0 && references.includes(line.billReference ?? ""))
        .map((line) => line.credit)));
      const salesReturns = await this.prisma.voucherEntry.findMany({
        where: { workspaceId: dto.workspaceId, voucherType: VoucherEntryType.CREDIT_NOTE, status: VoucherEntryStatus.POSTED, sourceVoucherId: invoice.id },
        select: { totalAmount: true },
      });
      const returned = sumMoney(salesReturns.map((entry) => entry.totalAmount));
      const available = roundMoney(Math.max(0, roundMoney(invoice.totalAmount) - roundMoney(invoice.paidAmount) - previouslyReceived - returned));
      const applyingNow = sumMoney(allocations
        .filter((line) => references.includes(line.billReference?.trim() ?? ""))
        .map((line) => line.credit));
      if (applyingNow > available) {
        throw new BadRequestException(`${reference}: receipt cannot exceed the outstanding invoice balance (${available})`);
      }
    }
  }

  /**
   * A Delivery Note can never ship more of an item than its Sale Order actually
   * ordered — goods physically can't leave the warehouse against stock nobody
   * asked for. Sums this delivery note's quantities against every other
   * (non-cancelled) delivery note already raised against the same order, per
   * item name, and rejects the save the moment any item's running total would
   * exceed what the order itself has for that item. If more genuinely needs to
   * go out, the fix is to update the Sale Order first, not to let the delivery
   * quietly exceed it.
   */
  private async assertDeliveryNoteAgainstSaleOrder(
    dto: CreateVoucherDto,
    inventoryItems: Array<{ inventoryItemId: string | null; sourceInventoryLineId: string | null; itemName: string; quantity: number; unitPrice: number }>,
    excludeVoucherId?: string,
    existingSourceVoucherId?: string | null,
  ) {
    const workspaceId = dto.workspaceId;
    const sourceVoucherId = dto.sourceVoucherId?.trim();
    if (!sourceVoucherId) {
      throw new BadRequestException("A Delivery Challan must be created from a Sale Order");
    }
    if (!inventoryItems.length) {
      throw new BadRequestException("A Delivery Challan must contain at least one Sale Order item");
    }

    const sourceOrder = await this.prisma.voucherEntry.findUnique({
      where: { id: sourceVoucherId },
      include: { inventoryItems: true },
    });

    // A missing/foreign source order isn't this check's problem to raise — the
    // sourceVoucherId FK constraint (or its absence) governs that separately.
    if (!sourceOrder || sourceOrder.workspaceId !== workspaceId) {
      throw new BadRequestException("The source Sale Order was not found in this workspace");
    }
    if (this.canonicalDocumentKind(sourceOrder.voucherType, sourceOrder.documentKind) !== "sale-order") {
      throw new BadRequestException("A Delivery Challan can only be created from a Sale Order");
    }
    if (sourceVoucherId !== existingSourceVoucherId && sourceOrder.status !== VoucherEntryStatus.POSTED) {
      throw new BadRequestException(`Sale Order ${sourceOrder.voucherNumber} must be posted before creating a Delivery Note`);
    }
    if (sourceOrder.partyName.trim().toLowerCase() !== dto.partyName.trim().toLowerCase()) {
      throw new BadRequestException(`Customer must match Sale Order ${sourceOrder.voucherNumber}`);
    }
    if (new Date(dto.voucherDate).getTime() < sourceOrder.voucherDate.getTime()) {
      throw new BadRequestException(`Delivery date cannot be before Sale Order ${sourceOrder.voucherNumber}`);
    }

    const sourceLinesById = new Map(sourceOrder.inventoryItems.map((line) => [line.id, line]));

    const otherDeliveryNotes = await this.prisma.voucherEntry.findMany({
      where: {
        workspaceId,
        documentKind: "delivery-note",
        sourceVoucherId,
        status: {
          notIn: [
            VoucherEntryStatus.REJECTED,
            VoucherEntryStatus.CANCELLED,
            VoucherEntryStatus.REVERSED,
            VoucherEntryStatus.SUPERSEDED_BY_ALTERATION,
          ],
        },
        id: excludeVoucherId ? { not: excludeVoucherId } : undefined,
      },
      include: { inventoryItems: true },
    });

    const alreadyDeliveredByLine = new Map<string, number>();
    for (const note of otherDeliveryNotes) {
      for (const item of note.inventoryItems) {
        if (!item.sourceInventoryLineId) continue;
        alreadyDeliveredByLine.set(item.sourceInventoryLineId, (alreadyDeliveredByLine.get(item.sourceInventoryLineId) ?? 0) + Number(item.quantity || 0));
      }
    }

    for (const item of inventoryItems) {
      if (!item.sourceInventoryLineId) {
        throw new BadRequestException(`${item.itemName}: select the exact Sale Order line`);
      }
      const sourceLine = sourceLinesById.get(item.sourceInventoryLineId);
      if (!sourceLine) {
        throw new BadRequestException(`${item.itemName}: this line does not belong to Sale Order ${sourceOrder.voucherNumber}`);
      }
      if (item.inventoryItemId && sourceLine.inventoryItemId && item.inventoryItemId !== sourceLine.inventoryItemId) {
        throw new BadRequestException(`${item.itemName}: product must match Sale Order ${sourceOrder.voucherNumber}`);
      }
      if (item.itemName.trim().toLowerCase() !== sourceLine.itemName.trim().toLowerCase()) {
        throw new BadRequestException(`${item.itemName}: product must match its Sale Order line`);
      }
      if (!moneyEquals(item.unitPrice, sourceLine.unitPrice)) {
        throw new BadRequestException(`${item.itemName}: price must match Sale Order ${sourceOrder.voucherNumber}`);
      }
      const ordered = Number(sourceLine.quantity || 0);
      const alreadyDelivered = alreadyDeliveredByLine.get(sourceLine.id) ?? 0;
      const remaining = Math.max(0, ordered - alreadyDelivered);

      if (item.quantity > remaining) {
        throw new BadRequestException(
          `"${item.itemName}" exceeds Sale Order ${sourceOrder.voucherNumber}: only ${remaining} more can be delivered ` +
            `(${alreadyDelivered} of ${ordered} already delivered). Update the Sale Order first if more needs to go out.`,
        );
      }
    }
  }

  /**
   * Purchase Orders support partial receipts. Reserve quantities held by every
   * still-active Receipt Note (including drafts/pending rows) so two concurrent
   * notes cannot later post more than the ordered quantity. Stable source line
   * ids keep repeated products on separate PO rows unambiguous.
   */
  private async assertReceiptNoteAgainstPurchaseOrder(
    dto: CreateVoucherDto,
    inventoryItems: Array<{ inventoryItemId: string | null; sourceInventoryLineId: string | null; itemName: string; quantity: number; unitPrice: number }>,
    excludeVoucherId?: string,
    existingSourceVoucherId?: string | null,
  ) {
    const sourceVoucherId = dto.sourceVoucherId?.trim();
    if (!sourceVoucherId) {
      throw new BadRequestException("A Receipt Note must be created from a Purchase Order");
    }
    if (!inventoryItems.length) {
      throw new BadRequestException("A Receipt Note must contain at least one Purchase Order item");
    }

    const sourceOrder = await this.prisma.voucherEntry.findUnique({
      where: { id: sourceVoucherId },
      include: { inventoryItems: true },
    });
    if (!sourceOrder || sourceOrder.workspaceId !== dto.workspaceId) {
      throw new BadRequestException("The source Purchase Order was not found in this workspace");
    }
    if (this.canonicalDocumentKind(sourceOrder.voucherType, sourceOrder.documentKind) !== "purchase-order") {
      throw new BadRequestException("A Receipt Note can only be created from a Purchase Order");
    }
    if (sourceVoucherId !== existingSourceVoucherId && sourceOrder.status !== VoucherEntryStatus.POSTED) {
      throw new BadRequestException(`Purchase Order ${sourceOrder.voucherNumber} must be posted before creating a Receipt Note`);
    }
    if (sourceOrder.partyName.trim().toLowerCase() !== dto.partyName.trim().toLowerCase()) {
      throw new BadRequestException(`Supplier must match Purchase Order ${sourceOrder.voucherNumber}`);
    }
    if (new Date(dto.voucherDate).getTime() < sourceOrder.voucherDate.getTime()) {
      throw new BadRequestException(`Receipt date cannot be before Purchase Order ${sourceOrder.voucherNumber}`);
    }

    const sourceLinesById = new Map(sourceOrder.inventoryItems.map((line) => [line.id, line]));
    const otherReceiptNotes = await this.prisma.voucherEntry.findMany({
      where: {
        workspaceId: dto.workspaceId,
        sourceVoucherId,
        status: {
          notIn: [
            VoucherEntryStatus.REJECTED,
            VoucherEntryStatus.CANCELLED,
            VoucherEntryStatus.REVERSED,
            VoucherEntryStatus.SUPERSEDED_BY_ALTERATION,
          ],
        },
        OR: [
          { voucherType: VoucherEntryType.PURCHASE, documentKind: "receipt-note" },
          { voucherType: VoucherEntryType.RECEIPT_NOTE },
        ],
        id: excludeVoucherId ? { not: excludeVoucherId } : undefined,
      },
      include: { inventoryItems: true },
    });

    const alreadyReceivedByLine = new Map<string, number>();
    for (const note of otherReceiptNotes) {
      for (const item of note.inventoryItems) {
        if (!item.sourceInventoryLineId) continue;
        alreadyReceivedByLine.set(
          item.sourceInventoryLineId,
          (alreadyReceivedByLine.get(item.sourceInventoryLineId) ?? 0) + Number(item.quantity || 0),
        );
      }
    }

    const requestedByLine = new Map<string, number>();
    for (const item of inventoryItems) {
      if (!item.sourceInventoryLineId) {
        throw new BadRequestException(`${item.itemName}: select the exact Purchase Order line`);
      }
      const sourceLine = sourceLinesById.get(item.sourceInventoryLineId);
      if (!sourceLine) {
        throw new BadRequestException(`${item.itemName}: this line does not belong to Purchase Order ${sourceOrder.voucherNumber}`);
      }
      if (item.inventoryItemId && sourceLine.inventoryItemId && item.inventoryItemId !== sourceLine.inventoryItemId) {
        throw new BadRequestException(`${item.itemName}: product must match Purchase Order ${sourceOrder.voucherNumber}`);
      }
      if (item.itemName.trim().toLowerCase() !== sourceLine.itemName.trim().toLowerCase()) {
        throw new BadRequestException(`${item.itemName}: product must match its Purchase Order line`);
      }
      if (!moneyEquals(item.unitPrice, sourceLine.unitPrice)) {
        throw new BadRequestException(`${item.itemName}: price must match Purchase Order ${sourceOrder.voucherNumber}`);
      }
      requestedByLine.set(
        sourceLine.id,
        (requestedByLine.get(sourceLine.id) ?? 0) + Number(item.quantity || 0),
      );
    }

    for (const [sourceLineId, requested] of requestedByLine) {
      const sourceLine = sourceLinesById.get(sourceLineId)!;
      const ordered = Number(sourceLine.quantity || 0);
      const alreadyReceived = alreadyReceivedByLine.get(sourceLineId) ?? 0;
      const remaining = Math.max(0, ordered - alreadyReceived);
      if (requested > remaining) {
        throw new BadRequestException(
          `"${sourceLine.itemName}" exceeds Purchase Order ${sourceOrder.voucherNumber}: only ${remaining} more can be received ` +
            `(${alreadyReceived} of ${ordered} already received). Create another Purchase Order if more is required.`,
        );
      }
    }
  }

  /**
   * Document numbers are unique per workspace, so a clash has to come back as a
   * usable message rather than an "Internal server error" the user can't act on.
   */
  private async writeVoucherEntry(
    existing: { id: string; voucherNumber: string } | undefined,
    payload: Omit<Prisma.VoucherEntryUncheckedCreateInput, "id">,
    dto: CreateVoucherDto,
    inventoryItems: Prisma.VoucherInventoryItemUncheckedCreateWithoutVoucherInput[],
  ) {
    try {
      return await this.createOrUpdateVoucherEntry(existing, payload, dto, inventoryItems);
    } catch (error) {
      if (isUniqueIdempotencyKeyError(error) && dto.idempotencyKey) {
        const duplicate = await this.prisma.voucherEntry.findUnique({
          where: { workspaceId_idempotencyKey: { workspaceId: dto.workspaceId, idempotencyKey: dto.idempotencyKey.trim() } },
          include: includedVoucherRelations,
        });
        if (duplicate) return duplicate;
      }
      if (isUniqueVoucherNumberError(error)) {
        throw new ConflictException(`Voucher number ${payload.voucherNumber} is already used in this workspace. Use a different number.`);
      }

      throw error;
    }
  }

  private async createOrUpdateVoucherEntry(
    existing: { id: string; voucherNumber: string } | undefined,
    payload: Omit<Prisma.VoucherEntryUncheckedCreateInput, "id">,
    dto: CreateVoucherDto,
    inventoryItems: Prisma.VoucherInventoryItemUncheckedCreateWithoutVoucherInput[],
  ) {
    // createdByUserId must never move to whoever happens to be editing the
    // voucher — the Users & Roles "Limited" (own-records-only) permission
    // depends on this staying the original creator for the record's whole
    // lifetime, not just at creation.
    const {
      createdByUserId: _createdByUserId,
      workflowOrigin: _workflowOrigin,
      ...updatePayload
    } = payload;
    void _createdByUserId;
    void _workflowOrigin;

    return existing
      ? await this.prisma.voucherEntry.update({
          where: { id: existing.id },
          data: {
            ...updatePayload,
            lines: {
              deleteMany: {},
              create: dto.lines.map((line) => ({
                accountId: line.accountId?.trim() || null,
                ledger: line.ledger.trim(),
                description: line.description?.trim() || null,
                debit: roundMoney(line.debit || 0),
                credit: roundMoney(line.credit || 0),
                costCenter: line.costCenter?.trim() || null,
                project: line.project?.trim() || null,
                billReference: line.billReference?.trim() || null,
              })),
            },
            inventoryItems: {
              deleteMany: {},
              create: inventoryItems,
            },
          },
          include: includedVoucherRelations,
        })
      : await this.prisma.voucherEntry.create({
          data: {
            ...payload,
            lines: {
              create: dto.lines.map((line) => ({
                accountId: line.accountId?.trim() || null,
                ledger: line.ledger.trim(),
                description: line.description?.trim() || null,
                debit: roundMoney(line.debit || 0),
                credit: roundMoney(line.credit || 0),
                costCenter: line.costCenter?.trim() || null,
                project: line.project?.trim() || null,
                billReference: line.billReference?.trim() || null,
              })),
            },
            inventoryItems: inventoryItems.length
              ? {
                  create: inventoryItems,
                }
              : undefined,
          },
          include: includedVoucherRelations,
        });
  }
}

function isUniqueVoucherNumberError(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as { code?: unknown; meta?: { target?: unknown } };
  if (candidate.code !== "P2002") {
    return false;
  }

  const target = candidate.meta?.target;
  return Array.isArray(target) ? target.includes("voucherNumber") : String(target ?? "").includes("voucherNumber");
}

function isUniqueIdempotencyKeyError(error: unknown) {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { code?: unknown; meta?: { target?: unknown } };
  if (candidate.code !== "P2002") return false;
  const target = candidate.meta?.target;
  return Array.isArray(target) ? target.includes("idempotencyKey") : String(target ?? "").includes("idempotencyKey");
}
