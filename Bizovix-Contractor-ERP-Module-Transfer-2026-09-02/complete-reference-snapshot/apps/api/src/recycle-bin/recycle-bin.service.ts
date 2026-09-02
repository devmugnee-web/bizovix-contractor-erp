import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  InventoryItemStatus,
  PartyStatus,
  RecycleBinEntryKind,
  VoucherEntryStatus,
  VoucherWorkflowOrigin,
  type Prisma,
} from "../generated/prisma/index.js";

import { normalizeBalancedMoneyLines, roundMoney, sumMoney, toPaisa } from "../accounting/money.util.js";
import { classifyMoneyAccount, type MoneyAccountType } from "../accounts/accounts.service.js";
import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { deactivatePartyAccount, ensurePartyAccount, removePartyAccountSafely } from "../masters/party-account-sync.js";

const MONEY_TYPE_LABEL: Record<MoneyAccountType, string> = { CASH: "Cash", BANK: "Bank", MFS: "MFS" };

type RestoredVoucherLine = Record<string, unknown> & {
  debit: number;
  credit: number;
};

type BoundRestoredVoucherLine = RestoredVoucherLine & {
  accountId: string | null;
  ledger: string;
};

type VoucherRecycleSnapshotEntry = {
  id: string;
  entityId: string;
  companyId: string;
  workspaceId: string;
  kind: RecycleBinEntryKind;
  snapshot: Prisma.JsonValue;
};

type RestoreDb = Prisma.TransactionClient | PrismaService;

function toPlainJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function optionalSnapshotString(value: unknown) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

function optionalSnapshotDate(value: unknown, field: string) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`Recycled inventory line has an invalid ${field}`);
  }
  return parsed;
}

function canonicalWorkflowDocumentKind(value: { voucherType?: unknown; documentKind?: unknown }) {
  const supplied = typeof value.documentKind === "string" ? value.documentKind.trim() : "";
  if (supplied) return supplied;
  const kindByVoucherType: Record<string, string> = {
    PURCHASE_ORDER: "purchase-order",
    RECEIPT_NOTE: "receipt-note",
    SALES_ORDER: "sale-order",
    DELIVERY_NOTE: "delivery-note",
  };
  return kindByVoucherType[String(value.voucherType ?? "")] ?? "";
}

@Injectable()
export class RecycleBinService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(currentUser: AuthenticatedRequestUser, workspaceId?: string) {
    const targetWorkspaceId = workspaceId ?? currentUser.workspaceId;
    if (!targetWorkspaceId) {
      throw new ForbiddenException("No active workspace");
    }

    await this.ensureWorkspaceAccess(currentUser, targetWorkspaceId);

    const entries = await this.prisma.recycleBinEntry.findMany({
      where: { workspaceId: targetWorkspaceId },
      include: { workspace: { select: { name: true } }, deletedByUser: { select: { name: true } } },
      orderBy: { deletedOn: "desc" },
    });

    // settlementMode collapses a split payment (e.g. part Cash, part Bank) down
    // to a single tag, so the plain paymentType column can misreport a mixed
    // payment as fully "BANK". The voucher's own saved lines still carry the
    // real per-method breakdown, so recover it from there when it disagrees.
    const companyId = entries[0]?.companyId;
    const accountsById = companyId
      ? new Map((await this.prisma.account.findMany({ where: { companyId } })).map((account) => [account.id, account]))
      : new Map();

