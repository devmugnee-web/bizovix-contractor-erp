import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  Prisma,
  VoucherEntryStatus,
  VoucherEntryType,
  VoucherWorkflowOrigin,
} from "../generated/prisma/index.js";

import { AuditService } from "../audit/audit.service.js";
import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { InventoryService } from "../inventory/inventory.service.js";
import { assertPersistedOrderFlowSalesInvoiceAllocation } from "../vouchers/sales-invoice-allocation.js";
import { normalizeBalancedMoneyLines, roundMoney, sumMoney, toPaisa } from "./money.util.js";

// Which statuses a voucher may move to from its current status. Anything not
// listed here is rejected by transitionStatus() before any write happens.
const ALLOWED_STATUS_TRANSITIONS: Record<VoucherEntryStatus, VoucherEntryStatus[]> = {
  [VoucherEntryStatus.DRAFT]: [VoucherEntryStatus.PENDING, VoucherEntryStatus.CANCELLED],
  [VoucherEntryStatus.PENDING]: [VoucherEntryStatus.APPROVED, VoucherEntryStatus.POSTED, VoucherEntryStatus.REJECTED, VoucherEntryStatus.CANCELLED],
  [VoucherEntryStatus.APPROVED]: [VoucherEntryStatus.POSTED, VoucherEntryStatus.REJECTED],
  [VoucherEntryStatus.POSTED]: [VoucherEntryStatus.REVERSED],
  [VoucherEntryStatus.REJECTED]: [VoucherEntryStatus.DRAFT, VoucherEntryStatus.PENDING, VoucherEntryStatus.CANCELLED],
  [VoucherEntryStatus.CANCELLED]: [],
  [VoucherEntryStatus.REVERSED]: [],
  [VoucherEntryStatus.SUPERSEDED_BY_ALTERATION]: [],
};

// Statuses a caller may set directly through voucher create/update. APPROVED,
// POSTED, REVERSED and SUPERSEDED_BY_ALTERATION are only reachable through the
// guarded transition actions below, never through a freeform payload.
export const DIRECTLY_SETTABLE_STATUSES: VoucherEntryStatus[] = [
  VoucherEntryStatus.DRAFT,
  VoucherEntryStatus.PENDING,
  VoucherEntryStatus.REJECTED,
  VoucherEntryStatus.CANCELLED,
];

interface VoucherLineLike {
  debit: number;
  credit: number;
}

interface VoucherLike {
  id: string;
  tenantId: string;
  companyId: string;
  workspaceId: string;
  voucherNumber: string;
  status: VoucherEntryStatus;
  voucherType: VoucherEntryType;
  documentKind: string | null;
  workflowOrigin: VoucherWorkflowOrigin;
}

