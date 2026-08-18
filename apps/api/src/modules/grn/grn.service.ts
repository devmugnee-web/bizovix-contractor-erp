import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@bizovix/database";
import type { PaginationMeta } from "@bizovix/types";
import { buildPaginationMeta } from "@bizovix/utils";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectLifecycleGuardService } from "../prisma/project-lifecycle-guard.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { NumberingService } from "../settings-numbering/numbering.service";
import { assertQtyBreakdownBalanced, calculateGrnItemLine, computeInspectionStatus } from "./grn-calculations";
import { SaveGrnDto } from "./dto/save-grn.dto";
import { QueryGrnDto } from "./dto/query-grn.dto";

const includeRelations = {
  purchaseOrder: { select: { id: true, poNo: true, status: true } },
  supplier: { select: { id: true, code: true, name: true } },
  cmsWork: { select: { id: true, workName: true } },
  items: { include: { purchaseOrderItem: { select: { id: true, itemNameSnapshot: true, unitSnapshot: true, orderedQty: true } } } },
} satisfies Prisma.GoodsReceiptNoteInclude;

type GrnRecord = Prisma.GoodsReceiptNoteGetPayload<{ include: typeof includeRelations }>;

function toDto(record: GrnRecord) {
  return {
    ...record,
    items: record.items.map((item) => ({
      ...item,
      orderedQty: item.orderedQty.toFixed(3),
      previouslyReceivedQty: item.previouslyReceivedQty.toFixed(3),
      currentReceivedQty: item.currentReceivedQty.toFixed(3),
      cumulativeReceivedQty: item.cumulativeReceivedQty.toFixed(3),
      remainingQty: item.remainingQty.toFixed(3),
      acceptedQty: item.acceptedQty.toFixed(3),
      rejectedQty: item.rejectedQty.toFixed(3),
      damagedQty: item.damagedQty.toFixed(3),
      purchaseOrderItem: { ...item.purchaseOrderItem, orderedQty: item.purchaseOrderItem.orderedQty.toFixed(3) },
    })),
  };
}

