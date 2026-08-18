import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@bizovix/database";
import type { PaginationMeta } from "@bizovix/types";
import { buildPaginationMeta } from "@bizovix/utils";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectLifecycleGuardService } from "../prisma/project-lifecycle-guard.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { NumberingService } from "../settings-numbering/numbering.service";
import { PurchaseRequisitionsService } from "../purchase-requisitions/purchase-requisitions.service";
import { SaveRfqDto } from "./dto/save-rfq.dto";
import { QueryRfqDto } from "./dto/query-rfq.dto";

const ELIGIBLE_SUPPLIER_ROLES = ["VENDOR", "SUPPLIER", "SERVICE_PROVIDER", "OTHER"] as const;

const includeRelations = {
  purchaseRequisition: { select: { id: true, prNo: true } },
  cmsWork: { select: { id: true, workName: true } },
  suppliers: { include: { supplier: { select: { id: true, code: true, name: true } } } },
  items: { include: { item: { select: { id: true, itemCode: true, itemName: true } } }, orderBy: { createdAt: "asc" } },
  quotations: { where: { status: "RECEIVED" as const }, select: { id: true, supplierId: true } },
  comparativeStatement: { select: { id: true, csNo: true, status: true } },
} satisfies Prisma.RequestForQuotationInclude;

type RfqRecord = Prisma.RequestForQuotationGetPayload<{ include: typeof includeRelations }>;

function toDto(record: RfqRecord) {
  return {
    ...record,
    items: record.items.map((item) => ({ ...item, requestedQty: item.requestedQty.toFixed(3) })),
    respondedSupplierIds: [...new Set(record.quotations.map((quotation) => quotation.supplierId))],
  };
}