    return entries.map((entry) => ({
      id: entry.id,
      workspaceId: entry.workspaceId,
      workspaceName: entry.workspace.name,
      kind: entry.kind.toLowerCase(),
      transactionDate: entry.transactionDate.toISOString(),
      refNo: entry.refNo ?? "",
      partyName: entry.partyName,
      txnType: entry.txnType,
      paymentType: this.describeVoucherPaymentType(entry, accountsById) ?? entry.paymentType,
      amount: roundMoney(entry.amount),
      deletedOn: entry.deletedOn.toISOString(),
      deletedBy: entry.deletedByUser?.name ?? "Current User",
      snapshot: entry.snapshot,
    }));
  }

  /** Returns e.g. "Cash + Bank" when the recycled voucher's own lines show more
   * than one money-account type in play; null when there's nothing to add
   * (non-voucher entries, single-method vouchers, or an unreadable snapshot),
   * so the caller falls back to the plain stored paymentType unchanged. */
  private describeVoucherPaymentType(
    entry: { kind: RecycleBinEntryKind; snapshot: Prisma.JsonValue },
    accountsById: Map<string, Prisma.AccountGetPayload<Record<string, never>>>,
  ): string | null {
    if (entry.kind !== RecycleBinEntryKind.VOUCHER) {
      return null;
    }

    const snapshot = asRecord(entry.snapshot);
    const lines = Array.isArray(snapshot?.lines) ? (snapshot!.lines as unknown[]) : [];
    const foundTypes = new Set<MoneyAccountType>();
    for (const raw of lines) {
      const line = asRecord(raw);
      const accountId = typeof line?.accountId === "string" ? line.accountId : "";
      const account = accountId ? accountsById.get(accountId) : undefined;
      if (!account) continue;
      const hasAmount = Number(line?.debit ?? 0) !== 0 || Number(line?.credit ?? 0) !== 0;
      if (!hasAmount) continue;
      const type = classifyMoneyAccount(account, accountsById);
      if (type) foundTypes.add(type);
    }

    if (foundTypes.size < 2) {
      return null;
    }
    return [...foundTypes].map((type) => MONEY_TYPE_LABEL[type]).join(" + ");
  }

  async movePartyToRecycleBin(currentUser: AuthenticatedRequestUser, partyId: string) {
    const party = await this.prisma.party.findUnique({ where: { id: partyId } });
    if (!party) {
      throw new NotFoundException("Party not found");
    }

    await this.ensureWorkspaceAccess(currentUser, party.workspaceId);

    await this.prisma.$transaction(async (tx) => {
      await tx.recycleBinEntry.create({
        data: {
          tenantId: party.tenantId,
          companyId: party.companyId,
          workspaceId: party.workspaceId,
          kind: RecycleBinEntryKind.PARTY,
          entityId: party.id,
          transactionDate: new Date(),
          refNo: party.contact,
          partyName: party.name,
          txnType: party.type,
          paymentType: party.status,
          amount: roundMoney(party.creditLimit),
          deletedByUserId: currentUser.id ?? undefined,
          snapshot: toPlainJson(party),
        },
      });
      await tx.party.update({ where: { id: party.id }, data: { status: PartyStatus.INACTIVE } });
      await deactivatePartyAccount(tx, party);
    });

    return party;
  }

  async moveItemToRecycleBin(currentUser: AuthenticatedRequestUser, itemId: string) {
    const item = await this.prisma.inventoryItem.findUnique({ where: { id: itemId } });
    if (!item) {
      throw new NotFoundException("Inventory item not found");
    }

    await this.ensureWorkspaceAccess(currentUser, item.workspaceId);

    await this.prisma.$transaction(async (tx) => {
      await tx.recycleBinEntry.create({
        data: {
          tenantId: item.tenantId,
          companyId: item.companyId,
          workspaceId: item.workspaceId,
          kind: RecycleBinEntryKind.ITEM,
          entityId: item.id,
          transactionDate: new Date(),
          refNo: item.itemCode,
          partyName: item.itemName,
          txnType: item.category || "item",
          paymentType: item.status,
          amount: roundMoney(Number(item.openingQty) * Number(item.openingRate)),
          deletedByUserId: currentUser.id ?? undefined,
          snapshot: toPlainJson(item),
        },
      });
      await tx.inventoryItem.update({ where: { id: item.id }, data: { status: InventoryItemStatus.INACTIVE } });
    });

    return item;
  }

  async moveVoucherToRecycleBin(currentUser: AuthenticatedRequestUser, voucher: {
    id: string;
    tenantId: string;
    companyId: string;
    workspaceId: string;
    voucherDate: Date;
    voucherNumber: string;
    reference: string | null;
    partyName: string;
    voucherType: string;
    settlementMode: string;
    totalAmount: Prisma.Decimal | number;
  }, snapshot: unknown) {
    await this.prisma.recycleBinEntry.create({
      data: {
        tenantId: voucher.tenantId,
        companyId: voucher.companyId,
        workspaceId: voucher.workspaceId,
        kind: RecycleBinEntryKind.VOUCHER,
        entityId: voucher.id,
        transactionDate: voucher.voucherDate,
        refNo: voucher.reference || voucher.voucherNumber,
        partyName: voucher.partyName || "-",
        txnType: voucher.voucherType,
        paymentType: voucher.settlementMode,
        amount: roundMoney(voucher.totalAmount),
        deletedByUserId: currentUser.id ?? undefined,
        snapshot: toPlainJson(snapshot),
      },
    });
  }

  async restore(currentUser: AuthenticatedRequestUser, entryId: string) {
    const entry = await this.getOwnedEntry(currentUser, entryId);

    if (entry.kind === RecycleBinEntryKind.PARTY) {
      await this.prisma.$transaction(async (tx) => {
        const party = await tx.party.update({ where: { id: entry.entityId }, data: { status: PartyStatus.ACTIVE } });
        await ensurePartyAccount(tx, party, currentUser.id);
      });
    } else if (entry.kind === RecycleBinEntryKind.ITEM) {
      await this.prisma.inventoryItem.update({ where: { id: entry.entityId }, data: { status: InventoryItemStatus.ACTIVE } });
    } else {
      await this.restoreVoucherWithDependencies(entry);
      return { success: true, id: entry.id };
    }

    await this.prisma.recycleBinEntry.delete({ where: { id: entry.id } });
    return { success: true, id: entry.id };
  }

  async deletePermanently(currentUser: AuthenticatedRequestUser, entryId: string) {
    const entry = await this.getOwnedEntry(currentUser, entryId);
    await this.prisma.$transaction(async (tx) => {
      if (entry.kind === RecycleBinEntryKind.PARTY) {
        const party = await tx.party.findFirst({ where: { id: entry.entityId, status: PartyStatus.INACTIVE } });
        if (party) await removePartyAccountSafely(tx, party);
        await tx.party.deleteMany({ where: { id: entry.entityId, status: PartyStatus.INACTIVE } });
      }
      if (entry.kind === RecycleBinEntryKind.ITEM) {
        await tx.inventoryItem.deleteMany({ where: { id: entry.entityId, status: InventoryItemStatus.INACTIVE } });
      }
      await tx.recycleBinEntry.delete({ where: { id: entry.id } });
    });
    return { success: true, id: entry.id };
  }

  async empty(currentUser: AuthenticatedRequestUser, workspaceId?: string) {
    const targetWorkspaceId = workspaceId ?? currentUser.workspaceId;
    if (!targetWorkspaceId) {
      throw new ForbiddenException("No active workspace");
    }

    await this.ensureWorkspaceAccess(currentUser, targetWorkspaceId);
    const entries = await this.prisma.recycleBinEntry.findMany({ where: { workspaceId: targetWorkspaceId } });
    for (const entry of entries) {
      await this.deletePermanently(currentUser, entry.id);
    }
    return { success: true, removedCount: entries.length };
  }

  private async restoreVoucherWithDependencies(selected: VoucherRecycleSnapshotEntry) {
    await this.prisma.$transaction(async (tx) => {
      const recycled = await tx.recycleBinEntry.findMany({
        where: {
          workspaceId: selected.workspaceId,
          companyId: selected.companyId,
          kind: RecycleBinEntryKind.VOUCHER,
        },
        select: {
          id: true,
          entityId: true,
          companyId: true,
          workspaceId: true,
          kind: true,
          snapshot: true,
        },
        orderBy: [{ deletedOn: "asc" }, { id: "asc" }],
      });
      const selectedEntry = recycled.find((entry) => entry.id === selected.id);
      if (!selectedEntry) return;

      const snapshots = new Map<string, Record<string, unknown>>();
      const entriesByVoucherId = new Map<string, VoucherRecycleSnapshotEntry[]>();
      const inventoryLineOwners = new Map<string, VoucherRecycleSnapshotEntry>();
      for (const entry of recycled) {
        const rawSnapshot = asRecord(entry.snapshot);
        if (!rawSnapshot) {
          throw new BadRequestException(`Recycle snapshot ${entry.id} is not a valid voucher snapshot`);
        }
        const snapshot = rawSnapshot.id
          ? rawSnapshot
          : { ...rawSnapshot, id: entry.entityId };
        const voucherId = String(snapshot.id);
        if (voucherId !== entry.entityId) {
          throw new BadRequestException(`Recycle snapshot ${entry.id} does not match voucher ${entry.entityId}`);
        }
        snapshots.set(entry.id, snapshot);
        entriesByVoucherId.set(voucherId, [...(entriesByVoucherId.get(voucherId) ?? []), entry]);

        const inventoryItems = Array.isArray(snapshot.inventoryItems)
          ? snapshot.inventoryItems as Array<Record<string, unknown>>
          : [];
        for (const item of inventoryItems) {
          const lineId = optionalSnapshotString(item.id);
          if (!lineId) continue;
          const previousOwner = inventoryLineOwners.get(lineId);
          if (previousOwner && previousOwner.id !== entry.id) {
            throw new BadRequestException(`Inventory line ${lineId} appears in more than one recycle snapshot`);
          }
          inventoryLineOwners.set(lineId, entry);
        }
      }

      const dependencyEntries = (entry: VoucherRecycleSnapshotEntry) => {
        const snapshot = snapshots.get(entry.id)!;
        const dependencies = new Map<string, VoucherRecycleSnapshotEntry>();
        const sourceVoucherId = optionalSnapshotString(snapshot.sourceVoucherId);
        if (sourceVoucherId) {
          const matches = entriesByVoucherId.get(sourceVoucherId) ?? [];
          if (matches.length > 1) {
            throw new BadRequestException(`More than one recycle snapshot exists for source voucher ${sourceVoucherId}`);
          }
          if (matches[0] && matches[0].id !== entry.id) dependencies.set(matches[0].id, matches[0]);
        }

        const inventoryItems = Array.isArray(snapshot.inventoryItems)
          ? snapshot.inventoryItems as Array<Record<string, unknown>>
          : [];
        for (const item of inventoryItems) {
          const sourceLineId = optionalSnapshotString(item.sourceInventoryLineId);
          if (!sourceLineId) continue;
          const owner = inventoryLineOwners.get(sourceLineId);
          if (owner && owner.id !== entry.id) dependencies.set(owner.id, owner);
        }
        return [...dependencies.values()].sort((left, right) => left.entityId.localeCompare(right.entityId));
      };

      const sourceFirst: VoucherRecycleSnapshotEntry[] = [];
      const visiting = new Set<string>();
      const visited = new Set<string>();
      const visit = (entry: VoucherRecycleSnapshotEntry) => {
        if (visited.has(entry.id)) return;
        if (visiting.has(entry.id)) {
          throw new BadRequestException("Voucher recycle dependency contains a cycle and cannot be restored safely");
        }
        visiting.add(entry.id);
        for (const dependency of dependencyEntries(entry)) visit(dependency);
        visiting.delete(entry.id);
        visited.add(entry.id);
        sourceFirst.push(entry);
      };
      visit(selectedEntry);

      for (const entry of sourceFirst) {
        await this.restoreVoucher(snapshots.get(entry.id)!, tx);
      }
      await tx.recycleBinEntry.deleteMany({
        where: { id: { in: sourceFirst.map((entry) => entry.id) } },
      });
    });
  }

  private async restoreVoucher(snapshot: Record<string, unknown>, db: RestoreDb = this.prisma) {
    const existing = await db.voucherEntry.findUnique({ where: { id: String(snapshot.id) } });
    if (existing) {
      return;
    }

    const workflowOrigin = await this.resolveRestoredWorkflowOrigin(snapshot, db);
    const lines = Array.isArray(snapshot.lines) ? snapshot.lines as Array<Record<string, unknown>> : [];
    const inventoryItems = Array.isArray(snapshot.inventoryItems) ? snapshot.inventoryItems as Array<Record<string, unknown>> : [];
    const normalizedLines = normalizeBalancedMoneyLines<RestoredVoucherLine>(
      lines.map((line): RestoredVoucherLine => ({
        ...line,
        debit: Number(line.debit ?? 0),
        credit: Number(line.credit ?? 0),
      })),
    );
    const boundLines = await this.bindRestoredVoucherLines(String(snapshot.companyId), normalizedLines, db);
    const totalDebit = sumMoney(boundLines.map((line) => line.debit));
    const totalCredit = sumMoney(boundLines.map((line) => line.credit));
    await db.voucherEntry.create({
      data: {
        id: String(snapshot.id),
        tenantId: String(snapshot.tenantId),
        companyId: String(snapshot.companyId),
        workspaceId: String(snapshot.workspaceId),
        createdByUserId: String(snapshot.createdByUserId),
        voucherType: snapshot.voucherType as never,
        // Added after this restore path was first written — without them a restored
        // purchase order/receipt note/bill loses its place in the order → receipt →
        // bill chain and silently falls back to being treated as a plain bill.
        documentKind: snapshot.documentKind ? String(snapshot.documentKind) : null,
        sourceVoucherId: snapshot.sourceVoucherId ? String(snapshot.sourceVoucherId) : null,
        // This is a historical snapshot, not a new transaction governed by the
        // company's current policy. Preserve its captured origin so restoring a
        // row cannot reinterpret stock/accounting semantics or make the database
        // immutability trigger freeze an incorrect DIRECT default.
        workflowOrigin,
        voucherNumber: String(snapshot.voucherNumber),
        voucherDate: new Date(String(snapshot.voucherDate)),
        partyName: String(snapshot.partyName ?? ""),
        partyId: snapshot.partyId ? String(snapshot.partyId) : null,
        reference: snapshot.reference ? String(snapshot.reference) : null,
        narration: snapshot.narration ? String(snapshot.narration) : null,
        // A deleted posted/reversed voucher must not silently recreate accounting
        // or stock effects. Restore it as an editable draft; posting it again will
        // create those effects through the normal posting workflow.
        status: VoucherEntryStatus.DRAFT,
        settlementMode: snapshot.settlementMode as never,
        supplierAddress: snapshot.supplierAddress ? String(snapshot.supplierAddress) : null,
        condition: snapshot.condition ? String(snapshot.condition) : null,
        buyerSignature: snapshot.buyerSignature ? String(snapshot.buyerSignature) : null,
        sellerSignature: snapshot.sellerSignature ? String(snapshot.sellerSignature) : null,
        attachmentImageUrl: snapshot.attachmentImageUrl ? String(snapshot.attachmentImageUrl) : null,
        attachmentDocumentUrl: snapshot.attachmentDocumentUrl ? String(snapshot.attachmentDocumentUrl) : null,
        attachmentDocumentName: snapshot.attachmentDocumentName ? String(snapshot.attachmentDocumentName) : null,
        discountType: snapshot.discountType as never,
        discountAmount: roundMoney(snapshot.discountAmount as number | string | null | undefined),
        subtotal: roundMoney(snapshot.subtotal as number | string | null | undefined),
        totalAmount: roundMoney(
          (snapshot.totalAmount ?? Math.max(totalDebit, totalCredit)) as number | string,
        ),
        debit: totalDebit,
        credit: totalCredit,
        paidAmount: snapshot.paidAmount == null ? null : roundMoney(snapshot.paidAmount as number | string),
        currency: snapshot.currency ? String(snapshot.currency) : "BDT",
        fiscalYearId: snapshot.fiscalYearId ? String(snapshot.fiscalYearId) : null,
        branchId: snapshot.branchId ? String(snapshot.branchId) : null,
        warehouseId: snapshot.warehouseId ? String(snapshot.warehouseId) : null,
        sourceType: snapshot.sourceType ? String(snapshot.sourceType) : null,
        sourceId: snapshot.sourceId ? String(snapshot.sourceId) : null,
        // The original key may already have been consumed by a replacement entry.
        // A restored draft receives a fresh key when it is posted again.
        idempotencyKey: null,
        lines: {
          create: boundLines.map((line) => ({
            ...(optionalSnapshotString(line.id) ? { id: optionalSnapshotString(line.id)! } : {}),
            accountId: line.accountId,
            ledger: String(line.ledger ?? ""),
            description: line.description ? String(line.description) : null,
            debit: line.debit,
            credit: line.credit,
            costCenter: line.costCenter ? String(line.costCenter) : null,
            project: line.project ? String(line.project) : null,
            billReference: line.billReference ? String(line.billReference) : null,
          })),
        },
      },
    });
    await this.restoreVoucherInventoryItems(db, snapshot, inventoryItems);
  }

  private async restoreVoucherInventoryItems(
    db: RestoreDb,
    snapshot: Record<string, unknown>,
    inventoryItems: Array<Record<string, unknown>>,
  ) {
    const voucherId = String(snapshot.id);
    const workspaceId = String(snapshot.workspaceId);
    const companyId = String(snapshot.companyId);
    const pending = [...inventoryItems];
    const pendingIds = new Set(pending.map((item) => optionalSnapshotString(item.id)).filter((id): id is string => Boolean(id)));
    if (pendingIds.size !== pending.filter((item) => optionalSnapshotString(item.id)).length) {
      throw new BadRequestException(`Voucher ${voucherId} has duplicate inventory-line IDs in its recycle snapshot`);
    }

    while (pending.length) {
      const ready = pending.filter((item) => {
        const sourceLineId = optionalSnapshotString(item.sourceInventoryLineId);
        return !sourceLineId || !pendingIds.has(sourceLineId);
      });
      if (!ready.length) {
        throw new BadRequestException("Inventory source-line dependency contains a cycle and cannot be restored safely");
      }

      for (const item of ready) {
        const lineId = optionalSnapshotString(item.id);
        const sourceInventoryLineId = optionalSnapshotString(item.sourceInventoryLineId);
        if (sourceInventoryLineId) {
          const sourceLine = await db.voucherInventoryItem.findUnique({
            where: { id: sourceInventoryLineId },
            select: {
              voucher: { select: { workspaceId: true, companyId: true } },
            },
          });
          if (!sourceLine) {
            throw new BadRequestException(`Source inventory line ${sourceInventoryLineId} is missing and cannot be restored`);
          }
          if (sourceLine.voucher.workspaceId !== workspaceId || sourceLine.voucher.companyId !== companyId) {
            throw new BadRequestException(`Source inventory line ${sourceInventoryLineId} belongs to another company or workspace`);
          }
        }

        const quantity = Number(item.quantity ?? 0);
        const unitPrice = roundMoney(item.unitPrice as number | string | null | undefined);
        const capturedLineTotal = item.lineTotal === null || item.lineTotal === undefined
          ? quantity * unitPrice
          : item.lineTotal as number | string;
        const createdAt = optionalSnapshotDate(item.createdAt, "createdAt");
        const updatedAt = optionalSnapshotDate(item.updatedAt, "updatedAt");
        await db.voucherInventoryItem.create({
          data: {
            ...(lineId ? { id: lineId } : {}),
            voucherId,
            inventoryItemId: optionalSnapshotString(item.inventoryItemId),
            warehouseId: optionalSnapshotString(item.warehouseId),
            sourceInventoryLineId,
            manufacturingInventoryLotId: optionalSnapshotString(item.manufacturingInventoryLotId),
            manufacturingSerialIds: Array.isArray(item.manufacturingSerialIds)
              ? item.manufacturingSerialIds.map((id) => String(id).trim()).filter(Boolean)
              : [],
            itemName: String(item.itemName ?? ""),
            quantity,
            unitPrice,
            lineTotal: roundMoney(capturedLineTotal),
            batchNumber: optionalSnapshotString(item.batchNumber),
            manufacturedAt: optionalSnapshotDate(item.manufacturedAt, "manufacturedAt"),
            expiresAt: optionalSnapshotDate(item.expiresAt, "expiresAt"),
            ...(createdAt ? { createdAt } : {}),
            ...(updatedAt ? { updatedAt } : {}),
          },
        });
        const index = pending.indexOf(item);
        pending.splice(index, 1);
        if (lineId) pendingIds.delete(lineId);
      }
    }
  }

  /**
   * Recycle snapshots are historical display data, so their free-text `ledger`
   * caption must never be used to rediscover accounting identity. A restored
   * non-zero line is accepted only when its captured Account id still points to
   * a LEDGER in the voucher's own company. The current COA name is refreshed as
   * a display snapshot; the stable id remains the source of truth.
   */
  private async bindRestoredVoucherLines(
    companyId: string,
    lines: RestoredVoucherLine[],
    db: RestoreDb = this.prisma,
  ): Promise<BoundRestoredVoucherLine[]> {
    const accountIds = [...new Set(lines
      .map((line) => typeof line.accountId === "string" ? line.accountId.trim() : "")
      .filter(Boolean))];
    const accounts = accountIds.length
      ? await db.account.findMany({
          where: { companyId, id: { in: accountIds }, level: "LEDGER" },
          select: { id: true, name: true },
        })
      : [];
    const accountById = new Map(accounts.map((account) => [account.id, account]));

    return lines.map((line): BoundRestoredVoucherLine => {
      const accountId = typeof line.accountId === "string" ? line.accountId.trim() : "";
      const hasValue = toPaisa(line.debit) !== 0n || toPaisa(line.credit) !== 0n;
      if (hasValue && !accountId) {
        throw new BadRequestException(
          "This legacy voucher cannot be restored until every non-zero line has a Chart of Accounts ledger ID.",
        );
      }
      const account = accountId ? accountById.get(accountId) : null;
      if (accountId && !account) {
        throw new BadRequestException(
          "A voucher line references a missing or foreign Chart of Accounts ledger and cannot be restored.",
        );
      }
      return {
        ...line,
        accountId: accountId || null,
        ledger: account?.name ?? String(line.ledger ?? ""),
      };
    });
  }

  private async resolveRestoredWorkflowOrigin(snapshot: Record<string, unknown>, db: RestoreDb = this.prisma) {
    if (snapshot.workflowOrigin === VoucherWorkflowOrigin.DIRECT || snapshot.workflowOrigin === VoucherWorkflowOrigin.ORDER_FLOW) {
      return snapshot.workflowOrigin;
    }

    const ownKind = canonicalWorkflowDocumentKind(snapshot);
    if (["purchase-order", "receipt-note", "sale-order", "delivery-note"].includes(ownKind)) {
      return VoucherWorkflowOrigin.ORDER_FLOW;
    }

    const sourceVoucherId = typeof snapshot.sourceVoucherId === "string" ? snapshot.sourceVoucherId.trim() : "";
    if (!sourceVoucherId) return VoucherWorkflowOrigin.DIRECT;

    // Recycle snapshots written before workflowOrigin existed need a safe
    // backfill. Prefer the live source; when a whole chain was deleted, inspect
    // its sibling recycle snapshot. This distinguishes Delivery Note -> Invoice
    // (ORDER_FLOW) from the supported legacy Sales Order -> Invoice path, whose
    // Invoice remains DIRECT because it moved stock itself.
    const liveSource = await db.voucherEntry.findUnique({
      where: { id: sourceVoucherId },
      select: { voucherType: true, documentKind: true },
    });
    let sourceKind = liveSource ? canonicalWorkflowDocumentKind(liveSource) : "";
    if (!sourceKind) {
      const recycledSource = await db.recycleBinEntry.findFirst({
        where: {
          workspaceId: String(snapshot.workspaceId),
          entityId: sourceVoucherId,
          kind: RecycleBinEntryKind.VOUCHER,
        },
        select: { snapshot: true },
      });
      const sourceSnapshot = asRecord(recycledSource?.snapshot);
      sourceKind = sourceSnapshot ? canonicalWorkflowDocumentKind(sourceSnapshot) : "";
    }

    return sourceKind === "receipt-note" || sourceKind === "delivery-note"
      ? VoucherWorkflowOrigin.ORDER_FLOW
      : VoucherWorkflowOrigin.DIRECT;
  }

  private async getOwnedEntry(currentUser: AuthenticatedRequestUser, entryId: string) {
    const entry = await this.prisma.recycleBinEntry.findUnique({ where: { id: entryId } });
    if (!entry) {
      throw new NotFoundException("Recycle bin entry not found");
    }

    await this.ensureWorkspaceAccess(currentUser, entry.workspaceId);
    return entry;
  }

  private async ensureWorkspaceAccess(currentUser: AuthenticatedRequestUser, workspaceId: string) {
    const membership = await this.prisma.workspaceMember.findFirst({ where: { userId: currentUser.id, workspaceId } });
    if (!membership) {
      throw new ForbiddenException("Workspace access denied");
    }
  }
}
