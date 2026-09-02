import {
  AccountStatus,
  PartyType,
  VoucherEntryStatus,
  VoucherEntryType,
} from "../generated/prisma/index.js";
import type { Prisma } from "../generated/prisma/index.js";

import { roundMoney } from "../accounting/money.util.js";

type DbClient = Prisma.TransactionClient;

type PartyIdentity = {
  id: string;
  tenantId: string;
  companyId: string;
  workspaceId: string;
  ledgerAccountId?: string | null;
  name: string;
  type: PartyType;
  openingBalance?: Prisma.Decimal | number;
  openingBalanceDate?: Date | null;
  createdAt?: Date;
  createdByUserId?: string | null;
};

const PARTY_ACCOUNT_TAG = "partyMaster";
const OPENING_BALANCE_EQUITY_CODE = "3100001";
const PARTY_OPENING_BALANCE_SOURCE = "PARTY_OPENING_BALANCE";

function configFor(type: PartyType) {
  return type === PartyType.CUSTOMER
    ? { parentCode: "1231000", parentName: "Accounts Receivables Control (Customers)", codePrefix: "1231", groupCode: "AR", nature: "ASSET" as const }
    : { parentCode: "2211000", parentName: "Accounts Payable Controls (Supplier)", codePrefix: "2211", groupCode: "AP", nature: "LIABILITY" as const };
}

function readPartyTag(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const tag = (value as Record<string, unknown>)[PARTY_ACCOUNT_TAG];
  if (!tag || typeof tag !== "object" || Array.isArray(tag)) return null;
  return tag as Record<string, unknown>;
}

function taggedForParty(value: Prisma.JsonValue | null | undefined, partyId: string) {
  return String(readPartyTag(value)?.partyId ?? "") === partyId;
}

function withPartyTag(value: Prisma.JsonValue | null | undefined, party: PartyIdentity): Prisma.InputJsonValue {
  const existing = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Prisma.JsonValue>
    : {};
  return {
    ...existing,
    [PARTY_ACCOUNT_TAG]: {
      partyId: party.id,
      partyType: party.type,
      workspaceId: party.workspaceId,
    },
  };
}

async function findParent(tx: DbClient, party: PartyIdentity) {
  const { parentCode, parentName } = configFor(party.type);
  const parent = await tx.account.findFirst({
    where: { companyId: party.companyId, code: parentCode, level: "CATEGORY", isSystem: true },
  });
  if (!parent) throw new Error(`${parentName} category is not configured in Chart of Accounts`);
  return parent;
}

/**
 * Resolve only durable Party-account identities.
 *
 * `ledgerAccountId` is authoritative for current rows. The embedded partyMaster
 * tag is retained solely so pre-FK rows can reconnect to the account that was
 * already created for that exact Party. A coincidentally equal display name is
 * never an identity signal here: adopting such a ledger would re-parent and
 * retag user-owned accounting data during an otherwise ordinary Party create.
 */
async function findPartyAccount(tx: DbClient, party: PartyIdentity) {
  if (party.ledgerAccountId) {
    const linked = await tx.account.findFirst({
      where: { id: party.ledgerAccountId, companyId: party.companyId, level: "LEDGER", isSystem: false },
    });
    if (linked) return linked;
  }
  const ledgers = await tx.account.findMany({
    where: { companyId: party.companyId, level: "LEDGER", isSystem: false },
  });
  const taggedLedgers = ledgers.filter((ledger) => taggedForParty(ledger.bankDetails, party.id));
  if (taggedLedgers.length > 1) {
    throw new Error(`Party ${party.id} is linked to multiple tagged Chart of Accounts ledgers`);
  }
  return taggedLedgers[0] ?? null;
}

function sameCalendarDate(left: Date, right: Date) {
  return left.toISOString().slice(0, 10) === right.toISOString().slice(0, 10);
}

function openingBalanceSides(type: PartyType, rawBalance: Prisma.Decimal | number) {
  const signedBalance = roundMoney(rawBalance);
  const amount = Math.abs(signedBalance);
  const partyNormallyDebits = type === PartyType.CUSTOMER;
  const partyDebits = signedBalance > 0 ? partyNormallyDebits : !partyNormallyDebits;
  return {
    amount,
    partyDebit: partyDebits ? amount : 0,
    partyCredit: partyDebits ? 0 : amount,
    equityDebit: partyDebits ? 0 : amount,
    equityCredit: partyDebits ? amount : 0,
  };
}