@Injectable()
export class RfqsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly numbering: NumberingService,
    private readonly lifecycle: ProjectLifecycleGuardService,
    private readonly purchaseRequisitions: PurchaseRequisitionsService,
  ) {}

  private where(organizationId: string, query: QueryRfqDto): Prisma.RequestForQuotationWhereInput {
    return {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.purchaseRequisitionId ? { purchaseRequisitionId: query.purchaseRequisitionId } : {}),
      ...(query.search ? { rfqNo: { contains: query.search, mode: "insensitive" } } : {}),
    };
  }

  async findAll(organizationId: string, query: QueryRfqDto): Promise<{ items: ReturnType<typeof toDto>[]; meta: PaginationMeta }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const where = this.where(organizationId, query);

    const [items, total] = await Promise.all([
      this.prisma.requestForQuotation.findMany({ where, include: includeRelations, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
      this.prisma.requestForQuotation.count({ where }),
    ]);

    return { items: items.map(toDto), meta: buildPaginationMeta(total, page, limit) };
  }

  async stats(organizationId: string) {
    const [total, open, closed, awarded] = await Promise.all([
      this.prisma.requestForQuotation.count({ where: { organizationId } }),
      this.prisma.requestForQuotation.count({ where: { organizationId, status: "ISSUED" } }),
      this.prisma.requestForQuotation.count({ where: { organizationId, status: "CLOSED" } }),
      this.prisma.requestForQuotation.count({ where: { organizationId, status: "AWARDED" } }),
    ]);
    return { total, open, closed, awarded };
  }

  async findOne(organizationId: string, id: string) {
    const record = await this.prisma.requestForQuotation.findFirst({ where: { id, organizationId }, include: includeRelations });
    if (!record) throw new NotFoundException("RFQ not found");
    return toDto(record);
  }

  private async assertSuppliersEligible(organizationId: string, supplierIds: string[]) {
    const suppliers = await this.prisma.party.findMany({ where: { id: { in: supplierIds }, organizationId } });
    const byId = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
    for (const supplierId of supplierIds) {
      const supplier = byId.get(supplierId);
      if (!supplier) throw new NotFoundException("One or more invited suppliers were not found in this organization");
      if (!supplier.roles.some((role) => ELIGIBLE_SUPPLIER_ROLES.includes(role as (typeof ELIGIBLE_SUPPLIER_ROLES)[number]))) {
        throw new BadRequestException(`"${supplier.name}" does not carry a Vendor/Supplier/Service Provider role and cannot be invited to an RFQ`);
      }
      if (supplier.status !== "ACTIVE") {
        throw new BadRequestException(`"${supplier.name}" is ${supplier.status.toLowerCase()} and cannot be newly invited to an RFQ`);
      }
    }
  }

  async create(organizationId: string, userId: string, dto: SaveRfqDto) {
    let purchaseRequisition: { id: string; cmsWorkId: string | null } | null = null;
    if (dto.purchaseRequisitionId) {
      const pr = await this.prisma.purchaseRequisition.findFirst({ where: { id: dto.purchaseRequisitionId, organizationId }, include: { items: true } });
      if (!pr) throw new NotFoundException("Purchase Requisition not found");
      if (pr.status !== "APPROVED") throw new BadRequestException("Only an Approved purchase requisition can proceed to RFQ");
      purchaseRequisition = pr;
    }

    if (!dto.items?.length && !purchaseRequisition) throw new BadRequestException("Provide at least one item, or link an approved Purchase Requisition");

    const cmsWorkId = dto.cmsWorkId ?? purchaseRequisition?.cmsWorkId ?? undefined;
    if (cmsWorkId) await this.lifecycle.assertOperationalMutationAllowed(organizationId, cmsWorkId, "creating an RFQ");

    await this.assertSuppliersEligible(organizationId, [...new Set(dto.supplierIds)]);

    let sourceItems: Array<{ itemId: string; purchaseRequisitionItemId?: string; requestedQty: number; remarks?: string }>;
    if (dto.items?.length) {
      sourceItems = dto.items;
      if (purchaseRequisition) {
        const validPrItemIds = new Set(purchaseRequisition ? (await this.prisma.purchaseRequisitionItem.findMany({ where: { purchaseRequisitionId: purchaseRequisition.id }, select: { id: true } })).map((row) => row.id) : []);
        for (const item of sourceItems) if (item.purchaseRequisitionItemId && !validPrItemIds.has(item.purchaseRequisitionItemId)) throw new BadRequestException("RFQ item references a PR item that does not belong to the linked Purchase Requisition");
      }
    } else {
      const prItems = await this.prisma.purchaseRequisitionItem.findMany({ where: { purchaseRequisitionId: purchaseRequisition!.id } });
      sourceItems = prItems.map((item) => ({ itemId: item.itemId, purchaseRequisitionItemId: item.id, requestedQty: item.requestedQty.toNumber(), remarks: item.remarks ?? undefined }));
    }

    const itemMasters = await this.prisma.item.findMany({ where: { id: { in: [...new Set(sourceItems.map((item) => item.itemId))] }, organizationId }, include: { uom: true } });
    const itemsById = new Map(itemMasters.map((item) => [item.id, item]));
    for (const item of sourceItems) if (!itemsById.has(item.itemId)) throw new NotFoundException("One or more items were not found in this organization");

    let rfqNo = dto.rfqNo?.trim();
    if (rfqNo) {
      const clash = await this.prisma.requestForQuotation.findFirst({ where: { organizationId, rfqNo } });
      if (clash) throw new BadRequestException(`RFQ number "${rfqNo}" is already in use`);
    } else {
      rfqNo = await this.numbering.next(organizationId, "RFQ");
    }

    const record = await this.prisma.$transaction(async (tx) => {
      const rfq = await tx.requestForQuotation.create({
        data: {
          organizationId,
          rfqNo: rfqNo!,
          purchaseRequisitionId: purchaseRequisition?.id,
          cmsWorkId,
          issueDate: new Date(dto.issueDate),
          submissionDeadline: new Date(dto.submissionDeadline),
          deliveryLocation: dto.deliveryLocation,
          termsConditions: dto.termsConditions,
          paymentTerms: dto.paymentTerms,
          remarks: dto.remarks,
          status: "DRAFT",
          createdById: userId,
        },
      });
      await tx.rfqSupplier.createMany({ data: [...new Set(dto.supplierIds)].map((supplierId) => ({ organizationId, rfqId: rfq.id, supplierId })) });
      await tx.rfqItem.createMany({
        data: sourceItems.map((item) => {
          const master = itemsById.get(item.itemId)!;
          return {
            organizationId,
            rfqId: rfq.id,
            itemId: item.itemId,
            purchaseRequisitionItemId: item.purchaseRequisitionItemId,
            itemCodeSnapshot: master.itemCode,
            itemNameSnapshot: master.itemName,
            descriptionSnapshot: master.description,
            unitSnapshot: master.uom?.code ?? "PCS",
            requestedQty: item.requestedQty,
            remarks: item.remarks,
          };
        }),
      });
      if (purchaseRequisition) await this.purchaseRequisitions.markConverted(organizationId, purchaseRequisition.id, tx);
      return tx.requestForQuotation.findFirstOrThrow({ where: { id: rfq.id }, include: includeRelations });
    });

    await this.auditLogService.record({ organizationId, userId, action: "RFQ_CREATED", entityType: "RequestForQuotation", entityId: record.id, referenceNo: record.rfqNo, newValue: toDto(record) });
    return toDto(record);
  }

  async update(organizationId: string, userId: string, id: string, dto: SaveRfqDto) {
    const existing = await this.prisma.requestForQuotation.findFirst({ where: { id, organizationId }, include: includeRelations });
    if (!existing) throw new NotFoundException("RFQ not found");
    if (existing.status !== "DRAFT") throw new BadRequestException("Only a Draft RFQ can be edited — issued RFQs preserve their historical terms");
    if (existing.cmsWorkId) await this.lifecycle.assertOperationalMutationAllowed(organizationId, existing.cmsWorkId, "editing an RFQ");

    await this.assertSuppliersEligible(organizationId, [...new Set(dto.supplierIds)]);
    if (!dto.items?.length) throw new BadRequestException("Provide at least one item");
    const itemMasters = await this.prisma.item.findMany({ where: { id: { in: [...new Set(dto.items.map((item) => item.itemId))] }, organizationId }, include: { uom: true } });
    const itemsById = new Map(itemMasters.map((item) => [item.id, item]));
    for (const item of dto.items) if (!itemsById.has(item.itemId)) throw new NotFoundException("One or more items were not found in this organization");

    const record = await this.prisma.$transaction(async (tx) => {
      await tx.requestForQuotation.update({
        where: { id, organizationId },
        data: {
          issueDate: new Date(dto.issueDate),
          submissionDeadline: new Date(dto.submissionDeadline),
          deliveryLocation: dto.deliveryLocation,
          termsConditions: dto.termsConditions,
          paymentTerms: dto.paymentTerms,
          remarks: dto.remarks,
        },
      });
      await tx.rfqSupplier.deleteMany({ where: { rfqId: id } });
      await tx.rfqSupplier.createMany({ data: [...new Set(dto.supplierIds)].map((supplierId) => ({ organizationId, rfqId: id, supplierId })) });
      await tx.rfqItem.deleteMany({ where: { rfqId: id } });
      await tx.rfqItem.createMany({
        data: dto.items!.map((item) => {
          const master = itemsById.get(item.itemId)!;
          return {
            organizationId,
            rfqId: id,
            itemId: item.itemId,
            purchaseRequisitionItemId: item.purchaseRequisitionItemId,
            itemCodeSnapshot: master.itemCode,
            itemNameSnapshot: master.itemName,
            descriptionSnapshot: master.description,
            unitSnapshot: master.uom?.code ?? "PCS",
            requestedQty: item.requestedQty,
            remarks: item.remarks,
          };
        }),
      });
      return tx.requestForQuotation.findFirstOrThrow({ where: { id }, include: includeRelations });
    });

    await this.auditLogService.record({ organizationId, userId, action: "RFQ_UPDATED", entityType: "RequestForQuotation", entityId: id, referenceNo: record.rfqNo, oldValue: toDto(existing), newValue: toDto(record) });
    return toDto(record);
  }

  async issue(organizationId: string, userId: string, id: string) {
    const existing = await this.prisma.requestForQuotation.findFirst({ where: { id, organizationId }, include: { suppliers: true, items: true } });
    if (!existing) throw new NotFoundException("RFQ not found");
    if (existing.status !== "DRAFT") throw new BadRequestException("Only a Draft RFQ can be issued");
    if (!existing.suppliers.length) throw new BadRequestException("Invite at least one supplier before issuing");
    if (!existing.items.length) throw new BadRequestException("Add at least one item before issuing");
    if (existing.cmsWorkId) await this.lifecycle.assertOperationalMutationAllowed(organizationId, existing.cmsWorkId, "issuing an RFQ");

    const record = await this.prisma.requestForQuotation.update({ where: { id, organizationId }, data: { status: "ISSUED", issuedById: userId, issuedAt: new Date() }, include: includeRelations });
    await this.auditLogService.record({ organizationId, userId, action: "RFQ_ISSUED", entityType: "RequestForQuotation", entityId: id, referenceNo: record.rfqNo, newValue: { status: record.status } });
    return toDto(record);
  }

  async close(organizationId: string, userId: string, id: string) {
    const existing = await this.prisma.requestForQuotation.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("RFQ not found");
    if (existing.status !== "ISSUED") throw new BadRequestException("Only an Issued RFQ can be closed");
    if (existing.cmsWorkId) await this.lifecycle.assertOperationalMutationAllowed(organizationId, existing.cmsWorkId, "closing an RFQ");

    const record = await this.prisma.requestForQuotation.update({ where: { id, organizationId }, data: { status: "CLOSED" }, include: includeRelations });
    await this.auditLogService.record({ organizationId, userId, action: "RFQ_CLOSED", entityType: "RequestForQuotation", entityId: id, referenceNo: record.rfqNo, newValue: { status: record.status } });
    return toDto(record);
  }

  async cancel(organizationId: string, userId: string, id: string) {
    const existing = await this.prisma.requestForQuotation.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("RFQ not found");
    if (["AWARDED", "CANCELLED"].includes(existing.status)) throw new BadRequestException(`A ${existing.status.toLowerCase()} RFQ cannot be cancelled`);
    if (existing.cmsWorkId) await this.lifecycle.assertOperationalMutationAllowed(organizationId, existing.cmsWorkId, "cancelling an RFQ");

    const record = await this.prisma.requestForQuotation.update({ where: { id, organizationId }, data: { status: "CANCELLED" }, include: includeRelations });
    await this.auditLogService.record({ organizationId, userId, action: "RFQ_CANCELLED", entityType: "RequestForQuotation", entityId: id, referenceNo: record.rfqNo, newValue: { status: record.status } });
    return toDto(record);
  }

  /** Called by ComparativeStatementsService.approve() — side effect of a CS approval, not a
   * standalone endpoint. */
  async markAwarded(organizationId: string, id: string, tx: Prisma.TransactionClient) {
    await tx.requestForQuotation.update({ where: { id, organizationId }, data: { status: "AWARDED" } });
  }
}
