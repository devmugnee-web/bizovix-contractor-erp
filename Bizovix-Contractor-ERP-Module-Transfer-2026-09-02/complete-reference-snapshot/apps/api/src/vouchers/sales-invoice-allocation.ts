import { BadRequestException } from "@nestjs/common";

import {
  Prisma,
  VoucherEntryStatus,
  VoucherEntryType,
  VoucherWorkflowOrigin,
} from "../generated/prisma/index.js";

type AllocationLine = {
  sourceInventoryLineId: string | null;
  inventoryItemId: string | null;
  warehouseId: string | null;
  manufacturingInventoryLotId: string | null;
  manufacturingSerialIds: string[];
  itemName: string;
  quantity: number | Prisma.Decimal;
};

type AllocationRequest = {
  workspaceId: string;
  companyId: string;
  partyId: string | null;
  partyName: string;
  voucherDate: Date;
  headerSourceVoucherId?: string | null;
  lines: AllocationLine[];
  excludeVoucherId?: string;
};

type AllocationOptions = {
  /** Posting is the final concurrency boundary: lock every source line and only
   * count allocations that have already reached an accounting-active status.
   * Draft-time validation remains deliberately stricter for better operator UX. */
  posting?: boolean;
};

const inactiveAllocationStatuses = [
  VoucherEntryStatus.REJECTED,
  VoucherEntryStatus.CANCELLED,
  VoucherEntryStatus.REVERSED,
  VoucherEntryStatus.SUPERSEDED_BY_ALTERATION,
];

const nonInvoiceSalesKinds = ["quotation", "proforma", "sale-order", "delivery-note"];

function normalized(value: string) {
  return value.trim().toLowerCase();
}

function isDeliveryNote(voucher: { voucherType: VoucherEntryType; documentKind: string | null }) {
  return voucher.voucherType === VoucherEntryType.DELIVERY_NOTE ||
    (voucher.voucherType === VoucherEntryType.SALES && voucher.documentKind === "delivery-note");
}

function sameParty(
  request: Pick<AllocationRequest, "partyId" | "partyName">,
  source: { partyId: string | null; partyName: string },
) {
  if (request.partyId && source.partyId) return request.partyId === source.partyId;
  return normalized(request.partyName) === normalized(source.partyName);
}

/**
 * Validates the quantity/document allocation between an order-flow Sales
 * Invoice and the exact Delivery Note lines it bills. Header sourceVoucherId is
 * intentionally not used as the authority: one invoice may combine several
 * Delivery Notes, while every inventory row already carries its precise source
 * line id.
 */