async function syncPartyOpeningBalanceVoucher(
  tx: DbClient,
  party: PartyIdentity,
  partyAccount: { id: string; code: string; name: string },
  postingUserId?: string,
) {
  // Unit tests and older internal callers may pass a deliberately narrow
  // Party projection. A real Prisma Party always includes openingBalance.
  if (party.openingBalance === undefined) return;

  const sides = openingBalanceSides(party.type, party.openingBalance);
  const latestRoot = await tx.voucherEntry.findFirst({
    where: {
      companyId: party.companyId,
      sourceType: PARTY_OPENING_BALANCE_SOURCE,
      sourceId: party.id,
      reversalOfId: null,
    },
    include: { lines: true },
    orderBy: [{ postingVersion: "desc" }, { createdAt: "desc" }],
  });
  const activeRoot = latestRoot?.status === VoucherEntryStatus.POSTED ? latestRoot : null;
  const voucherDate = party.openingBalanceDate ?? party.createdAt ?? new Date();

  let equityAccount: { id: string; name: string } | null = null;
  if (sides.amount > 0) {
    equityAccount = await tx.account.findFirst({
      where: {
        companyId: party.companyId,
        code: OPENING_BALANCE_EQUITY_CODE,
        level: "LEDGER",
        isSystem: true,
        status: AccountStatus.ACTIVE,
      },
      select: { id: true, name: true },
    });
    if (!equityAccount) {
      throw new Error("Opening Balance Equity ledger is not configured in Chart of Accounts");
    }
  }

  if (activeRoot && equityAccount && sameCalendarDate(activeRoot.voucherDate, voucherDate)) {
    const partyLine = activeRoot.lines.find((line) => line.accountId === partyAccount.id);
    const equityLine = activeRoot.lines.find((line) => line.accountId === equityAccount?.id);
    if (
      activeRoot.lines.length === 2
      && roundMoney(activeRoot.totalAmount) === sides.amount
      && partyLine
      && roundMoney(partyLine.debit) === sides.partyDebit
      && roundMoney(partyLine.credit) === sides.partyCredit
      && equityLine
      && roundMoney(equityLine.debit) === sides.equityDebit
      && roundMoney(equityLine.credit) === sides.equityCredit
    ) {
      return;
    }
  }

  const actorId = postingUserId ?? party.createdByUserId ?? null;
  if ((activeRoot || sides.amount > 0) && !actorId) {
    throw new Error("A posting user is required to synchronize the Party opening balance");
  }
  const now = new Date();

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
      throw new Error("Party opening balance reversal contains a line without an Account ID");
    }

    await tx.voucherEntry.create({
      data: {
        tenantId: party.tenantId,
        companyId: party.companyId,
        workspaceId: party.workspaceId,
        createdByUserId: actorId!,
        voucherType: VoucherEntryType.JOURNAL,
        documentKind: "opening-balance",
        voucherNumber: `${activeRoot.voucherNumber}-REV`,
        // Opening-balance edits are restatements. Dating the reversal at the
        // original effective date prevents an interim historical report from
        // containing both the old and replacement opening balances.
        voucherDate: activeRoot.voucherDate,
        partyName: party.name,
        partyId: party.id,
        reference: activeRoot.voucherNumber,
        narration: `Reversal of ${activeRoot.voucherNumber}`,
        status: VoucherEntryStatus.POSTED,
        totalAmount: roundMoney(activeRoot.totalAmount),
        debit: roundMoney(activeRoot.debit),
        credit: roundMoney(activeRoot.credit),
        sourceType: PARTY_OPENING_BALANCE_SOURCE,
        sourceId: party.id,
        postingVersion: activeRoot.postingVersion,
        reversalOfId: activeRoot.id,
        approvedByUserId: actorId!,
        approvedAt: now,
        postedAt: now,
        lines: { create: reversalLines },
      },
    });
    await tx.voucherEntry.update({
      where: { id: activeRoot.id },
      data: { status: VoucherEntryStatus.REVERSED },
    });
  }

  if (sides.amount === 0) return;

  const postingVersion = (latestRoot?.postingVersion ?? 0) + 1;
  await tx.voucherEntry.create({
    data: {
      tenantId: party.tenantId,
      companyId: party.companyId,
      workspaceId: party.workspaceId,
      createdByUserId: actorId!,
      voucherType: VoucherEntryType.JOURNAL,
      documentKind: "opening-balance",
      voucherNumber: `OB-PARTY-${partyAccount.code}${postingVersion > 1 ? `-V${postingVersion}` : ""}`,
      voucherDate,
      partyName: party.name,
      partyId: party.id,
      reference: `Opening balance for ${party.name}`,
      narration: `Opening balance against ${equityAccount!.name}`,
      status: VoucherEntryStatus.POSTED,
      totalAmount: sides.amount,
      debit: sides.amount,
      credit: sides.amount,
      sourceType: PARTY_OPENING_BALANCE_SOURCE,
      sourceId: party.id,
      postingVersion,
      approvedByUserId: actorId!,
      approvedAt: now,
      postedAt: now,
      lines: {
        create: [
          {
            accountId: partyAccount.id,
            ledger: partyAccount.name,
            description: `Opening balance for ${party.name}`,
            debit: sides.partyDebit,
            credit: sides.partyCredit,
          },
          {
            accountId: equityAccount!.id,
            ledger: equityAccount!.name,
            description: `Opening balance offset for ${party.name}`,
            debit: sides.equityDebit,
            credit: sides.equityCredit,
          },
        ],
      },
    },
  });
}

