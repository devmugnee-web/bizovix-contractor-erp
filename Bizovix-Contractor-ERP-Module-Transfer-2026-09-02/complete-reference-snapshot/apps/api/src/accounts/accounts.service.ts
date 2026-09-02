import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { AccountLevel, Prisma, VoucherEntryStatus, VoucherEntryType } from "../generated/prisma/index.js";

import { AuditService } from "../audit/audit.service.js";
import { roundMoney, sumMoney, toPaisa } from "../accounting/money.util.js";
import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import { accountCategorySeeds, systemAccountSeeds } from "../platform/bootstrap/defaults.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { pickCategoryCode, pickLedgerCode, pickMainCategoryCode } from "./account-code.util.js";
import type { CreateAccountDto } from "./dto/create-account.dto.js";
import type { CreateExpenseLedgerDto } from "./dto/create-expense-ledger.dto.js";
import type { CreateLedgerItemDto } from "./dto/create-ledger-item.dto.js";
import type { ReparentAccountDto } from "./dto/reparent-account.dto.js";
import type { SetAccountStatusDto } from "./dto/set-account-status.dto.js";
import type { UpdateAccountDto } from "./dto/update-account.dto.js";
import type { UpdateLedgerItemDto } from "./dto/update-ledger-item.dto.js";

// Standard chart-of-accounts numbering (see platform/bootstrap/defaults.ts, systemAccountSeeds):
// 1000s assets, 2000s liabilities, 3000s equity, 4000s income, 5000s expense (both expense
// natures share the same block, matching how the seeded expense ledgers are numbered 5010-5090).
// Legacy fallback only — used when the positional scheme can't apply yet (see suggestPositionalCode).
const NATURE_CODE_BLOCK: Record<string, number> = {
  ASSET: 1,
  LIABILITY: 2,
  EQUITY: 3,
  INCOME: 4,
  DIRECT_EXPENSE: 5,
  INDIRECT_EXPENSE: 5,
};

// Every code the protected Chart of Accounts owns (platform/bootstrap/defaults.ts).
// A company created before a protected seed was added does not carry that row yet,
// so the positional counter happily handed its code to the next user-created
// ledger - a manual ledger under category 1232000 became 1232001, the code
// reserved for "Inventory Delivered Pending Invoice". The protected-ledger guards
// then reject that row (isSystem=false) and every inventory/stock-ledger read
// fails with a 400, which takes the whole Reports workspace down with it.
// Treating the seed codes as permanently taken keeps user accounts off them even
// before the seed row itself exists in this company.
const RESERVED_SEED_CODES: readonly string[] = [
  ...accountCategorySeeds.map((seed) => seed.code),
  ...systemAccountSeeds.map((seed) => seed.code),
];

function slugifyForCode(name: string) {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 24);
}

const BANK_DETAIL_FIELDS = [
  "bankName",
  "accountNumber",
  "accountHolderName",
  "branchName",
  "routingNumber",
  "swiftCode",
  "country",
  "rmName",
  "rmNumber",
  "note",
  // Which money-account bucket a ledger the user named themselves ("City Bank",
  // "bKash Merchant") belongs to. Both Bank and MFS sub-accounts are created as
  // LEDGER siblings under the same "Bank & MFS Accounts" category (a Ledger can't
  // contain children), so the category name alone can't tell them apart — this
  // explicit tag is what classifyMoneyAccount checks first.
  "accountKind",
] as const;

function normalizeBankDetails(value: Record<string, unknown> | null | undefined): Prisma.InputJsonValue | undefined {
  if (!value) return undefined;
  return Object.fromEntries(BANK_DETAIL_FIELDS.map((key) => [key, typeof value[key] === "string" ? value[key].trim() : ""]));
}

function isUniqueCodeConflict(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as { code?: unknown; meta?: { target?: unknown } };
  if (candidate.code !== "P2002") {
    return false;
  }

  const target = candidate.meta?.target;
  return Array.isArray(target) ? target.includes("code") : String(target ?? "").includes("code");
}

function isUniqueManagedRoleConflict(error: unknown) {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { code?: unknown; meta?: { target?: unknown } };
  if (candidate.code !== "P2002") return false;
  const target = candidate.meta?.target;
  return Array.isArray(target)
    ? target.includes("managedRole")
    : String(target ?? "").includes("managedRole");
}

type AccountRow = Prisma.AccountGetPayload<Record<string, never>>;

export interface AccountTreeNode extends AccountRow {
  children: AccountTreeNode[];
}

export type MoneyAccountType = "CASH" | "BANK" | "MFS";

export function classifyMoneyAccount(account: AccountRow, accountsById: Map<string, AccountRow>): MoneyAccountType | null {
  const taggedKind = (account.bankDetails as Record<string, unknown> | null)?.accountKind;
  if (taggedKind === "BANK" || taggedKind === "MFS") return taggedKind;

  let current: AccountRow | undefined = account;
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    // Fixed backbone codes are immutable; names are presentation data and may
    // be translated or renamed without changing this ledger's identity.
    if (current.code === "1221000") return "CASH";
    if (current.code === "1222100") return "BANK";
    if (current.code === "1222200") return "MFS";
    current = current.parentId ? accountsById.get(current.parentId) : undefined;
  }
  return null;
}

function toApi(account: AccountRow) {
  return {
    id: account.id,
    code: account.code,
    name: account.name,
    managedRole: account.managedRole,
    level: account.level,
    parentId: account.parentId,
    nature: account.nature,
    isSystem: account.isSystem,
    isControlAccount: account.isControlAccount,
    requiresItemDetails: account.requiresItemDetails,
    openingBalance: roundMoney(account.openingBalance),
    openingBalanceDate: account.openingBalanceDate?.toISOString().slice(0, 10) ?? null,
    openingBalanceSourceAccountId: account.openingBalanceSourceAccountId,
    openingBalanceSources: parseOpeningBalanceSources(account.openingBalanceSources),
    bankDetails: account.bankDetails,
    printOnInvoices: account.printOnInvoices,
    status: account.status,
    sortOrder: account.sortOrder,
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  };
}

function parseOpeningBalanceSources(value: Prisma.JsonValue | null | undefined): Array<{ accountId: string; amount: number }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return [];
    const accountId = String((row as Record<string, unknown>).accountId ?? "").trim();
    const amount = roundMoney((row as Record<string, unknown>).amount as number | string | null | undefined);
    return accountId && Number.isFinite(amount) && amount > 0 ? [{ accountId, amount }] : [];
  });
}

function isManagedPartyAccount(account: { bankDetails: Prisma.JsonValue | null }) {
  if (!account.bankDetails || typeof account.bankDetails !== "object" || Array.isArray(account.bankDetails)) return false;
  const tag = (account.bankDetails as Record<string, unknown>).partyMaster;
  return Boolean(tag && typeof tag === "object" && !Array.isArray(tag) && String((tag as Record<string, unknown>).partyId ?? ""));
}