@Injectable()
export class GrnService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly numbering: NumberingService,
    private readonly lifecycle: ProjectLifecycleGuardService,
  ) {}

  private where(organizationId: string, query: QueryGrnDto): Prisma.GoodsReceiptNoteWhereInput {
    return {
      organizationId,
      ...(query.purchaseOrderId ? { purchaseOrderId: query.purchaseOrderId } : {}),
      ...(query.inspectionStatus ? { inspectionStatus: query.inspectionStatus } : {}),
      ...(query.search ? { grnNo: { contains: query.search, mode: "insensitive" } } : {}),
    };
  }

  async findAll(organizationId: string, query: QueryGrnDto): Promise<{ items: ReturnType<typeof toDto>[]; meta: PaginationMeta }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const where = this.where(organizationId, query);

    const [items, total] = await Promise.all([
      this.prisma.goodsReceiptNote.findMany({ where, include: includeRelations, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
      this.prisma.goodsReceiptNote.count({ where }),
    ]);

    return { items: items.map(toDto), meta: buildPaginationMeta(total, page, limit) };
  }

  async stats(organizationId: string) {
    const [total, accepted, partial, rejected] = await Promise.all([
      this.prisma.goodsReceiptNote.count({ where: { organizationId } }),
      this.prisma.goodsReceiptNote.count({ where: { organizationId, inspectionStatus: "ACCEPTED" } }),
      this.prisma.goodsReceiptNote.count({ where: { organizationId, inspectionStatus: "PARTIAL" } }),
      this.prisma.goodsReceiptNote.count({ where: { organizationId, inspectionStatus: "REJECTED" } }),
    ]);
    return { total, accepted, partial, rejected };
  }

  async findOne(organizationId: string, id: string) {
    const record = await this.prisma.goodsReceiptNote.findFirst({ where: { id, organizationId }, include: includeRelations });
    if (!record) throw new NotFoundException("GRN not found");
    return toDto(record);
  }

  async create(organizationId: string, userId: string, dto: SaveGrnDto) {
    const poExists = await this.prisma.purchaseOrder.findFirst({ where: { id: dto.purchaseOrderId, organizationId } });
    if (!poExists) throw new NotFoundException("Purchase Order not found");
    if (poExists.cmsWorkId) await this.lifecycle.assertOperationalMutationAllowed(organizationId, poExists.cmsWorkId, "recording a goods receipt");

    let grnNo = dto.grnNo?.trim();
    if (grnNo) {
      const clash = await this.prisma.goodsReceiptNote.findFirst({ where: { organizationId, grnNo } });
      if (clash) throw new BadRequestException(`GRN number "${grnNo}" is already in use`);
    } else {
      grnNo = await this.numbering.next(organizationId, "GOODS_RECEIPT_NOTE");
    }

    let inspectionStatus: ReturnType<typeof computeInspectionStatus>;
    let record: GrnRecord;
    try {
      const result = await this.prisma.$transaction(
        async (tx) => {
          // Re-read the PO and its items inside this Serializable transaction — the cumulative
          // received-quantity ceiling check must never race against a concurrent GRN on the same PO.
          const po = await tx.purchaseOrder.findFirst({ where: { id: dto.purchaseOrderId, organizationId }, include: { items: true } });
          if (!po) throw new NotFoundException("Purchase Order not found");
          if (!["ISSUED", "PARTIALLY_RECEIVED"].includes(po.status)) throw new BadRequestException("Goods can only be received against an Issued (or Partially Received) purchase order");

          const poItemsById = new Map(po.items.map((item) => [item.id, item]));
          const lineResults = dto.items.map((input) => {
            const poItem = poItemsById.get(input.purchaseOrderItemId);
            if (!poItem) throw new BadRequestException("One or more GRN items reference a line that does not belong to this Purchase Order");
            assertQtyBreakdownBalanced(poItem.itemNameSnapshot, { currentReceivedQty: input.currentReceivedQty, acceptedQty: input.acceptedQty, rejectedQty: input.rejectedQty ?? 0, damagedQty: input.damagedQty ?? 0 });
            const { cumulativeReceivedQty, remainingQty } = calculateGrnItemLine({ itemName: poItem.itemNameSnapshot, unit: poItem.unitSnapshot, orderedQty: poItem.orderedQty }, poItem.receivedQty, input.currentReceivedQty);
            return { input, poItem, cumulativeReceivedQty, remainingQty };
          });
          const status = computeInspectionStatus(dto.items.map((input) => ({ currentReceivedQty: input.currentReceivedQty, acceptedQty: input.acceptedQty, rejectedQty: input.rejectedQty ?? 0, damagedQty: input.damagedQty ?? 0 })));

          const grn = await tx.goodsReceiptNote.create({
            data: {
              organizationId,
              grnNo: grnNo!,
              purchaseOrderId: po.id,
              supplierId: po.supplierId,
              cmsWorkId: po.cmsWorkId,
              receiptDate: new Date(dto.receiptDate),
              deliveryChallanNo: dto.deliveryChallanNo,
              deliveryChallanDate: dto.deliveryChallanDate ? new Date(dto.deliveryChallanDate) : null,
              receivedById: dto.receivedById,
              inspectionStatus: status,
              warehouseLocation: dto.warehouseLocation,
              remarks: dto.remarks,
              createdById: userId,
            },
          });
          await tx.grnItem.createMany({
            data: lineResults.map(({ input, poItem, cumulativeReceivedQty, remainingQty }) => ({
              organizationId,
              grnId: grn.id,
              purchaseOrderItemId: poItem.id,
              descriptionSnapshot: poItem.itemNameSnapshot,
              unitSnapshot: poItem.unitSnapshot,
              orderedQty: poItem.orderedQty,
              previouslyReceivedQty: poItem.receivedQty,
              currentReceivedQty: input.currentReceivedQty,
              cumulativeReceivedQty,
              remainingQty,
              acceptedQty: input.acceptedQty,
              rejectedQty: input.rejectedQty ?? 0,
              damagedQty: input.damagedQty ?? 0,
              inspectionRemarks: input.inspectionRemarks,
            })),
          });
          for (const { poItem, cumulativeReceivedQty } of lineResults) {
            await tx.purchaseOrderItem.update({ where: { id: poItem.id }, data: { receivedQty: cumulativeReceivedQty } });
          }
          const freshItems = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: po.id } });
          const fullyReceived = freshItems.every((item) => item.receivedQty.gte(item.orderedQty));
          const anyReceived = freshItems.some((item) => item.receivedQty.gt(0));
          await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: fullyReceived ? "RECEIVED" : anyReceived ? "PARTIALLY_RECEIVED" : po.status } });
          const created = await tx.goodsReceiptNote.findFirstOrThrow({ where: { id: grn.id }, include: includeRelations });
          return { created, status };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      record = result.created;
      inspectionStatus = result.status;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") {
        throw new ConflictException("Another goods receipt was recorded against this Purchase Order at the same moment — please retry");
      }
      throw err;
    }

    await this.auditLogService.record({ organizationId, userId, action: "GRN_CREATED", entityType: "GoodsReceiptNote", entityId: record.id, referenceNo: record.grnNo, newValue: toDto(record) });
    if (inspectionStatus === "ACCEPTED") {
      await this.auditLogService.record({ organizationId, userId, action: "GRN_ACCEPTED", entityType: "GoodsReceiptNote", entityId: record.id, referenceNo: record.grnNo });
    } else if (inspectionStatus === "REJECTED") {
      await this.auditLogService.record({ organizationId, userId, action: "GRN_REJECTED", entityType: "GoodsReceiptNote", entityId: record.id, referenceNo: record.grnNo });
    }
    return toDto(record);
  }
}