export async function ensurePartyAccount(tx: DbClient, party: PartyIdentity, postingUserId?: string) {
  const config = configFor(party.type);
  const parent = await findParent(tx, party);
  const existing = await findPartyAccount(tx, party);
  const accountGroup = await tx.accountGroup.findUnique({
    where: { companyId_code: { companyId: party.companyId, code: config.groupCode } },
  });

  if (existing) {
    const account = await tx.account.update({
      where: { id: existing.id },
      data: {
        parentId: parent.id,
        name: party.name,
        nature: config.nature,
        accountGroupId: accountGroup?.id,
        bankDetails: withPartyTag(existing.bankDetails, party),
        status: AccountStatus.ACTIVE,
      },
    });
    if (party.ledgerAccountId !== account.id) {
      await tx.party.update({ where: { id: party.id }, data: { ledgerAccountId: account.id } });
    }
    await syncPartyOpeningBalanceVoucher(tx, party, account, postingUserId);
    return account;
  }

  const siblings = await tx.account.findMany({
    where: { companyId: party.companyId, parentId: parent.id, level: "LEDGER" },
    select: { code: true },
  });
  const maxCounter = siblings.reduce((max, row) => row.code.startsWith(config.codePrefix) && /^\d{7}$/.test(row.code)
    ? Math.max(max, Number(row.code.slice(4)))
    : max, 0);

  const account = await tx.account.create({
    data: {
      tenantId: party.tenantId,
      companyId: party.companyId,
      parentId: parent.id,
      level: "LEDGER",
      code: `${config.codePrefix}${String(maxCounter + 1).padStart(3, "0")}`,
      name: party.name,
      nature: config.nature,
      accountGroupId: accountGroup?.id,
      isSystem: false,
      isControlAccount: false,
      requiresItemDetails: false,
      bankDetails: withPartyTag(null, party),
      status: AccountStatus.ACTIVE,
    },
  });
  await tx.party.update({ where: { id: party.id }, data: { ledgerAccountId: account.id } });
  await syncPartyOpeningBalanceVoucher(tx, party, account, postingUserId);
  return account;
}

export async function deactivatePartyAccount(tx: DbClient, party: PartyIdentity) {
  const account = await findPartyAccount(tx, party);
  if (!account) return null;
  return tx.account.update({ where: { id: account.id }, data: { status: AccountStatus.INACTIVE } });
}

export async function removePartyAccountSafely(tx: DbClient, party: PartyIdentity) {
  const account = await findPartyAccount(tx, party);
  if (!account) return null;
  // Older vouchers may have name-only lines with no accountId. The partyId on
  // the voucher is therefore the authoritative history check; accountId is an
  // additional guard for newer/explicitly linked postings.
  const [partyVoucherCount, linkedLineCount] = await Promise.all([
    tx.voucherEntry.count({ where: { partyId: party.id } }),
    tx.voucherEntryLine.count({ where: { accountId: account.id } }),
  ]);
  const postingCount = partyVoucherCount + linkedLineCount;
  if (postingCount > 0) {
    return tx.account.update({ where: { id: account.id }, data: { status: AccountStatus.INACTIVE } });
  }
  await tx.party.update({ where: { id: party.id }, data: { ledgerAccountId: null } });
  await tx.account.delete({ where: { id: account.id } });
  return null;
}