function managedPartyId(account: { bankDetails: Prisma.JsonValue | null }) {
  if (!isManagedPartyAccount(account)) return null;
  const tag = (account.bankDetails as Record<string, unknown>).partyMaster as Record<string, unknown>;
  return String(tag.partyId);
}

type LedgerItemRow = Prisma.LedgerItemGetPayload<Record<string, never>>;

function toLedgerItemApi(item: LedgerItemRow) {
  return {
    id: item.id,
    accountId: item.accountId,
    name: item.name,
    unit: item.unit,
    sortOrder: item.sortOrder,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function buildTree(accounts: AccountRow[]): AccountTreeNode[] {
  const nodesById = new Map<string, AccountTreeNode>(accounts.map((account) => [account.id, { ...account, children: [] }]));
  const roots: AccountTreeNode[] = [];

  for (const node of nodesById.values()) {
    if (node.parentId && nodesById.has(node.parentId)) {
      nodesById.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortRecursive = (nodes: AccountTreeNode[]) => {
    nodes.sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
    nodes.forEach((node) => sortRecursive(node.children));
  };
  sortRecursive(roots);

  return roots;
}

function buildPath(account: AccountRow, accountsById: Map<string, AccountRow>): string {
  const segments: string[] = [];
  let current: AccountRow | undefined = account;
  while (current) {
    segments.unshift(current.name);
    current = current.parentId ? accountsById.get(current.parentId) : undefined;
  }
  return segments.join(" > ");
}

function collectAccountAndDescendantIds(accounts: AccountRow[], rootId: string): string[] {
  const childrenByParent = new Map<string, string[]>();
  for (const account of accounts) {
    if (!account.parentId) continue;
    const children = childrenByParent.get(account.parentId) ?? [];
    children.push(account.id);
    childrenByParent.set(account.parentId, children);
  }
  const ids: string[] = [];
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift()!;
    ids.push(id);
    queue.push(...(childrenByParent.get(id) ?? []));
  }
  return ids;
}

@Injectable()
export class AccountsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  async getTree(currentUser: AuthenticatedRequestUser, includeInactiveHistory = false) {
    const accounts = await this.prisma.account.findMany({
      where: { companyId: currentUser.companyId },
      orderBy: [{ level: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    });

    // A recycled Party must disappear from the normal COA hierarchy just as it
    // disappears from the Customer/Supplier master. Its inactive ledger remains
    // available through the explicit Inactive status search for audit/history.
    const visibleAccounts = includeInactiveHistory
      ? accounts
      : accounts.filter((account) => account.status === "ACTIVE" || !isManagedPartyAccount(account));
    return buildTree(visibleAccounts).map((node) => this.toTreeApi(node));
  }

  private toTreeApi(node: AccountTreeNode): unknown {
    return { ...toApi(node), children: node.children.map((child) => this.toTreeApi(child)) };
  }

  async search(currentUser: AuthenticatedRequestUser, query?: string, level?: string, status?: string) {
    const accounts = await this.prisma.account.findMany({
      where: {
        companyId: currentUser.companyId,
        level: level && level !== "all" ? (level as AccountLevel) : undefined,
        status: status && status !== "all" ? (status as "ACTIVE" | "INACTIVE") : undefined,
        OR: query
          ? [{ name: { contains: query, mode: "insensitive" } }, { code: { contains: query, mode: "insensitive" } }]
          : undefined,
      },
      orderBy: [{ level: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      take: 200,
    });

    const allAccounts = await this.prisma.account.findMany({ where: { companyId: currentUser.companyId } });
    const accountsById = new Map(allAccounts.map((account) => [account.id, account]));

    return accounts.map((account) => ({ ...toApi(account), path: buildPath(account, accountsById) }));
  }

  async getPostableLedgers(currentUser: AuthenticatedRequestUser) {
    const [ledgers, allAccounts] = await Promise.all([
      this.prisma.account.findMany({
        where: { companyId: currentUser.companyId, level: AccountLevel.LEDGER, status: "ACTIVE" },
        orderBy: { name: "asc" },
      }),
      this.prisma.account.findMany({ where: { companyId: currentUser.companyId } }),
    ]);

    const accountsById = new Map(allAccounts.map((account) => [account.id, account]));
    return ledgers.map((ledger) => ({ ...toApi(ledger), path: buildPath(ledger, accountsById) }));
  }

  async getMoneyAccounts(currentUser: AuthenticatedRequestUser, requestedType?: string) {
    const normalizedType = requestedType?.trim().toUpperCase();
    if (normalizedType && !["CASH", "BANK", "MFS"].includes(normalizedType)) {
      throw new BadRequestException("Money account type must be CASH, BANK, or MFS.");
    }

    const allAccounts = await this.prisma.account.findMany({
      where: { companyId: currentUser.companyId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    const accountsById = new Map(allAccounts.map((account) => [account.id, account]));

    const ledgerIds = allAccounts.filter((account) => account.level === AccountLevel.LEDGER).map((account) => account.id);
    const postedLines = ledgerIds.length ? await this.prisma.voucherEntryLine.groupBy({
      by: ["accountId"],
      where: { accountId: { in: ledgerIds }, voucher: { companyId: currentUser.companyId, status: { in: ["POSTED", "REVERSED"] } } },
      _sum: { debit: true, credit: true },
    }) : [];
    const balances = new Map(postedLines.map((line) => [line.accountId, sumMoney([line._sum.debit, -Number(line._sum.credit ?? 0)])]));

    return allAccounts.flatMap((account) => {
      if (account.level !== AccountLevel.LEDGER || account.status !== "ACTIVE") return [];
      const type = classifyMoneyAccount(account, accountsById);
      if (!type || (normalizedType && type !== normalizedType)) return [];
      return [{ ...toApi(account), path: buildPath(account, accountsById), type, currentBalance: balances.get(account.id) ?? 0 }];
    });
  }

  async getById(currentUser: AuthenticatedRequestUser, id: string) {
    const account = await this.loadOwnedAccount(currentUser, id);
    const allAccounts = await this.prisma.account.findMany({ where: { companyId: currentUser.companyId } });
    const accountsById = new Map(allAccounts.map((entry) => [entry.id, entry]));

    const relatedAccountIds = collectAccountAndDescendantIds(allAccounts, id);
    const relatedAccountNames = allAccounts.filter((entry) => relatedAccountIds.includes(entry.id)).map((entry) => entry.name);
    const partyId = managedPartyId(account);
    const [childCount, voucherLineCount] = await Promise.all([
      this.prisma.account.count({ where: { parentId: id } }),
      this.prisma.voucherEntryLine.count({
        where: partyId
          ? { voucher: { companyId: currentUser.companyId, partyId } }
          : {
              voucher: { companyId: currentUser.companyId },
              OR: [
                { accountId: { in: relatedAccountIds } },
                { accountId: null, ledger: { in: relatedAccountNames } },
              ],
            },
      }),
    ]);

    return {
      ...toApi(account),
      path: buildPath(account, accountsById),
      parentName: account.parentId ? (accountsById.get(account.parentId)?.name ?? null) : null,
      childCount,
      hasPostingHistory: voucherLineCount > 0,
    };
  }

  async create(currentUser: AuthenticatedRequestUser, dto: CreateAccountDto) {
    return this.createInternal(currentUser, dto, null);
  }

  /** Internal module provisioning. The role is persisted in the same INSERT as
   * the account, so concurrent setup calls cannot leave a second orphan ledger.
   * This method is deliberately not exposed by AccountsController. */
  async createManagedAccount(currentUser: AuthenticatedRequestUser, managedRole: string, dto: CreateAccountDto) {
    const normalizedRole = managedRole.trim();
    if (!normalizedRole || normalizedRole.length > 160) {
      throw new BadRequestException("Managed account role is invalid.");
    }
    return this.createInternal(currentUser, dto, normalizedRole);
  }

  private async createInternal(currentUser: AuthenticatedRequestUser, dto: CreateAccountDto, managedRole: string | null) {
    const level = dto.level as AccountLevel;
    const parent = await this.resolveAndValidateParent(currentUser, level, dto.parentId ?? null);
    const name = dto.name.trim();
    const openingBalance = roundMoney(dto.openingBalance);
    const isBankLedger = level === AccountLevel.LEDGER && parent
      ? await this.isUnderBankMfsAccounts(currentUser.companyId, parent)
      : false;
    // Bank/MFS metadata is optional: a posting ledger created directly from the
    // Chart of Accounts must immediately appear in its specialized management view.
    const openingBalanceSources = dto.openingBalanceSources ?? (dto.openingBalanceSourceAccountId && openingBalance > 0
      ? [{ accountId: dto.openingBalanceSourceAccountId, amount: openingBalance }]
      : []);
    if (openingBalance > 0 && level !== AccountLevel.LEDGER) {
      throw new BadRequestException("Opening balances can only be posted to a Ledger account.");
    }
    await this.validateOpeningBalanceAllocations(currentUser.companyId, openingBalance, openingBalanceSources);
    if (openingBalance > 0 && !dto.openingBalanceDate) {
      throw new BadRequestException("Opening Balance Date is required.");
    }

    const siblingCount = await this.prisma.account.count({
      where: { companyId: currentUser.companyId, parentId: parent?.id ?? null },
    });

    // Account Code is always server-generated — never accepted from the client
    // — so the positional numbering scheme stays internally consistent. A
    // small retry covers the rare race where two concurrent creates land on
    // the same computed code.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const code = await this.computeAccountCode(currentUser.companyId, level, dto.nature, parent, name);
      try {
        const account = await this.prisma.$transaction(async (tx) => {
          const created = await tx.account.create({
            data: {
              tenantId: currentUser.tenantId,
              companyId: currentUser.companyId,
              parentId: parent?.id ?? null,
              level,
              code,
              name,
              managedRole,
              nature: dto.nature,
              isControlAccount: dto.isControlAccount ?? false,
              requiresItemDetails: dto.requiresItemDetails ?? true,
              openingBalance,
              openingBalanceDate: dto.openingBalanceDate ? new Date(`${dto.openingBalanceDate}T00:00:00.000Z`) : null,
              openingBalanceSourceAccountId: dto.openingBalanceSourceAccountId ?? null,
              openingBalanceSources,
              bankDetails: isBankLedger ? normalizeBankDetails(dto.bankDetails) : undefined,
              isSystem: false,
              sortOrder: (siblingCount + 1) * 10,
            },
          });
          await this.syncOpeningBalanceVoucher(tx, currentUser, created);
          return created;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

        await this.auditService.log({
          tenantId: currentUser.tenantId,
          companyId: currentUser.companyId,
          userId: currentUser.id,
          action: "ACCOUNT_CREATED",
          entityType: "Account",
          entityId: account.id,
          newValues: { code: account.code, name: account.name, level: account.level, parentId: account.parentId },
        });

        return toApi(account);
      } catch (error) {
        if (managedRole && isUniqueManagedRoleConflict(error)) {
          const winner = await this.prisma.account.findFirst({
            where: { companyId: currentUser.companyId, managedRole },
          });
          if (winner) return toApi(winner);
        }
        if (!isUniqueCodeConflict(error) || attempt === 2) {
          throw error;
        }
      }
    }

    throw new BadRequestException("Could not generate a unique account code. Please try again.");
  }

  /**
   * Lightweight ledger creation for the Expense voucher's "+ Add Ledger" quick-add
   * dialog — mirrors POST /parties' minimal-input shape (name only) instead of the
   * full POST /accounts DTO (level/parentId/code), by deriving the parent category
   * from `nature` and auto-generating the next available ledger code.
   */
  async createExpenseLedger(currentUser: AuthenticatedRequestUser, dto: CreateExpenseLedgerDto) {
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException("Ledger name is required.");
    }

    // Resolved by nature + level rather than a hardcoded category code, since
    // the category's own code is now derived from its position in the tree
    // (see account-code.util.ts) and can differ from company to company. Not
    // Any matching category (fixed system backbone or user-created) is a valid
    // anchor. System categories themselves remain immutable and undeletable.
    const parent = await this.prisma.account.findFirst({
      where: { companyId: currentUser.companyId, level: AccountLevel.CATEGORY, nature: dto.nature },
      orderBy: { sortOrder: "asc" },
    });
    if (!parent) {
      throw new BadRequestException("Expense categories are not set up for this company yet.");
    }

    const existing = await this.prisma.account.findFirst({
      where: { companyId: currentUser.companyId, name: { equals: name, mode: "insensitive" } },
    });
    if (existing) {
      throw new BadRequestException(`A ledger named "${name}" already exists.`);
    }

    const siblingCount = await this.prisma.account.count({
      where: { companyId: currentUser.companyId, parentId: parent.id },
    });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const code = await this.computeAccountCode(currentUser.companyId, AccountLevel.LEDGER, dto.nature, parent, name);
      try {
        const account = await this.prisma.account.create({
          data: {
            tenantId: currentUser.tenantId,
            companyId: currentUser.companyId,
            parentId: parent.id,
            level: AccountLevel.LEDGER,
            code,
            name,
            nature: dto.nature,
            isControlAccount: false,
            requiresItemDetails: dto.requiresItemDetails ?? true,
            isSystem: false,
            sortOrder: (siblingCount + 1) * 10,
          },
        });

        await this.auditService.log({
          tenantId: currentUser.tenantId,
          companyId: currentUser.companyId,
          userId: currentUser.id,
          action: "ACCOUNT_CREATED",
          entityType: "Account",
          entityId: account.id,
          newValues: { code: account.code, name: account.name, level: account.level, parentId: account.parentId },
        });

        return toApi(account);
      } catch (error) {
        if (!isUniqueCodeConflict(error) || attempt === 2) {
          throw error;
        }
      }
    }

    throw new BadRequestException("Could not generate a unique ledger code. Please try again.");
  }

  /**
   * Next free numeric ledger code within `nature`'s block (1000s asset, 2000s
   * liability, ... 5000s expense), following the same 10-step spacing as the
   * seeded system ledgers. Falls back to the block's first slot if it's empty.
   */
  private async generateNextNatureCode(companyId: string, nature: string) {
    const blockDigit = NATURE_CODE_BLOCK[nature] ?? 9;
    const blockStart = blockDigit * 1000;
    const blockEnd = blockStart + 999;

    const accounts = await this.prisma.account.findMany({
      where: { companyId, level: AccountLevel.LEDGER },
      select: { code: true },
    });
    const usedCodes = new Set([...accounts.map((account) => account.code), ...RESERVED_SEED_CODES]);

    let maxInBlock = blockStart;
    for (const code of usedCodes) {
      if (!/^\d+$/.test(code)) {
        continue;
      }
      const value = Number.parseInt(code, 10);
      if (value >= blockStart && value <= blockEnd && value > maxInBlock) {
        maxInBlock = value;
      }
    }

    // The seeded convention spaces codes 10 apart (1010, 1020, ...) so there's
    // room to insert between them later. Once that runs out at the top of this
    // nature's thousand-wide block, pack tighter by 1 instead of spilling into
    // the next nature's block — this also reclaims any gap a deleted ledger left.
    const steppedCandidate = maxInBlock === blockStart ? blockStart + 10 : maxInBlock + 10;
    if (steppedCandidate <= blockEnd) {
      return String(steppedCandidate);
    }

    for (let candidate = blockStart + 1; candidate <= blockEnd; candidate += 1) {
      if (!usedCodes.has(String(candidate))) {
        return String(candidate);
      }
    }

    throw new BadRequestException(`All ledger codes in the ${blockStart}-${blockEnd} range are in use. Enter a code manually.`);
  }

  /**
   * Appends `-2`, `-3`, ... to `base` until it no longer collides with an
   * existing account code in this company. Used for string-style codes
   * (categories) where the "next" code isn't a simple numeric increment.
   */
  private async generateUniqueStringCode(companyId: string, base: string) {
    const normalizedBase = base.toUpperCase();
    let candidate = normalizedBase;
    let suffix = 2;
    while (
      await this.prisma.account.findUnique({
        where: { companyId_code: { companyId, code: candidate } },
      })
    ) {
      candidate = `${normalizedBase}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  }

  /**
   * Code suggestion for the Chart of Accounts "Add" dialogs — a read-only
   * preview of exactly what `create()` will assign, since Account Code is
   * always server-generated and never accepted from the client.
   */
  async suggestCode(
    currentUser: AuthenticatedRequestUser,
    params: { level: AccountLevel; nature: string; parentId: string | null; name: string },
  ) {
    const parent = params.parentId ? await this.prisma.account.findUnique({ where: { id: params.parentId } }) : null;
    const code = await this.computeAccountCode(currentUser.companyId, params.level, params.nature, parent, params.name);
    return { code };
  }

  /**
   * The single source of truth for "what code does this account get" — tries
   * the positional numbering scheme first (see account-code.util.ts), and
   * falls back to the legacy nature-block / parent-code-plus-slug scheme when
   * the positional scheme doesn't apply yet (e.g. the parent predates it and
   * hasn't been migrated). Used by `create()`, `createExpenseLedger()`, and
   * `suggestCode()` so the preview a user sees always matches what gets saved.
   */
  private async computeAccountCode(
    companyId: string,
    level: AccountLevel,
    nature: string,
    parent: AccountRow | null,
    name: string,
  ): Promise<string> {
    const positional = await this.suggestPositionalCode(companyId, level, nature, parent);
    if (positional) {
      return positional;
    }

    if (level === AccountLevel.LEDGER) {
      return this.generateNextNatureCode(companyId, nature);
    }

    if (level === AccountLevel.MAIN_CATEGORY) {
      return this.generateUniqueStringCode(companyId, `CAT-${nature}`);
    }

    const parentCode = parent ? parent.code : "CAT";
    const slug = slugifyForCode(name) || "NEW";
    return this.generateUniqueStringCode(companyId, `${parentCode}-${slug}`);
  }

  /**
   * Positional chart-of-accounts numbering: a fixed-width code where the first
   * 4 digits are reserved for the category hierarchy (1=Main Category, then
   * one digit per Category depth below it, zero-padded when unused), and a
   * Ledger always uses the last 3 digits as its own counter under whatever
   * category it sits in — e.g. Assets=1000000, its 2nd Category=1200000, a
   * Ledger directly under Assets=1000001. Returns null when this scheme
   * doesn't apply (the parent isn't itself coded this way yet, or a Category
   * nests deeper than the 4 reserved digits reach), so the caller can fall
   * back gracefully.
   */
  private async suggestPositionalCode(companyId: string, level: AccountLevel, nature: string, parent: AccountRow | null): Promise<string | null> {
    if (level === AccountLevel.LEDGER) {
      // Scoped by level only, not parentId: the (companyId, code) uniqueness
      // constraint is company-wide, and pickLedgerCode already filters this
      // list down to codes sharing this parent's exact prefix internally. A
      // parentId-scoped query missed same-prefix codes sitting under a
      // different (e.g. legacy or reparented) sibling branch, so the counter
      // could recompute an already-taken code on every retry attempt.
      const allLedgers = await this.prisma.account.findMany({
        where: { companyId, level: AccountLevel.LEDGER },
        select: { code: true },
      });
      const parentDepth = parent ? await this.computeDepth(parent) : null;
      return pickLedgerCode(
        parent?.code ?? null,
        parentDepth,
        [...allLedgers.map((row) => row.code), ...RESERVED_SEED_CODES],
      );
    }

    if (level === AccountLevel.MAIN_CATEGORY) {
      const siblings = await this.prisma.account.findMany({
        where: { companyId, parentId: null, level: AccountLevel.MAIN_CATEGORY },
        select: { code: true },
      });
      return pickMainCategoryCode(nature, [...siblings.map((row) => row.code), ...RESERVED_SEED_CODES]);
    }

    if (!parent) {
      return null;
    }

    const siblings = await this.prisma.account.findMany({
      where: { companyId, parentId: parent.id },
      select: { code: true },
    });
    const depth = (await this.computeDepth(parent)) + 1;
    return pickCategoryCode(depth, parent.code, [...siblings.map((row) => row.code), ...RESERVED_SEED_CODES]);
  }

  /**
   * How deep `account` sits in the tree — 1 for a Main Category (no parent),
   * 2 for a Category directly under it, 3 for that Category's children, and
   * so on. Categories nest to unlimited depth, but the positional code scheme
   * only has room for the first `POSITIONAL_CATEGORY_DIGITS` depths (see
   * account-code.util.ts) — this is how `suggestPositionalCode` decides
   * whether a node is still shallow enough to get one.
   */
  private async computeDepth(account: AccountRow): Promise<number> {
    let depth = 1;
    let current = account;
    while (current.parentId) {
      const parent: AccountRow | null = await this.prisma.account.findUnique({ where: { id: current.parentId } });
      if (!parent) {
        break;
      }
      depth += 1;
      current = parent;
    }
    return depth;
  }

  private async isUnderBankMfsAccounts(companyId: string, account: AccountRow): Promise<boolean> {
    let current: AccountRow | null = account;
    while (current) {
      if (current.code === "1222000" || current.code === "1222100" || current.code === "1222200") return true;
      current = current.parentId
        ? await this.prisma.account.findFirst({ where: { id: current.parentId, companyId } })
        : null;
    }
    return false;
  }

  private async validateOpeningBalanceSource(companyId: string, sourceAccountId?: string | null) {
    if (!sourceAccountId) return;
    const source = await this.prisma.account.findFirst({
      where: { id: sourceAccountId, companyId, level: AccountLevel.LEDGER, status: "ACTIVE" },
    });
    if (!source) throw new BadRequestException("Select an active Cash or Bank ledger as the opening balance source.");
    const allAccounts = await this.prisma.account.findMany({ where: { companyId } });
    const sourceType = classifyMoneyAccount(source, new Map(allAccounts.map((account) => [account.id, account])));
    const pathIsCashOrBank = sourceType === "CASH" || sourceType === "BANK" || sourceType === "MFS";
    if (!pathIsCashOrBank) throw new BadRequestException("Opening balance source must be a Cash or Bank ledger.");
  }

  private async validateOpeningBalanceAllocations(
    companyId: string,
    openingBalance: number,
    allocations: Array<{ accountId: string; amount: number }>,
    targetAccountId?: string,
  ) {
    if (openingBalance <= 0) return;
    if (!allocations.length) throw new BadRequestException("Add at least one Cash or Bank allocation.");
    const seen = new Set<string>();
    const allocationAmounts: number[] = [];
    for (const allocation of allocations) {
      const accountId = String(allocation?.accountId ?? "").trim();
      const amount = Number(allocation?.amount ?? 0);
      if (!accountId || !Number.isFinite(amount) || amount <= 0) throw new BadRequestException("Every Cash/Bank allocation must have a valid amount.");
      if (accountId === targetAccountId) throw new BadRequestException("Opening balance source cannot be the same ledger.");
      if (seen.has(accountId)) throw new BadRequestException("The same Cash/Bank ledger cannot be added twice.");
      seen.add(accountId);
      allocation.amount = roundMoney(amount);
      allocationAmounts.push(allocation.amount);
      await this.validateOpeningBalanceSource(companyId, accountId);
    }
    if (toPaisa(sumMoney(allocationAmounts)) !== toPaisa(openingBalance)) {
      throw new BadRequestException(`Cash/Bank allocation total must equal the Opening Balance (${openingBalance.toFixed(2)}).`);
    }
  }

  private async syncOpeningBalanceVoucher(
    tx: Prisma.TransactionClient,
    currentUser: AuthenticatedRequestUser,
    account: AccountRow,
  ) {
    const balance = roundMoney(account.openingBalance);
    const allocations = parseOpeningBalanceSources(account.openingBalanceSources);
    if (balance > 0) {
      if (account.level !== AccountLevel.LEDGER) throw new BadRequestException("Opening balances can only be posted to a Ledger account.");
      if (!account.openingBalanceDate) throw new BadRequestException("Opening Balance Date is required.");
    }

    const latestRoot = await tx.voucherEntry.findFirst({
        where: {
          companyId: currentUser.companyId,
          sourceType: "ACCOUNT_OPENING_BALANCE",
          sourceId: account.id,
          reversalOfId: null,
        },
        include: { lines: true },
        orderBy: [{ postingVersion: "desc" }, { createdAt: "desc" }],
    });
    const activeRoot = latestRoot?.status === VoucherEntryStatus.POSTED ? latestRoot : null;
    const postingWorkspaceId = latestRoot?.workspaceId ?? currentUser.workspaceId;
    if (balance > 0 && !postingWorkspaceId) {
      throw new BadRequestException("An active workspace is required to post an opening balance.");
    }
    const now = new Date();

    let companyCurrency: string | null = null;
    let sources: AccountRow[] = [];
    let lines: Array<{
        accountId: string;
        ledger: string;
        description: string;
        debit: number;
        credit: number;
        costCenter: string;
    }> = [];
    if (balance > 0) {
        const company = await tx.company.findUnique({
          where: { id: currentUser.companyId },
          select: { currencyCode: true },
        });
        if (!company) throw new BadRequestException("Company currency is not configured.");
        companyCurrency = company.currencyCode;
        const sourceIds = allocations.map((allocation) => allocation.accountId);
        sources = await tx.account.findMany({
          where: { id: { in: sourceIds }, companyId: currentUser.companyId, level: AccountLevel.LEDGER, status: "ACTIVE" },
        });
        if (sources.length !== sourceIds.length) {
          throw new BadRequestException("An opening balance source ledger is missing or belongs to a different company.");
        }
        const allAccounts = await tx.account.findMany({ where: { companyId: currentUser.companyId } });
        const accountsById = new Map(allAccounts.map((candidate) => [candidate.id, candidate]));
        const sourceById = new Map(sources.map((source) => [source.id, source]));
        if (sources.some((source) => !classifyMoneyAccount(source, accountsById))) {
          throw new BadRequestException("Opening balance sources must remain valid Cash, Bank, or MFS ledgers.");
        }
        const targetNormallyDebits = account.nature === "ASSET" || account.nature === "DIRECT_EXPENSE" || account.nature === "INDIRECT_EXPENSE";
        const sourceLines = allocations.map((allocation) => {
          const source = sourceById.get(allocation.accountId)!;
          return {
            accountId: source.id,
            ledger: source.name,
            description: `Opening balance source for ${account.name}`,
            debit: targetNormallyDebits ? 0 : roundMoney(allocation.amount),
            credit: targetNormallyDebits ? roundMoney(allocation.amount) : 0,
            costCenter: classifyMoneyAccount(source, accountsById) === "CASH" ? "Cash-in-Hand" : "Bank Accounts",
          };
        });
        const targetGroup = account.nature === "ASSET" ? "Assets"
          : account.nature === "LIABILITY" ? "Liabilities"
            : account.nature === "EQUITY" ? "Equity"
              : account.nature === "INCOME" ? "Revenue"
                : "Direct Expenses";
        lines = [{
          accountId: account.id,
          ledger: account.name,
          description: "Opening balance",
          debit: targetNormallyDebits ? balance : 0,
          credit: targetNormallyDebits ? 0 : balance,
          costCenter: targetGroup,
        }, ...sourceLines];
    }

    const unchanged = Boolean(
        activeRoot
        && account.openingBalanceDate
        && activeRoot.voucherDate.toISOString().slice(0, 10) === account.openingBalanceDate.toISOString().slice(0, 10)
        && roundMoney(activeRoot.totalAmount) === balance
        && activeRoot.lines.length === lines.length
        && lines.every((expected) => activeRoot.lines.some((persisted) =>
          persisted.accountId === expected.accountId
          && roundMoney(persisted.debit) === expected.debit
          && roundMoney(persisted.credit) === expected.credit)),
    );
    if (unchanged) return;

    if (activeRoot) {
        const reversalLines = activeRoot.lines.map((line) => ({
          accountId: line.accountId,
          ledger: line.ledger,
          description: line.description ? `Reversal: ${line.description}` : "Opening balance reversal",
          debit: roundMoney(line.credit),
          credit: roundMoney(line.debit),
          costCenter: line.costCenter,
          project: line.project,
          billReference: line.billReference,
        }));
        if (reversalLines.some((line) => !line.accountId && (line.debit !== 0 || line.credit !== 0))) {
          throw new BadRequestException("This legacy opening balance cannot be reversed until every non-zero line has an Account ID.");
        }
        const reversalKey = `account-opening:${account.id}:v${activeRoot.postingVersion}:reversal`;
        const existingReversal = await tx.voucherEntry.findFirst({ where: { reversalOfId: activeRoot.id } });
        if (!existingReversal) {
          await tx.voucherEntry.create({
            data: {
              tenantId: activeRoot.tenantId,
              companyId: activeRoot.companyId,
              workspaceId: activeRoot.workspaceId,
              createdByUserId: currentUser.id,
              voucherType: VoucherEntryType.JOURNAL,
              documentKind: "opening-balance",
              voucherNumber: `${activeRoot.voucherNumber}-REV`,
              // Opening edits are restatements, so both old and replacement
              // net at the original effective date in historical reports.
              voucherDate: activeRoot.voucherDate,
              partyName: account.name,
              reference: activeRoot.voucherNumber,
              narration: `Reversal of ${activeRoot.voucherNumber}`,
              status: VoucherEntryStatus.POSTED,
              currency: activeRoot.currency,
              totalAmount: roundMoney(activeRoot.totalAmount),
              debit: roundMoney(activeRoot.credit),
              credit: roundMoney(activeRoot.debit),
              sourceType: "ACCOUNT_OPENING_BALANCE",
              sourceId: account.id,
              postingVersion: activeRoot.postingVersion,
              idempotencyKey: reversalKey,
              reversalOfId: activeRoot.id,
              approvedByUserId: currentUser.id,
              approvedAt: now,
              postedAt: now,
              lines: { create: reversalLines },
            },
          });
        }
        await tx.voucherEntry.update({
          where: { id: activeRoot.id },
          data: { status: VoucherEntryStatus.REVERSED },
        });
    }

    if (balance <= 0) return;
    const postingVersion = (latestRoot?.postingVersion ?? 0) + 1;
    const idempotencyKey = `account-opening:${account.id}:v${postingVersion}`;
    const alreadyPosted = await tx.voucherEntry.findFirst({
        where: { workspaceId: postingWorkspaceId!, idempotencyKey },
    });
    if (alreadyPosted) return;
    await tx.voucherEntry.create({
        data: {
          tenantId: currentUser.tenantId,
          companyId: currentUser.companyId,
          workspaceId: postingWorkspaceId!,
          createdByUserId: currentUser.id,
          voucherType: VoucherEntryType.JOURNAL,
          documentKind: "opening-balance",
          voucherNumber: `OB-ACCOUNT-${account.code}${postingVersion > 1 ? `-V${postingVersion}` : ""}`,
          voucherDate: account.openingBalanceDate!,
          partyName: account.name,
          reference: `Opening balance for ${account.name}`,
          narration: `Opening balance via ${sources.map((source) => source.name).join(", ")}`,
          status: VoucherEntryStatus.POSTED,
          currency: companyCurrency!,
          totalAmount: balance,
          debit: balance,
          credit: balance,
          sourceType: "ACCOUNT_OPENING_BALANCE",
          sourceId: account.id,
          postingVersion,
          idempotencyKey,
          approvedByUserId: currentUser.id,
          approvedAt: now,
          postedAt: now,
          lines: { create: lines },
        },
    });
  }

  // Account Code is immutable after creation — it never comes from the client
  // here either, since editing it would break the positional numbering
  // scheme's invariants (siblings, ledger counters, and descendants all derive
  // from a category's code).
  async update(currentUser: AuthenticatedRequestUser, id: string, dto: UpdateAccountDto) {
    const existing = await this.loadOwnedAccount(currentUser, id);
    if (isManagedPartyAccount(existing)) {
      throw new BadRequestException("Customer/Supplier Ledgers are managed from the Party master and cannot be edited directly.");
    }
    if (existing.isSystem) {
      throw new BadRequestException(
        `System account "${existing.name}" cannot be modified. System accounts are protected to maintain Chart of Accounts integrity.`,
      );
    }
    const isBankLedger = existing.level === AccountLevel.LEDGER
      ? await this.isUnderBankMfsAccounts(currentUser.companyId, existing)
      : false;
    const nextOpeningBalance = roundMoney(dto.openingBalance ?? existing.openingBalance);
    const nextOpeningBalanceDate = dto.openingBalanceDate === undefined ? existing.openingBalanceDate : dto.openingBalanceDate;
    const nextOpeningBalanceSources = dto.openingBalanceSources === undefined
      ? parseOpeningBalanceSources(existing.openingBalanceSources)
      : dto.openingBalanceSources;
    if (nextOpeningBalance > 0 && existing.level !== AccountLevel.LEDGER) {
      throw new BadRequestException("Opening balances can only be posted to a Ledger account.");
    }
    await this.validateOpeningBalanceAllocations(currentUser.companyId, nextOpeningBalance, nextOpeningBalanceSources, id);
    if (nextOpeningBalance > 0 && !nextOpeningBalanceDate) throw new BadRequestException("Opening Balance Date is required.");

    const updated = await this.prisma.$transaction(async (tx) => {
      const account = await tx.account.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          isControlAccount: dto.isControlAccount,
          requiresItemDetails: dto.requiresItemDetails,
          openingBalance: nextOpeningBalance,
          openingBalanceDate: dto.openingBalanceDate === undefined
            ? undefined
            : dto.openingBalanceDate
              ? new Date(`${dto.openingBalanceDate}T00:00:00.000Z`)
              : null,
          openingBalanceSourceAccountId: dto.openingBalanceSourceAccountId,
          openingBalanceSources: nextOpeningBalanceSources,
          bankDetails: isBankLedger ? normalizeBankDetails(dto.bankDetails) : undefined,
          printOnInvoices: dto.printOnInvoices,
        },
      });
      await this.syncOpeningBalanceVoucher(tx, currentUser, account);
      return account;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    const oldAuditValues = {
      name: existing.name,
      isControlAccount: existing.isControlAccount,
      requiresItemDetails: existing.requiresItemDetails,
      openingBalance: roundMoney(existing.openingBalance),
      openingBalanceDate: existing.openingBalanceDate?.toISOString() ?? null,
      openingBalanceSourceAccountId: existing.openingBalanceSourceAccountId,
      openingBalanceSources: existing.openingBalanceSources,
      bankDetails: existing.bankDetails,
      printOnInvoices: existing.printOnInvoices,
    };
    const newAuditValues = {
      name: updated.name,
      isControlAccount: updated.isControlAccount,
      requiresItemDetails: updated.requiresItemDetails,
      openingBalance: roundMoney(updated.openingBalance),
      openingBalanceDate: updated.openingBalanceDate?.toISOString() ?? null,
      openingBalanceSourceAccountId: updated.openingBalanceSourceAccountId,
      openingBalanceSources: updated.openingBalanceSources,
      bankDetails: updated.bankDetails,
      printOnInvoices: updated.printOnInvoices,
    };

    if (JSON.stringify(oldAuditValues) !== JSON.stringify(newAuditValues)) {
      await this.auditService.log({
        tenantId: currentUser.tenantId,
        companyId: currentUser.companyId,
        userId: currentUser.id,
        action: "ACCOUNT_UPDATED",
        entityType: "Account",
        entityId: updated.id,
        oldValues: oldAuditValues,
        newValues: newAuditValues,
      });
    }

    return toApi(updated);
  }

  async reparent(currentUser: AuthenticatedRequestUser, id: string, dto: ReparentAccountDto) {
    const existing = await this.loadOwnedAccount(currentUser, id);

    if (isManagedPartyAccount(existing)) {
      throw new BadRequestException("Customer/Supplier Ledgers are fixed under their control category and cannot be moved.");
    }

    if (existing.managedRole) {
      throw new BadRequestException("Module-managed accounts cannot be moved because their accounting role is fixed.");
    }

    if (existing.isSystem) {
      throw new BadRequestException(
        `System account "${existing.name}" cannot be moved. System accounts are permanently locked to maintain Chart of Accounts integrity.`,
      );
    }

    if (existing.level === AccountLevel.MAIN_CATEGORY) {
      throw new BadRequestException("A Main Category cannot have a parent.");
    }

    if (dto.parentId === id) {
      throw new BadRequestException("An account cannot be its own parent.");
    }

    const parent = await this.resolveAndValidateParent(currentUser, existing.level, dto.parentId ?? null, id);

    const updated = await this.prisma.$transaction(async (tx) => {
      const allAccounts = existing.level === AccountLevel.CATEGORY
        ? await tx.account.findMany({ where: { companyId: currentUser.companyId } })
        : [];
      const descendantIds = allAccounts.length
        ? collectAccountAndDescendantIds(allAccounts, id).filter((accountId) => accountId !== id)
        : [];
      if (allAccounts.some((account) => descendantIds.includes(account.id) && account.isSystem)) {
        throw new BadRequestException(
          "This Category contains protected Chart of Accounts nodes and cannot be moved.",
        );
      }
      const moved = await tx.account.update({
        where: { id },
        data: { parentId: parent?.id ?? null, nature: parent?.nature ?? existing.nature },
      });
      if (existing.level === AccountLevel.CATEGORY && parent && parent.nature !== existing.nature) {
        if (descendantIds.length) {
          await tx.account.updateMany({
            where: { id: { in: descendantIds }, isSystem: false },
            data: { nature: parent.nature },
          });
        }
      }
      return moved;
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      companyId: currentUser.companyId,
      userId: currentUser.id,
      action: "ACCOUNT_REPARENTED",
      entityType: "Account",
      entityId: updated.id,
      oldValues: { parentId: existing.parentId },
      newValues: { parentId: updated.parentId },
    });

    return toApi(updated);
  }

  async setStatus(currentUser: AuthenticatedRequestUser, id: string, dto: SetAccountStatusDto) {
    const existing = await this.loadOwnedAccount(currentUser, id);

    if (isManagedPartyAccount(existing)) {
      throw new BadRequestException("Customer/Supplier Ledger status is controlled by the Party master.");
    }


    if (existing.managedRole && dto.status === "INACTIVE") {
      throw new BadRequestException("Module-managed accounts cannot be deactivated while their module may post to them.");
    }

    if (existing.isSystem) {
      throw new BadRequestException(
        `System account "${existing.name}" cannot be activated or deactivated. System accounts are permanently locked.`,
      );
    }

    if (dto.status === "INACTIVE") {
      if (existing.level === AccountLevel.MAIN_CATEGORY) {
        throw new BadRequestException("Account Classes cannot be deactivated.");
      }
      const allAccounts = await this.prisma.account.findMany({ where: { companyId: currentUser.companyId } });
      const relatedAccountIds = collectAccountAndDescendantIds(allAccounts, id);
      if (allAccounts.some((account) => account.id !== id && relatedAccountIds.includes(account.id) && account.isSystem)) {
        throw new BadRequestException(
          "This Category contains protected Chart of Accounts nodes and cannot be deactivated.",
        );
      }
      const relatedAccountNames = allAccounts.filter((entry) => relatedAccountIds.includes(entry.id)).map((entry) => entry.name);
      const postingCount = await this.prisma.voucherEntryLine.count({
        where: {
          voucher: { companyId: currentUser.companyId },
          OR: [
            { accountId: { in: relatedAccountIds } },
            { accountId: null, ledger: { in: relatedAccountNames } },
          ],
        },
      });
      if (postingCount > 0) {
        throw new BadRequestException(existing.level === AccountLevel.LEDGER
          ? "This Ledger has transactions and cannot be deactivated."
          : "This Category or one of its Ledgers has transactions and cannot be deactivated.");
      }
    }

    const updated = await this.prisma.account.update({
      where: { id },
      data: { status: dto.status },
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      companyId: currentUser.companyId,
      userId: currentUser.id,
      action: dto.status === "ACTIVE" ? "ACCOUNT_ACTIVATED" : "ACCOUNT_DEACTIVATED",
      entityType: "Account",
      entityId: updated.id,
      oldValues: { status: existing.status },
      newValues: { status: updated.status },
    });

    return toApi(updated);
  }

  async remove(currentUser: AuthenticatedRequestUser, id: string) {
    const existing = await this.loadOwnedAccount(currentUser, id);
    if (isManagedPartyAccount(existing)) {
      throw new BadRequestException("Customer/Supplier Ledgers cannot be deleted directly. Delete the matching Party from the master instead.");
    }
    if (existing.managedRole) {
      throw new BadRequestException("Module-managed accounts cannot be deleted because their accounting role and history must remain stable.");
    }
    if (existing.isSystem) {
      throw new BadRequestException(
        `System account "${existing.name}" cannot be deleted. System accounts are protected to maintain Chart of Accounts integrity.`,
      );
    }

    const childCount = await this.prisma.account.count({ where: { parentId: id } });
    if (childCount > 0) {
      throw new BadRequestException("This category still has child accounts. Move or remove them first.");
    }

    if (existing.level === AccountLevel.LEDGER) {
      // Older voucher lines may predate accountId linkage and retain only the
      // ledger snapshot name. They are still posting history and must protect
      // the ledger from deletion just like modern ID-linked lines.
      const postingCount = await this.prisma.voucherEntryLine.count({
        where: {
          voucher: { companyId: currentUser.companyId },
          OR: [{ accountId: id }, { accountId: null, ledger: existing.name }],
        },
      });
      if (postingCount > 0) {
        await this.auditService.log({
          tenantId: currentUser.tenantId,
          companyId: currentUser.companyId,
          userId: currentUser.id,
          action: "ACCOUNT_DELETE_REJECTED",
          entityType: "Account",
          entityId: id,
          oldValues: { reason: "has posting history" },
        });
        throw new BadRequestException("This Ledger has posting history and cannot be deleted. Deactivate it instead.");
      }
    }

    await this.prisma.account.delete({ where: { id } });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      companyId: currentUser.companyId,
      userId: currentUser.id,
      action: "ACCOUNT_DELETED",
      entityType: "Account",
      entityId: id,
      oldValues: { code: existing.code, name: existing.name },
    });

    return { success: true, id };
  }

  /**
   * The predefined item list scoped to one Ledger (e.g. "Office Stationery" ->
   * "A4 Paper", "Pen", "Stapler") — separate from the company-wide
   * InventoryItem master, see LedgerItem in schema.prisma.
   */
  async listLedgerItems(currentUser: AuthenticatedRequestUser, accountId: string) {
    await this.loadOwnedLedger(currentUser, accountId);
    const items = await this.prisma.ledgerItem.findMany({
      where: { accountId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return items.map(toLedgerItemApi);
  }

  async createLedgerItem(currentUser: AuthenticatedRequestUser, accountId: string, dto: CreateLedgerItemDto) {
    await this.loadOwnedLedger(currentUser, accountId);
    const name = dto.name.trim();
    const unit = dto.unit?.trim() || "pcs";

    const existing = await this.prisma.ledgerItem.findUnique({
      where: { accountId_name: { accountId, name } },
    });
    if (existing) {
      throw new BadRequestException(`An item named "${name}" already exists on this ledger.`);
    }

    const siblingCount = await this.prisma.ledgerItem.count({ where: { accountId } });
    const item = await this.prisma.ledgerItem.create({
      data: {
        tenantId: currentUser.tenantId,
        companyId: currentUser.companyId,
        accountId,
        name,
        unit,
        sortOrder: (siblingCount + 1) * 10,
      },
    });

    return toLedgerItemApi(item);
  }

  async updateLedgerItem(currentUser: AuthenticatedRequestUser, accountId: string, itemId: string, dto: UpdateLedgerItemDto) {
    const existing = await this.loadOwnedLedgerItem(currentUser, accountId, itemId);

    const name = dto.name?.trim();
    if (name && name !== existing.name) {
      const nameTaken = await this.prisma.ledgerItem.findUnique({
        where: { accountId_name: { accountId, name } },
      });
      if (nameTaken) {
        throw new BadRequestException(`An item named "${name}" already exists on this ledger.`);
      }
    }

    const updated = await this.prisma.ledgerItem.update({
      where: { id: itemId },
      data: { name, unit: dto.unit?.trim() },
    });

    return toLedgerItemApi(updated);
  }

  async deleteLedgerItem(currentUser: AuthenticatedRequestUser, accountId: string, itemId: string) {
    await this.loadOwnedLedgerItem(currentUser, accountId, itemId);
    await this.prisma.ledgerItem.delete({ where: { id: itemId } });
    return { success: true, id: itemId };
  }

  private async loadOwnedLedger(currentUser: AuthenticatedRequestUser, accountId: string) {
    const account = await this.loadOwnedAccount(currentUser, accountId);
    if (account.level !== AccountLevel.LEDGER) {
      throw new BadRequestException("Items can only be added to a Ledger.");
    }
    return account;
  }

  private async loadOwnedLedgerItem(currentUser: AuthenticatedRequestUser, accountId: string, itemId: string) {
    await this.loadOwnedLedger(currentUser, accountId);
    const item = await this.prisma.ledgerItem.findUnique({ where: { id: itemId } });
    if (!item || item.accountId !== accountId) {
      throw new NotFoundException("Item not found");
    }
    return item;
  }

  private async loadOwnedAccount(currentUser: AuthenticatedRequestUser, id: string) {
    const account = await this.prisma.account.findUnique({ where: { id } });
    if (!account) {
      throw new NotFoundException("Account not found");
    }
    if (account.companyId !== currentUser.companyId) {
      throw new ForbiddenException("Account belongs to a different company");
    }
    return account;
  }

  /**
   * Validates a proposed parent for `level`, enforcing Section 3's hierarchy rules,
   * and — when `movingAccountId` is supplied (re-parent flow) — rejects moving a
   * node under itself or under one of its own descendants.
   */
  private async resolveAndValidateParent(
    currentUser: AuthenticatedRequestUser,
    level: AccountLevel,
    parentId: string | null,
    movingAccountId?: string,
  ) {
    if (level === AccountLevel.MAIN_CATEGORY) {
      if (parentId) {
        throw new BadRequestException("A Main Category cannot have a parent.");
      }
      return null;
    }

    if (!parentId) {
      throw new BadRequestException(`A ${level.replace(/_/g, " ").toLowerCase()} requires a parent account.`);
    }

    const parent = await this.prisma.account.findUnique({ where: { id: parentId } });
    if (!parent || parent.companyId !== currentUser.companyId) {
      throw new BadRequestException("The selected parent account does not exist in this company.");
    }

    if (parent.level === AccountLevel.LEDGER) {
      throw new BadRequestException("A Ledger cannot contain children.");
    }

    if (movingAccountId) {
      let cursor: string | null = parent.id;
      const visited = new Set<string>();
      while (cursor) {
        if (cursor === movingAccountId) {
          throw new BadRequestException("Cannot move an account under one of its own descendants.");
        }
        if (visited.has(cursor)) {
          break;
        }
        visited.add(cursor);
        const cursorAccount: { parentId: string | null } | null = await this.prisma.account.findUnique({
          where: { id: cursor },
          select: { parentId: true },
        });
        cursor = cursorAccount?.parentId ?? null;
      }
    }

    return parent;
  }
}
