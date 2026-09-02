import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { Prisma, VoucherEntryStatus } from "../generated/prisma/index.js";

import { buildTrialBalance } from "../accounting/accounting.utils.js";
import { roundMoney } from "../accounting/money.util.js";
import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { readMovingAverageCosts } from "../inventory/moving-average.js";

const includedVoucherRelations = {
  warehouse: true,
  lines: true,
  inventoryItems: {
    include: {
      inventoryItem: true,
      warehouse: true,
    },
  },
} satisfies Prisma.VoucherEntryInclude;

const auditAmountFormatter = new Intl.NumberFormat("en-BD", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

@Injectable()
export class ReportsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getTrialBalance(currentUser: AuthenticatedRequestUser, workspaceId?: string) {
    const targetWorkspaceId = workspaceId ?? currentUser.workspaceId;
    if (!targetWorkspaceId) {
      throw new ForbiddenException("No active workspace");
    }

    await this.ensureWorkspaceAccess(currentUser, targetWorkspaceId);
    const [entries, accounts] = await Promise.all([
      this.prisma.voucherEntry.findMany({
        where: {
          workspaceId: targetWorkspaceId,
          // Reversal keeps the original as REVERSED and posts a mirror voucher.
          // Loading only POSTED would retain the negative mirror while dropping
          // the original, corrupting every current Trial Balance derived from it.
          status: { in: [VoucherEntryStatus.POSTED, VoucherEntryStatus.REVERSED] },
        },
        include: includedVoucherRelations,
        orderBy: [{ voucherDate: "asc" }, { createdAt: "asc" }],
      }),
      this.prisma.account.findMany({
        where: { companyId: currentUser.companyId },
        select: {
          id: true,
          code: true,
          name: true,
          nature: true,
          parentId: true,
          bankDetails: true,
          accountGroup: { select: { code: true } },
        },
      }),
    ]);

    return buildTrialBalance(entries, accounts);
  }

  async getClosingStock(currentUser: AuthenticatedRequestUser, workspaceId?: string) {
    const targetWorkspaceId = workspaceId ?? currentUser.workspaceId;
    if (!targetWorkspaceId) {
      throw new ForbiddenException("No active workspace");
    }

    await this.ensureWorkspaceAccess(currentUser, targetWorkspaceId);
    const [items, valuation] = await Promise.all([
      this.prisma.inventoryItem.findMany({
        where: { workspaceId: targetWorkspaceId },
        orderBy: { itemName: "asc" },
      }),
      this.prisma.$transaction((tx) =>
        readMovingAverageCosts(tx, targetWorkspaceId),
      ),
    ]);
    const balanceByItem = new Map<string, { quantity: number; value: number }>();
    for (const balance of valuation.balances.values()) {
      const current = balanceByItem.get(balance.inventoryItemId) ?? { quantity: 0, value: 0 };
      current.quantity += balance.quantity;
      current.value += balance.value;
      balanceByItem.set(balance.inventoryItemId, current);
    }
    return items.filter((item) => {
      const balance = balanceByItem.get(item.id) ?? { quantity: 0, value: 0 };
      return item.status === "ACTIVE" || balance.quantity !== 0 || balance.value !== 0;
    }).map((item) => {
      const balance = balanceByItem.get(item.id) ?? { quantity: 0, value: 0 };
      return {
        item: item.itemName,
        closingQty: balance.quantity,
        unit: item.unit,
        rate: balance.quantity === 0 ? 0 : balance.value / balance.quantity,
        closingValue: roundMoney(balance.value),
      };
    });
  }

  async getUserActivityLog(currentUser: AuthenticatedRequestUser, workspaceId?: string) {
    const targetWorkspaceId = workspaceId ?? currentUser.workspaceId;
    if (targetWorkspaceId) {
      await this.ensureWorkspaceAccess(currentUser, targetWorkspaceId);
    }

    const rows = await this.prisma.auditLog.findMany({
      where: {
        companyId: currentUser.companyId,
        ...(targetWorkspaceId ? { OR: [{ workspaceId: targetWorkspaceId }, { workspaceId: null }] } : {}),
      },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      // Search happens in the report UI, so truncating this to 300 made older
      // same-day activity impossible to find after a busy session.
      take: 5000,
    });

    const voucherEntityIds = rows
      .filter((row) => row.entityType === "VoucherEntry")
      .map((row) => row.entityId);
    const vouchers = voucherEntityIds.length
      ? await this.prisma.voucherEntry.findMany({
          where: { id: { in: voucherEntityIds }, companyId: currentUser.companyId },
          select: {
            id: true,
            voucherNumber: true,
            reference: true,
            partyName: true,
            voucherType: true,
            inventoryItems: { select: { itemName: true, quantity: true } },
          },
        })
      : [];
    const voucherById = new Map(vouchers.map((voucher) => [voucher.id, voucher]));
    const accountEntityIds = rows.filter((row) => row.entityType === "Account").map((row) => row.entityId);
    const accounts = accountEntityIds.length
      ? await this.prisma.account.findMany({
          where: { id: { in: accountEntityIds }, companyId: currentUser.companyId },
          select: { id: true, name: true, code: true },
        })
      : [];
    const accountById = new Map(accounts.map((account) => [account.id, account]));

    const actorIds = [...new Set(rows.map((row) => row.userId).filter((id): id is string => Boolean(id)))];
    const assignedRoles = actorIds.length
      ? await this.prisma.userRole.findMany({
          where: {
            userId: { in: actorIds },
            OR: [
              ...(targetWorkspaceId ? [{ workspaceId: targetWorkspaceId }] : []),
              { workspaceId: null, companyId: currentUser.companyId },
            ],
          },
          include: { role: { select: { name: true } } },
          orderBy: { assignedAt: "desc" },
        })
      : [];
    const roleByUserId = new Map<string, string>();
    for (const assignment of assignedRoles) {
      if (!roleByUserId.has(assignment.userId)) roleByUserId.set(assignment.userId, assignment.role.name);
    }

    return rows.map((row) => {
      const formatted = this.formatAuditRow(row, accountById.get(row.entityId));
      const actorSnapshot = this.asRecord(this.asRecord(row.newValues)?._actor as Prisma.JsonValue);
      const role = String(actorSnapshot?.role ?? (row.userId ? roleByUserId.get(row.userId) : "") ?? "System");
      const voucher = voucherById.get(row.entityId);
      if (!voucher) return { ...formatted, role };
      const itemDetails = voucher.inventoryItems
        .slice(0, 4)
        .map((item) => `${item.itemName} x ${Number(item.quantity)}`)
        .join(", ");
      const remainingItemCount = Math.max(0, voucher.inventoryItems.length - 4);
      const existingDetails = formatted.details.toLowerCase();
      return {
        ...formatted,
        role,
        details: [
          formatted.details,
          voucher.partyName && !existingDetails.includes(`party: ${voucher.partyName}`.toLowerCase()) ? `party: ${voucher.partyName}` : null,
          voucher.voucherType && !existingDetails.includes("type:") ? `type: ${this.humanizeAction(String(voucher.voucherType))}` : null,
          voucher.reference && !existingDetails.includes(`reference: ${voucher.reference}`.toLowerCase()) ? `reference: ${voucher.reference}` : null,
          itemDetails ? `items: ${itemDetails}${remainingItemCount ? `, +${remainingItemCount} more` : ""}` : null,
        ].filter(Boolean).join(" — "),
      };
    });
  }

  async getLoginHistory(currentUser: AuthenticatedRequestUser, workspaceId?: string) {
    const targetWorkspaceId = workspaceId ?? currentUser.workspaceId;
    if (targetWorkspaceId) {
      await this.ensureWorkspaceAccess(currentUser, targetWorkspaceId);
    }

    const sessions = await this.prisma.userSession.findMany({
      where: { companyId: currentUser.companyId },
      include: { user: { select: { name: true } } },
      orderBy: { lastUsedAt: "desc" },
      // Automated API/test logins remain stored for auditing, but are filtered
      // from the interactive Login History below. Most-recently used ordering
      // keeps the current real session inside this bounded scan.
      take: 1000,
    });

    const seenLoginMinute = new Set<string>();
    const interactiveSessions = sessions
      .filter((session) => !this.isAutomationUserAgent(session.userAgent))
      .filter((session) => {
        // A client retry can create many sessions in the same second. Login
        // History presents one human-facing event per client/IP/minute while
        // preserving every raw session in the database.
        const minute = session.createdAt.toISOString().slice(0, 16);
        const key = `${session.userId}|${session.ipAddress ?? ""}|${session.userAgent ?? ""}|${minute}`;
        if (seenLoginMinute.has(key)) return false;
        seenLoginMinute.add(key);
        return true;
      })
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, 300);
    const userIds = [...new Set(interactiveSessions.map((session) => session.userId))];
    const [assignedRoles, tenantMembers] = await Promise.all([
      userIds.length
        ? this.prisma.userRole.findMany({
            where: {
              userId: { in: userIds },
              OR: [
                ...(targetWorkspaceId ? [{ workspaceId: targetWorkspaceId }] : []),
                { workspaceId: null, companyId: currentUser.companyId },
              ],
            },
            include: { role: { select: { name: true } } },
            orderBy: { assignedAt: "desc" },
          })
        : Promise.resolve([]),
      userIds.length
        ? this.prisma.tenantMember.findMany({
            where: { tenantId: currentUser.tenantId, userId: { in: userIds } },
            select: { userId: true, membershipRole: true },
          })
        : Promise.resolve([]),
    ]);
    const roleByUserId = new Map<string, string>();
    for (const assignment of assignedRoles) {
      if (!roleByUserId.has(assignment.userId)) roleByUserId.set(assignment.userId, assignment.role.name);
    }
    for (const member of tenantMembers) {
      if (!roleByUserId.has(member.userId)) {
        roleByUserId.set(member.userId, member.membershipRole === "OWNER" ? "Owner" : "Member");
      }
    }

    return interactiveSessions.map((session) => ({
      date: session.createdAt.toISOString(),
      user: session.user?.name ?? "Unknown user",
      role: roleByUserId.get(session.userId) ?? "Member",
      action: "Login",
      details: [
        this.describeLoginClient(session.userAgent),
        session.ipAddress
          ? this.isLoopbackAddress(session.ipAddress)
            ? `Local device (${session.ipAddress})`
            : `IP ${session.ipAddress}`
          : null,
        session.revokedAt ? `Logged out ${session.revokedAt.toISOString()}` : "Active session",
      ]
        .filter(Boolean)
        .join(" · "),
    }));
  }

  async getDeletedTransactions(currentUser: AuthenticatedRequestUser, workspaceId?: string) {
    const targetWorkspaceId = workspaceId ?? currentUser.workspaceId;
    if (!targetWorkspaceId) {
      throw new ForbiddenException("No active workspace");
    }

    await this.ensureWorkspaceAccess(currentUser, targetWorkspaceId);
    const rows = await this.prisma.auditLog.findMany({
      where: {
        companyId: currentUser.companyId,
        OR: [{ workspaceId: targetWorkspaceId }, { workspaceId: null }],
        action: { endsWith: "_DELETED" },
      },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 300,
    });

    const deletedVoucherIds = rows
      .filter((row) => row.entityType === "VoucherEntry")
      .map((row) => row.entityId);
    const recycleBinEntries = deletedVoucherIds.length
      ? await this.prisma.recycleBinEntry.findMany({
          where: { companyId: currentUser.companyId, entityId: { in: deletedVoucherIds } },
          select: { entityId: true, refNo: true, partyName: true, txnType: true, amount: true, transactionDate: true },
        })
      : [];
    const recycleBinByEntityId = new Map(recycleBinEntries.map((entry) => [entry.entityId, entry]));

    return rows.map((row) => {
      const deleted = recycleBinByEntityId.get(row.entityId);
      return this.formatAuditRow(row, deleted
        ? {
            voucherNumber: deleted.refNo ?? undefined,
            partyName: deleted.partyName,
            voucherType: deleted.txnType,
            totalAmount: Number(deleted.amount),
            voucherDate: deleted.transactionDate.toISOString(),
          }
        : undefined);
    });
  }

  async getEditedTransactions(currentUser: AuthenticatedRequestUser, workspaceId?: string) {
    const targetWorkspaceId = workspaceId ?? currentUser.workspaceId;
    if (!targetWorkspaceId) {
      throw new ForbiddenException("No active workspace");
    }

    await this.ensureWorkspaceAccess(currentUser, targetWorkspaceId);
    const rows = await this.prisma.auditLog.findMany({
      where: {
        companyId: currentUser.companyId,
        AND: [
          { OR: [{ workspaceId: targetWorkspaceId }, { workspaceId: null }] },
          { OR: [
            { action: { endsWith: "_UPDATED" } },
            { action: { endsWith: "_REPARENTED" } },
            { action: { endsWith: "_ACTIVATED" } },
            { action: { endsWith: "_DEACTIVATED" } },
          ] },
        ],
      },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });

    return rows
      .filter((row) => this.hasMaterialAuditChange(row.oldValues, row.newValues))
      .slice(0, 300)
      .map((row) => this.formatAuditRow(row));
  }

  async getApprovalHistory(currentUser: AuthenticatedRequestUser, workspaceId?: string) {
    const targetWorkspaceId = workspaceId ?? currentUser.workspaceId;
    if (!targetWorkspaceId) {
      throw new ForbiddenException("No active workspace");
    }

    await this.ensureWorkspaceAccess(currentUser, targetWorkspaceId);
    const rows = await this.prisma.auditLog.findMany({
      where: {
        workspaceId: targetWorkspaceId,
        entityType: "VoucherEntry",
        action: { in: ["VOUCHER_PENDING", "VOUCHER_APPROVED", "VOUCHER_POSTED", "VOUCHER_REJECTED", "VOUCHER_CANCELLED", "VOUCHER_REVERSED"] },
      },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 300,
    });

    const reversalIds = rows
      .map((row) => this.asRecord(row.newValues)?.reversalVoucherId)
      .filter((id): id is string => typeof id === "string");
    const reversalVouchers = reversalIds.length
      ? await this.prisma.voucherEntry.findMany({
          where: { id: { in: reversalIds }, companyId: currentUser.companyId },
          select: { id: true, voucherNumber: true },
        })
      : [];
    const reversalNumberById = new Map(reversalVouchers.map((voucher) => [voucher.id, voucher.voucherNumber]));

    return rows.map((row) => {
      const reversalId = this.asRecord(row.newValues)?.reversalVoucherId;
      return this.formatAuditRow(row, undefined, typeof reversalId === "string" ? reversalNumberById.get(reversalId) : undefined);
    });
  }

  private formatAuditRow(row: {
    createdAt: Date;
    user: { name: string } | null;
    action: string;
    entityType: string;
    entityId: string;
    oldValues: Prisma.JsonValue;
    newValues: Prisma.JsonValue;
  }, resolvedEntity?: { name?: string; code?: string; voucherNumber?: string; partyName?: string; voucherType?: string; totalAmount?: number; voucherDate?: string }, relatedVoucherNumber?: string) {
    const actorSnapshot = this.asRecord(this.asRecord(row.newValues)?._actor as Prisma.JsonValue);
    return {
      date: row.createdAt.toISOString(),
      user: row.user?.name ?? "System",
      role: typeof actorSnapshot?.role === "string" ? actorSnapshot.role : undefined,
      action: this.humanizeAction(row.action),
      details: this.buildAuditDetails(row.entityType, row.entityId, row.oldValues, row.newValues, resolvedEntity, relatedVoucherNumber),
    };
  }

  private humanizeAction(action: string) {
    const businessLabels: Record<string, string> = {
      SALES_INVOICE_RESET_DELETED: "Sales Invoice Deleted",
      VOUCHER_PENDING: "Voucher Submitted",
    };
    if (businessLabels[action]) return businessLabels[action];
    return action
      .toLowerCase()
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  private buildAuditDetails(
    entityType: string,
    _entityId: string,
    oldValues: Prisma.JsonValue,
    newValues: Prisma.JsonValue,
    resolvedEntity?: { name?: string; code?: string; voucherNumber?: string; partyName?: string; voucherType?: string; totalAmount?: number; voucherDate?: string },
    relatedVoucherNumber?: string,
  ) {
    const oldObject = this.asRecord(oldValues);
    const newObject = this.asRecord(newValues);
    const voucherNumber = (newObject?.voucherNumber ?? oldObject?.voucherNumber ?? resolvedEntity?.voucherNumber) as string | undefined;
    const name = (newObject?.name ?? oldObject?.name ?? newObject?.itemName ?? oldObject?.itemName ?? resolvedEntity?.name) as string | undefined;
    const code = (newObject?.code ?? oldObject?.code ?? resolvedEntity?.code) as string | undefined;
    const level = (newObject?.level ?? oldObject?.level) as string | undefined;
    const status = newObject?.status as string | undefined;
    const oldStatus = oldObject?.status as string | undefined;
    const totalAmount = (newObject?.totalAmount ?? oldObject?.totalAmount ?? resolvedEntity?.totalAmount) as number | undefined;
    const reason = (newObject?.reason ?? oldObject?.reason) as string | undefined;
    const deletedVoucherIds = oldObject?.deletedVoucherIds;
    const partyName = (newObject?.partyName ?? oldObject?.partyName ?? resolvedEntity?.partyName) as string | undefined;
    const voucherType = (newObject?.voucherType ?? oldObject?.voucherType ?? resolvedEntity?.voucherType) as string | undefined;
    const voucherDate = (newObject?.voucherDate ?? oldObject?.voucherDate ?? resolvedEntity?.voucherDate) as string | undefined;
    const reference = (newObject?.reference ?? oldObject?.reference) as string | undefined;
    const entityLabel = entityType === "VoucherEntry" ? "Voucher" : this.humanizeAuditField(entityType);

    const parts: string[] = [];
    parts.push(
      voucherNumber
        ? `${entityLabel} ${voucherNumber}`
        : name
          ? `${entityLabel} ${name}${code ? ` (${code})` : ""}`
          : `${entityLabel} record`,
    );
    if (level) {
      parts.push(`level: ${this.humanizeAction(level)}`);
    }
    if (status) {
      parts.push(oldStatus && oldStatus !== status ? `status: ${this.humanizeAction(oldStatus)} to ${this.humanizeAction(status)}` : `status: ${this.humanizeAction(status)}`);
    } else if (oldStatus) {
      parts.push(`previous status: ${this.humanizeAction(oldStatus)}`);
    }
    if (typeof totalAmount === "number") {
      parts.push(`amount: ${auditAmountFormatter.format(totalAmount)}`);
    }
    if (partyName) parts.push(`party: ${partyName}`);
    if (voucherType) parts.push(`type: ${this.humanizeAction(voucherType)}`);
    if (voucherDate) parts.push(`date: ${voucherDate.slice(0, 10)}`);
    if (reference && reference !== voucherNumber) parts.push(`reference: ${reference}`);
    if (reason) {
      parts.push(`reason: ${reason}`);
    }
    if (Array.isArray(deletedVoucherIds)) {
      parts.push(`records removed: ${deletedVoucherIds.length}`);
    }
    const reversalVoucherId = newObject?.reversalVoucherId;
    if (typeof reversalVoucherId === "string") {
      parts.push(`reversal voucher: ${relatedVoucherNumber ?? reversalVoucherId}`);
    }

    if (oldObject && newObject) {
      const ignoredFields = new Set(["_actor", "voucherNumber", "name", "itemName", "code", "level", "status", "totalAmount", "reason", "deletedVoucherIds", "reversalVoucherId"]);
      const changedFields = [...new Set([...Object.keys(oldObject), ...Object.keys(newObject)])]
        .filter((key) => !ignoredFields.has(key))
        .filter((key) => JSON.stringify(oldObject[key]) !== JSON.stringify(newObject[key]))
        // Workflow settings store the same selection as stable serials and as
        // display codes. Prefer serials so a user sees one concise change.
        .filter((key, _index, fields) => key !== "hiddenStepCodes" || !fields.includes("hiddenStepSerials"));
      for (const key of changedFields) {
        parts.push(`${this.humanizeAuditField(key)}: ${this.formatAuditFieldValue(key, oldObject[key])} to ${this.formatAuditFieldValue(key, newObject[key])}`);
      }
      if (oldObject.name !== undefined && newObject.name !== undefined && oldObject.name !== newObject.name) {
        parts.push(`Name: ${this.formatAuditValue(oldObject.name)} to ${this.formatAuditValue(newObject.name)}`);
      }
    }

    return parts.join(" — ");
  }

  private hasMaterialAuditChange(oldValues: Prisma.JsonValue, newValues: Prisma.JsonValue) {
    const oldObject = this.asRecord(oldValues);
    const newObject = this.asRecord(newValues);
    if (!oldObject || !newObject) return true;
    const withoutMetadata = (value: Record<string, unknown>) => Object.fromEntries(
      Object.entries(value).filter(([key]) => key !== "_actor"),
    );
    return JSON.stringify(withoutMetadata(oldObject)) !== JSON.stringify(withoutMetadata(newObject));
  }

  private humanizeAuditField(field: string) {
    if (field === "hiddenStepCodes" || field === "hiddenStepSerials") return "Hidden Steps";
    if (field === "presentationOnly") return "Presentation Mode";
    const spaced = field
      .replace(/[_-]+/g, " ")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .trim()
      .toLowerCase();
    return spaced.replace(/\b\w/g, (character) => character.toUpperCase());
  }

  private formatAuditFieldValue(field: string, value: unknown) {
    if (Array.isArray(value)) {
      if (value.length === 0) return "None";
      if (field === "hiddenStepCodes" || field === "hiddenStepSerials") {
        return `${value.length} hidden step${value.length === 1 ? "" : "s"}`;
      }
      if (value.length <= 3 && value.every((entry) => entry === null || ["string", "number", "boolean"].includes(typeof entry))) {
        return value.map((entry) => this.formatAuditValue(entry)).join(", ");
      }
      return `${value.length} item${value.length === 1 ? "" : "s"}`;
    }

    if (value && typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length === 0) return "None";
      if (entries.length <= 3 && entries.every(([, entry]) => entry === null || ["string", "number", "boolean"].includes(typeof entry))) {
        return entries
          .map(([key, entry]) => `${this.humanizeAuditField(key)}: ${this.formatAuditValue(entry)}`)
          .join(", ");
      }
      return `${entries.length} field${entries.length === 1 ? "" : "s"}`;
    }

    if (typeof value === "string" && /^[A-Z][A-Z0-9_]*$/.test(value)) {
      return this.humanizeAction(value);
    }
    return this.formatAuditValue(value);
  }

  private formatAuditValue(value: unknown) {
    if (value === null || value === undefined || value === "") return "None";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "number") return auditAmountFormatter.format(value);
    if (Array.isArray(value)) return value.length ? `${value.length} item${value.length === 1 ? "" : "s"}` : "None";
    if (typeof value === "object") {
      const fieldCount = Object.keys(value).length;
      return fieldCount ? `${fieldCount} field${fieldCount === 1 ? "" : "s"}` : "None";
    }
    const text = String(value).replace(/\s+/g, " ").trim();
    return text.length > 160 ? `${text.slice(0, 157)}...` : text;
  }

  private isAutomationUserAgent(userAgent: string | null) {
    if (!userAgent) return true;
    return /(powershell|curl|wget|postmanruntime|insomnia|node-fetch|axios|undici|python-requests|headlesschrome|claude\/|worklog-ultra)/i.test(userAgent);
  }

  private describeLoginClient(userAgent: string | null) {
    if (!userAgent) return "Unknown client";
    const browser = /electron/i.test(userAgent)
      ? "Desktop app"
      : /edg\//i.test(userAgent)
        ? "Microsoft Edge"
        : /chrome\//i.test(userAgent)
          ? "Google Chrome"
          : /firefox\//i.test(userAgent)
            ? "Mozilla Firefox"
            : /safari\//i.test(userAgent)
              ? "Safari"
              : "Browser";
    const platform = /windows/i.test(userAgent)
      ? "Windows"
      : /android/i.test(userAgent)
        ? "Android"
        : /(iphone|ipad|ios)/i.test(userAgent)
          ? "iOS"
          : /(macintosh|mac os)/i.test(userAgent)
            ? "macOS"
            : /linux/i.test(userAgent)
              ? "Linux"
              : "Unknown device";
    return `${browser} on ${platform}`;
  }

  private isLoopbackAddress(ipAddress: string) {
    return ipAddress === "127.0.0.1" || ipAddress === "::1" || ipAddress === "::ffff:127.0.0.1";
  }

  private asRecord(value: Prisma.JsonValue): Record<string, unknown> | null {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return null;
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
}