export async function assertSalesInvoiceAllocation(
  tx: Prisma.TransactionClient,
  request: AllocationRequest,
  options: AllocationOptions = {},
) {
  if (!request.lines.length) {
    throw new BadRequestException("An Order Based Sales Invoice must contain at least one Delivery Note item");
  }

  const requestedSourceIds = request.lines.map((line) => line.sourceInventoryLineId?.trim() || "");
  const missingSourceLine = request.lines.find((line, index) => !requestedSourceIds[index]);
  if (missingSourceLine) {
    throw new BadRequestException(`${missingSourceLine.itemName}: select the exact Delivery Note line`);
  }
  const sourceLineIds = [...new Set(requestedSourceIds)].sort();

  if (options.posting) {
    const lockingClient = tx as unknown as { $executeRaw?: (query: Prisma.Sql) => Promise<unknown> };
    if (typeof lockingClient.$executeRaw === "function") {
      for (const sourceLineId of sourceLineIds) {
        await lockingClient.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`sales-invoice-allocation:${request.workspaceId}:${sourceLineId}`}, 0))`,
        );
      }
    }
  }

  const sourceLines = await tx.voucherInventoryItem.findMany({
    where: { id: { in: sourceLineIds } },
    select: {
      id: true,
      inventoryItemId: true,
      warehouseId: true,
      manufacturingInventoryLotId: true,
      manufacturingSerialIds: true,
      itemName: true,
      quantity: true,
      voucher: {
        select: {
          id: true,
          workspaceId: true,
          companyId: true,
          voucherType: true,
          documentKind: true,
          sourceVoucherId: true,
          voucherNumber: true,
          voucherDate: true,
          partyId: true,
          partyName: true,
          warehouseId: true,
          status: true,
        },
      },
    },
  });
  const sourceById = new Map(sourceLines.map((line) => [line.id, line]));

  const headerSourceVoucherId = request.headerSourceVoucherId?.trim();
  if (
    headerSourceVoucherId &&
    !sourceLines.some((line) => line.voucher.id === headerSourceVoucherId)
  ) {
    throw new BadRequestException("Sales Invoice header source must be one of its selected Delivery Notes");
  }

  for (const sourceLineId of sourceLineIds) {
    const source = sourceById.get(sourceLineId);
    if (!source) {
      throw new BadRequestException("A selected Delivery Note line is missing or belongs to another document");
    }
    const sourceVoucher = source.voucher;
    if (
      sourceVoucher.workspaceId !== request.workspaceId ||
      sourceVoucher.companyId !== request.companyId ||
      !isDeliveryNote(sourceVoucher)
    ) {
      throw new BadRequestException(`${source.itemName}: source line must belong to a Delivery Note in this company workspace`);
    }
    if (sourceVoucher.status !== VoucherEntryStatus.POSTED) {
      throw new BadRequestException(`Delivery Note ${sourceVoucher.voucherNumber} must be posted before invoicing`);
    }
    if (!sameParty(request, sourceVoucher)) {
      throw new BadRequestException(`Customer must match Delivery Note ${sourceVoucher.voucherNumber}`);
    }
    if (request.voucherDate.getTime() < sourceVoucher.voucherDate.getTime()) {
      throw new BadRequestException(`Sales Invoice date cannot be before Delivery Note ${sourceVoucher.voucherNumber}`);
    }
    if (!sourceVoucher.sourceVoucherId) {
      throw new BadRequestException(`Delivery Note ${sourceVoucher.voucherNumber} has lost its Sales Order reference`);
    }
  }

  const orderIds = [...new Set(sourceLines.map((line) => line.voucher.sourceVoucherId!))];
  const sourceOrders = await tx.voucherEntry.findMany({
    where: {
      id: { in: orderIds },
      workspaceId: request.workspaceId,
      companyId: request.companyId,
      OR: [
        { voucherType: VoucherEntryType.SALES_ORDER },
        { voucherType: VoucherEntryType.SALES, documentKind: "sale-order" },
      ],
    },
    select: { id: true },
  });
  if (sourceOrders.length !== orderIds.length) {
    throw new BadRequestException("Every source Delivery Note must retain a valid Sales Order reference");
  }

  const requestedQuantityBySource = new Map<string, Prisma.Decimal>();
  const requestedSerialsBySource = new Map<string, Set<string>>();
  for (const line of request.lines) {
    const sourceLineId = line.sourceInventoryLineId!.trim();
    const source = sourceById.get(sourceLineId)!;
    const quantity = new Prisma.Decimal(line.quantity);
    if (!quantity.isPositive()) {
      throw new BadRequestException(`${line.itemName}: invoice quantity must be greater than zero`);
    }
    if (
      !line.inventoryItemId ||
      !source.inventoryItemId ||
      line.inventoryItemId !== source.inventoryItemId ||
      normalized(line.itemName) !== normalized(source.itemName)
    ) {
      throw new BadRequestException(`${line.itemName}: item must match its Delivery Note line`);
    }
    const sourceWarehouseId = source.warehouseId ?? source.voucher.warehouseId;
    if (!line.warehouseId || !sourceWarehouseId || line.warehouseId !== sourceWarehouseId) {
      throw new BadRequestException(`${line.itemName}: warehouse must match its Delivery Note line`);
    }
    if ((line.manufacturingInventoryLotId ?? null) !== (source.manufacturingInventoryLotId ?? null)) {
      throw new BadRequestException(`${line.itemName}: manufacturing lot must match its Delivery Note line`);
    }

    const sourceSerials = new Set(source.manufacturingSerialIds);
    const requestedSerials = [...new Set(line.manufacturingSerialIds.map((serialId) => serialId.trim()).filter(Boolean))];
    if (requestedSerials.length !== line.manufacturingSerialIds.length) {
      throw new BadRequestException(`${line.itemName}: invoice serial numbers must be unique`);
    }
    if (sourceSerials.size) {
      if (!quantity.isInteger() || requestedSerials.length !== quantity.toNumber()) {
        throw new BadRequestException(`${line.itemName}: select one delivered serial number for every invoiced unit`);
      }
      if (requestedSerials.some((serialId) => !sourceSerials.has(serialId))) {
        throw new BadRequestException(`${line.itemName}: invoice serials must come from the selected Delivery Note line`);
      }
    } else if (requestedSerials.length) {
      throw new BadRequestException(`${line.itemName}: the Delivery Note line has no serial provenance`);
    }
    const serialSet = requestedSerialsBySource.get(sourceLineId) ?? new Set<string>();
    for (const serialId of requestedSerials) {
      if (serialSet.has(serialId)) {
        throw new BadRequestException(`${line.itemName}: the same delivered serial cannot be invoiced twice`);
      }
      serialSet.add(serialId);
    }
    requestedSerialsBySource.set(sourceLineId, serialSet);
    requestedQuantityBySource.set(
      sourceLineId,
      (requestedQuantityBySource.get(sourceLineId) ?? new Prisma.Decimal(0)).add(quantity),
    );
  }

  const priorAllocations = await tx.voucherInventoryItem.findMany({
    where: {
      sourceInventoryLineId: { in: sourceLineIds },
      voucher: {
        workspaceId: request.workspaceId,
        companyId: request.companyId,
        voucherType: VoucherEntryType.SALES,
        ...(request.excludeVoucherId ? { id: { not: request.excludeVoucherId } } : {}),
        OR: [
          { documentKind: null },
          { documentKind: "bill" },
          { documentKind: { notIn: nonInvoiceSalesKinds } },
        ],
        status: options.posting
          ? { in: [VoucherEntryStatus.APPROVED, VoucherEntryStatus.POSTED] }
          : { notIn: inactiveAllocationStatuses },
      },
    },
    select: {
      sourceInventoryLineId: true,
      quantity: true,
      manufacturingSerialIds: true,
      voucher: { select: { voucherNumber: true } },
    },
  });
  const priorQuantityBySource = new Map<string, Prisma.Decimal>();
  const priorSerialsBySource = new Map<string, Set<string>>();
  for (const allocation of priorAllocations) {
    const sourceLineId = allocation.sourceInventoryLineId;
    if (!sourceLineId) continue;
    priorQuantityBySource.set(
      sourceLineId,
      (priorQuantityBySource.get(sourceLineId) ?? new Prisma.Decimal(0)).add(allocation.quantity),
    );
    const serialSet = priorSerialsBySource.get(sourceLineId) ?? new Set<string>();
    allocation.manufacturingSerialIds.forEach((serialId) => serialSet.add(serialId));
    priorSerialsBySource.set(sourceLineId, serialSet);
  }

  for (const sourceLineId of sourceLineIds) {
    const source = sourceById.get(sourceLineId)!;
    const previous = priorQuantityBySource.get(sourceLineId) ?? new Prisma.Decimal(0);
    const requested = requestedQuantityBySource.get(sourceLineId) ?? new Prisma.Decimal(0);
    const remaining = Prisma.Decimal.max(new Prisma.Decimal(0), new Prisma.Decimal(source.quantity).sub(previous));
    if (requested.greaterThan(remaining)) {
      throw new BadRequestException(
        `${source.itemName}: only ${remaining.toString()} of Delivery Note ${source.voucher.voucherNumber} remains uninvoiced`,
      );
    }
    const priorSerials = priorSerialsBySource.get(sourceLineId) ?? new Set<string>();
    const duplicateSerial = [...(requestedSerialsBySource.get(sourceLineId) ?? [])]
      .find((serialId) => priorSerials.has(serialId));
    if (duplicateSerial) {
      throw new BadRequestException(`${source.itemName}: delivered serial ${duplicateSerial} has already been invoiced`);
    }
  }
}

/** Final posting-time revalidation. It runs inside PostingEngine's serializable
 * transaction and takes deterministic source-line advisory locks, so two
 * pending invoices can never both consume the same delivered quantity. */
export async function assertPersistedOrderFlowSalesInvoiceAllocation(
  tx: Prisma.TransactionClient,
  voucherId: string,
) {
  const voucher = await tx.voucherEntry.findUnique({
    where: { id: voucherId },
    select: {
      id: true,
      workspaceId: true,
      companyId: true,
      workflowOrigin: true,
      voucherType: true,
      documentKind: true,
      sourceVoucherId: true,
      partyId: true,
      partyName: true,
      voucherDate: true,
      inventoryItems: {
        select: {
          sourceInventoryLineId: true,
          inventoryItemId: true,
          warehouseId: true,
          manufacturingInventoryLotId: true,
          manufacturingSerialIds: true,
          itemName: true,
          quantity: true,
        },
      },
    },
  });
  if (
    !voucher ||
    voucher.workflowOrigin !== VoucherWorkflowOrigin.ORDER_FLOW ||
    voucher.voucherType !== VoucherEntryType.SALES ||
    nonInvoiceSalesKinds.includes(voucher.documentKind ?? "")
  ) {
    return;
  }
  await assertSalesInvoiceAllocation(
    tx,
    {
      workspaceId: voucher.workspaceId,
      companyId: voucher.companyId,
      partyId: voucher.partyId,
      partyName: voucher.partyName,
      voucherDate: voucher.voucherDate,
      headerSourceVoucherId: voucher.sourceVoucherId,
      lines: voucher.inventoryItems,
      excludeVoucherId: voucher.id,
    },
    { posting: true },
  );
}