@Injectable()
export class PostingEngineService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(InventoryService) private readonly inventoryService: InventoryService,
  ) {}

  assertBalanced(lines: VoucherLineLike[], context = "voucher") {
    const totalDebit = sumMoney(lines.map((line) => line.debit));
    const totalCredit = sumMoney(lines.map((line) => line.credit));

    if (toPaisa(totalDebit) !== toPaisa(totalCredit)) {
      throw new BadRequestException(
        `Unbalanced ${context}: total debit ${totalDebit.toFixed(2)} does not equal total credit ${totalCredit.toFixed(2)}`,
      );
    }
  }

  /** Normalizes every persisted voucher line to the same precision validated above. */
  normalizeLines<T extends VoucherLineLike>(lines: T[]): T[] {
    return normalizeBalancedMoneyLines(lines);
  }

  /**
   * Enforces that each supplied Account id points at an existing, active,
   * LEDGER-level account in the caller's company. Posting transitions separately
   * require an id on every non-zero line; optional money-account classification
   * is verified from immutable COA ancestry codes or account tags.
   */
  async assertPostableAccounts(
    companyId: string,
    lines: Array<{ accountId?: string | null; moneyAccountType?: string | null }>,
    client: Pick<PrismaService, "account"> = this.prisma,
  ) {
    const accountIds = [...new Set(lines.map((line) => line.accountId).filter((id): id is string => Boolean(id)))];
    if (!accountIds.length) {
      return;
    }

    const accounts = await client.account.findMany({ where: { id: { in: accountIds } } });
    const accountsById = new Map(accounts.map((account) => [account.id, account]));

    for (const accountId of accountIds) {
      const account = accountsById.get(accountId);
      if (!account || account.companyId !== companyId || account.level !== "LEDGER" || account.status !== "ACTIVE") {
        throw new BadRequestException("Posting is allowed only to an active Ledger account.");
      }
    }

    const typedLines = lines.filter((line) => line.accountId && line.moneyAccountType);
    if (!typedLines.length) return;
    const allAccounts = await client.account.findMany({ where: { companyId } });
    const byId = new Map(allAccounts.map((account) => [account.id, account]));
    for (const line of typedLines) {
      let current = byId.get(line.accountId!);
      const visited = new Set<string>();
      let actualType: "CASH" | "BANK" | "MFS" | null = null;
      const taggedKind = (current?.bankDetails as Record<string, unknown> | null)?.accountKind;
      if (taggedKind === "BANK" || taggedKind === "MFS") actualType = taggedKind;
      while (!actualType && current && !visited.has(current.id)) {
        visited.add(current.id);
        // Fixed COA category codes are immutable; captions are display text and
        // may be translated or renamed. Use ancestry identity, never a name, to
        // classify an Account selected for a money line.
        if (current.code === "1221000") { actualType = "CASH"; break; }
        if (current.code === "1222100") { actualType = "BANK"; break; }
        if (current.code === "1222200") { actualType = "MFS"; break; }
        current = current.parentId ? byId.get(current.parentId) : undefined;
      }
      if (actualType !== line.moneyAccountType) {
        throw new BadRequestException(`Selected ledger is not a valid ${line.moneyAccountType} money account.`);
      }
    }
  }

  assertDirectlySettable(status: VoucherEntryStatus) {
    if (!DIRECTLY_SETTABLE_STATUSES.includes(status)) {
      throw new BadRequestException(
        `Voucher status "${status}" cannot be set directly. Submit the voucher for approval, then use the approve action to post it.`,
      );
    }
  }

  assertEditable(status: VoucherEntryStatus) {
    if (!DIRECTLY_SETTABLE_STATUSES.includes(status) || status === VoucherEntryStatus.CANCELLED) {
      throw new BadRequestException(
        `A ${status.toLowerCase()} voucher cannot be edited in place. Approved/posted vouchers must be reversed, never overwritten.`,
      );
    }
  }

  /** Rebuilds the inventory side of an Owner-authorised posted-voucher edit.
   * The delete and re-post happen in one serializable transaction, so a failed
   * stock validation restores the previous movements instead of leaving a
   * partially updated stock ledger. */
  async repostVoucherMovements(currentUser: AuthenticatedRequestUser, voucherId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.stockMovement.deleteMany({ where: { transactionId: voucherId } });
      await this.inventoryService.postVoucherMovements(tx, voucherId, currentUser.id);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async findByIdempotencyKey(workspaceId: string, idempotencyKey?: string | null) {
    if (!idempotencyKey) {
      return null;
    }

    return this.prisma.voucherEntry.findUnique({
      where: { workspaceId_idempotencyKey: { workspaceId, idempotencyKey } },
      include: { lines: true, inventoryItems: { include: { inventoryItem: true, warehouse: true } }, warehouse: true },
    });
  }

  private async loadVoucher(voucherId: string): Promise<VoucherLike> {
    const voucher = await this.prisma.voucherEntry.findUnique({
      where: { id: voucherId },
      select: {
        id: true,
        tenantId: true,
        companyId: true,
        workspaceId: true,
        voucherNumber: true,
        status: true,
        voucherType: true,
        documentKind: true,
        workflowOrigin: true,
      },
    });

    if (!voucher) {
      throw new NotFoundException("Voucher not found");
    }

    return voucher;
  }

  async transitionStatus(currentUser: AuthenticatedRequestUser, voucherId: string, targetStatus: VoucherEntryStatus) {
    const voucher = await this.loadVoucher(voucherId);
    if (voucher.status === targetStatus) {
      return this.prisma.voucherEntry.findUniqueOrThrow({
        where: { id: voucherId },
        include: { lines: true, inventoryItems: { include: { inventoryItem: true, warehouse: true } }, warehouse: true },
      });
    }
    const allowedTargets = ALLOWED_STATUS_TRANSITIONS[voucher.status] ?? [];

    if (!allowedTargets.includes(targetStatus)) {
      throw new BadRequestException(`Cannot move voucher from ${voucher.status} to ${targetStatus}`);
    }

    // A legacy/recycled draft may have been created before account ids became
    // mandatory. It remains readable, but it must be edited through the normal
    // voucher binder before it can enter the approval/posting pipeline.
    if (
      targetStatus === VoucherEntryStatus.PENDING
      || targetStatus === VoucherEntryStatus.APPROVED
      || targetStatus === VoucherEntryStatus.POSTED
    ) {
      const persistedLines = await this.prisma.voucherEntryLine.findMany({
        where: { voucherId },
        select: { accountId: true, debit: true, credit: true },
      });
      const missingIdentity = persistedLines.find(
        (line) => (Number(line.debit) !== 0 || Number(line.credit) !== 0) && !line.accountId,
      );
      if (missingIdentity) {
        throw new BadRequestException("Every non-zero voucher line must be linked to a Chart of Accounts ledger before approval or posting");
      }
      await this.assertPostableAccounts(voucher.companyId, persistedLines);
    }

    // A purchase order that already has a receipt note, or a receipt note that already
    // has a bill, cannot be cancelled out from under that downstream document — it would
    // leave a live bill or receipt note pointing at a cancelled source with nothing to
    // explain where the goods or the money actually came from.
    if (targetStatus === VoucherEntryStatus.CANCELLED) {
      const downstreamDocument = await this.prisma.voucherEntry.findFirst({
        where: { sourceVoucherId: voucherId, status: { not: VoucherEntryStatus.CANCELLED } },
        select: { voucherNumber: true, documentKind: true, voucherType: true },
      });

      if (downstreamDocument) {
        const downstreamLabel =
          downstreamDocument.documentKind === "bill" ? "purchase bill" : downstreamDocument.voucherType === "DEBIT_NOTE" ? "purchase return" : "receipt note";
        throw new BadRequestException(
          `Cannot cancel: ${downstreamLabel} ${downstreamDocument.voucherNumber} was already raised against this document. Cancel that first.`,
        );
      }
    }

    const data: Prisma.VoucherEntryUpdateInput = { status: targetStatus };

    if (targetStatus === VoucherEntryStatus.APPROVED || targetStatus === VoucherEntryStatus.POSTED) {
      data.approvedByUserId = currentUser.id;
      data.approvedAt = new Date();
    }

    if (targetStatus === VoucherEntryStatus.POSTED) {
      data.postedAt = new Date();
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (targetStatus === VoucherEntryStatus.POSTED) {
        // Serialize the final status/line snapshot with every nested voucher
        // edit. The preflight above gives fast feedback, while this row lock +
        // transaction-local revalidation is the actual posting boundary: an
        // Account id cannot be removed, changed to another company/category,
        // or deactivated between validation and stock/GL posting.
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "VoucherEntry" WHERE "id" = ${voucherId} FOR UPDATE`,
        );
        const current = await tx.voucherEntry.findUniqueOrThrow({
          where: { id: voucherId },
          select: {
            status: true,
            companyId: true,
            voucherType: true,
            documentKind: true,
            workflowOrigin: true,
          },
        });
        if (current.status !== voucher.status) throw new BadRequestException("Voucher status changed; refresh and try again");
        const currentLines = await tx.voucherEntryLine.findMany({
          where: { voucherId },
          select: { accountId: true, debit: true, credit: true },
        });
        if (currentLines.some(
          (line) => (Number(line.debit) !== 0 || Number(line.credit) !== 0) && !line.accountId,
        )) {
          throw new BadRequestException(
            "Every non-zero voucher line must be linked to a Chart of Accounts ledger before posting",
          );
        }
        await this.assertPostableAccounts(current.companyId, currentLines, tx);
        if (
          current.voucherType === VoucherEntryType.SALES &&
          current.workflowOrigin === VoucherWorkflowOrigin.ORDER_FLOW &&
          !["quotation", "proforma", "sale-order", "delivery-note"].includes(current.documentKind ?? "")
        ) {
          await assertPersistedOrderFlowSalesInvoiceAllocation(tx, voucherId);
        }
        await this.inventoryService.postVoucherMovements(tx, voucherId, currentUser.id);
      }
      return tx.voucherEntry.update({ where: { id: voucherId }, data, include: { lines: true, inventoryItems: { include: { inventoryItem: true, warehouse: true } }, warehouse: true } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await this.auditService.log({
      tenantId: voucher.tenantId,
      companyId: voucher.companyId,
      workspaceId: voucher.workspaceId,
      userId: currentUser.id,
      action: `VOUCHER_${targetStatus}`,
      entityType: "VoucherEntry",
      entityId: voucher.id,
      oldValues: { status: voucher.status, voucherNumber: voucher.voucherNumber },
      newValues: { status: targetStatus, voucherNumber: voucher.voucherNumber },
    });

    return updated;
  }

  /** Reverses a POSTED voucher: preserves the original (marks it REVERSED) and posts a
   * mirror-image voucher with debit/credit swapped on every line. Never mutates the
   * original's lines. Calling this twice on the same voucher returns the existing
   * reversal instead of creating a second one. */
  async reverseVoucher(currentUser: AuthenticatedRequestUser, voucherId: string, reason?: string) {
    return this.prisma.$transaction(async (tx) => {
      const original = await tx.voucherEntry.findUnique({
        where: { id: voucherId },
        include: { lines: true },
      });

      if (!original) {
        throw new NotFoundException("Voucher not found");
      }

      if (original.status !== VoucherEntryStatus.POSTED) {
        throw new BadRequestException("Only posted vouchers can be reversed");
      }

      const existingReversal = await tx.voucherEntry.findFirst({
        where: { reversalOfId: original.id },
      });

      if (existingReversal) {
        return existingReversal;
      }

      // A reversal is a new posting, so every value-bearing line must retain
      // the immutable Account identity captured by the original voucher. Never
      // rediscover it from the historical `ledger` caption: captions can be
      // renamed or duplicated. Inactive ledgers remain valid for reversal, but
      // the id must still be a LEDGER in the same company.
      const valueLines = original.lines.filter(
        (line) => toPaisa(line.debit) !== 0n || toPaisa(line.credit) !== 0n,
      );
      if (valueLines.some((line) => !line.accountId)) {
        throw new BadRequestException(
          "This legacy voucher cannot be reversed until every non-zero line has a Chart of Accounts ledger ID.",
        );
      }
      const accountIds = [...new Set(valueLines.map((line) => line.accountId!))];
      const ownedLedgers = accountIds.length
        ? await tx.account.findMany({
            where: {
              companyId: original.companyId,
              id: { in: accountIds },
              level: "LEDGER",
            },
            select: { id: true },
          })
        : [];
      if (ownedLedgers.length !== accountIds.length) {
        throw new BadRequestException(
          "A voucher line references a missing or foreign Chart of Accounts ledger and cannot be reversed.",
        );
      }

      const now = new Date();
      await this.inventoryService.reverseVoucherMovements(tx, original.id, currentUser.id);
      const normalizedLines = this.normalizeLines(original.lines.map((line) => ({
        ...line,
        debit: Number(line.credit),
        credit: Number(line.debit),
      })));
      const reversalDebit = sumMoney(normalizedLines.map((line) => line.debit));
      const reversalCredit = sumMoney(normalizedLines.map((line) => line.credit));
      this.assertBalanced(normalizedLines, `reversal of ${original.voucherNumber}`);
      const reversal = await tx.voucherEntry.create({
        data: {
          tenantId: original.tenantId,
          companyId: original.companyId,
          workspaceId: original.workspaceId,
          createdByUserId: currentUser.id,
          voucherType: original.voucherType,
          workflowOrigin: original.workflowOrigin,
          // Without this, every reversal defaults to documentKind: null — which
          // list screens treat as "a plain Invoice/Bill" — so a reversed Sale
          // Order, Delivery Note, Quotation, etc. would misclassify into the
          // wrong list under its original document's own number. sourceVoucherId
          // is deliberately NOT copied: several list screens compute "how much of
          // the source has already been delivered/received/billed" by summing
          // POSTED documents linked via sourceVoucherId, and this reversal is
          // itself POSTED — copying the link would double-count the very amount
          // this reversal exists to undo.
          documentKind: original.documentKind,
          voucherNumber: `${original.voucherNumber}-REV`,
          voucherDate: now,
          partyName: original.partyName,
          partyId: original.partyId,
          reference: original.voucherNumber,
          narration: reason ? `Reversal of ${original.voucherNumber}: ${reason}` : `Reversal of ${original.voucherNumber}`,
          status: VoucherEntryStatus.POSTED,
          settlementMode: original.settlementMode,
          currency: original.currency,
          totalAmount: roundMoney(original.totalAmount),
          debit: reversalDebit,
          credit: reversalCredit,
          sourceType: original.sourceType,
          sourceId: original.sourceId,
          fiscalYearId: original.fiscalYearId,
          branchId: original.branchId,
          reversalOfId: original.id,
          approvedByUserId: currentUser.id,
          approvedAt: now,
          postedAt: now,
          lines: {
            create: normalizedLines.map((line) => ({
              accountId: line.accountId,
              ledger: line.ledger,
              description: line.description ? `Reversal: ${line.description}` : "Reversal",
              debit: line.debit,
              credit: line.credit,
              costCenter: line.costCenter,
              project: line.project,
              billReference: line.billReference,
            })),
          },
        },
        include: { lines: true, inventoryItems: { include: { inventoryItem: true, warehouse: true } }, warehouse: true },
      });

      await tx.voucherEntry.update({
        where: { id: original.id },
        data: { status: VoucherEntryStatus.REVERSED },
      });

      await this.auditService.log({
        tenantId: original.tenantId,
        companyId: original.companyId,
        workspaceId: original.workspaceId,
        userId: currentUser.id,
        action: "VOUCHER_REVERSED",
        entityType: "VoucherEntry",
        entityId: original.id,
        oldValues: { status: VoucherEntryStatus.POSTED, voucherNumber: original.voucherNumber },
        newValues: {
          status: VoucherEntryStatus.REVERSED,
          voucherNumber: original.voucherNumber,
          reversalVoucherId: reversal.id,
          reason: reason ?? null,
        },
      });

      return reversal;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
