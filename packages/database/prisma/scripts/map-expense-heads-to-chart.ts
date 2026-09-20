#!/usr/bin/env node

import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

function ledgerCode(expenseHeadId: string) {
  return `EXH-${createHash("sha256").update(expenseHeadId).digest("hex").slice(0, 12).toUpperCase()}`;
}

async function run() {
  const heads = await prisma.expenseHead.findMany({
    include: { ledgerAccount: true },
    orderBy: [{ organizationId: "asc" }, { name: "asc" }],
  });
  const organizations = new Map<string, typeof heads>();
  for (const head of heads)
    organizations.set(head.organizationId, [
      ...(organizations.get(head.organizationId) ?? []),
      head,
    ]);

  console.log(`Expense heads found: ${heads.length}`);
  console.log(`Mode: ${apply ? "APPLY" : "DRY RUN"}`);

  let mappedHeads = 0;
  let mappedExpenses = 0;
  let reclassifiedJournalLines = 0;

  for (const [organizationId, organizationHeads] of organizations) {
    const systemAccounts = await prisma.ledgerAccount.findMany({
      where: {
        organizationId,
        systemKey: { in: ["DIRECT_EXPENSES", "ADMINISTRATIVE_EXPENSES"] },
      },
      select: { id: true, systemKey: true },
    });
    const byKey = new Map(systemAccounts.map((account) => [account.systemKey!, account.id]));
    for (const key of ["DIRECT_EXPENSES", "ADMINISTRATIVE_EXPENSES"] as const) {
      if (!byKey.has(key))
        throw new Error(
          `Organization ${organizationId} is missing Chart of Accounts system ledger ${key}. Open Chart of Accounts once, then rerun.`,
        );
    }

    for (const head of organizationHeads) {
      const nature = head.nature;
      const direct = nature === "DIRECT";
      const targetLedgerId = head.ledgerAccountId;
      const code = ledgerCode(head.id);
      console.log(
        `${head.name}: ${head.ledgerAccount?.code ?? (targetLedgerId ? "44100001" : code)} (${nature})${head.ledgerAccountId ? " [already mapped]" : ""}`,
      );
      if (!apply) continue;

      await prisma.$transaction(async (tx) => {
        const ledgerAccountId =
          targetLedgerId ??
          (
            await tx.ledgerAccount.upsert({
              where: { organizationId_code: { organizationId, code } },
              update: {
                name: head.name,
                parentId: byKey.get(direct ? "DIRECT_EXPENSES" : "ADMINISTRATIVE_EXPENSES")!,
                accountType: "EXPENSE",
                normalBalance: "DEBIT",
                isActive: true,
              },
              create: {
                organizationId,
                code,
                name: head.name,
                description: `Posting ledger for expense head: ${head.name}`,
                parentId: byKey.get(direct ? "DIRECT_EXPENSES" : "ADMINISTRATIVE_EXPENSES")!,
                accountType: "EXPENSE",
                normalBalance: "DEBIT",
                isSystem: false,
                isControlAccount: false,
              },
              select: { id: true },
            })
          ).id;

        if (!head.ledgerAccountId || head.nature !== nature) {
          await tx.expenseHead.update({
            where: { id: head.id },
            data: { ledgerAccountId, nature },
          });
          mappedHeads += 1;
        }

        const expenses = await tx.expense.findMany({
          where: { organizationId, expenseHeadId: head.id },
          select: { id: true, workId: true, expenseLedgerAccountId: true },
        });
        for (const expense of expenses) {
          const expenseLedgerAccountId = expense.expenseLedgerAccountId ?? ledgerAccountId;
          if (!expense.expenseLedgerAccountId) {
            await tx.expense.update({
              where: { id: expense.id },
              data: { expenseLedgerAccountId, expenseNature: nature },
            });
            mappedExpenses += 1;
          }
          const journal = await tx.journalEntry.findFirst({
            where: {
              organizationId,
              sourceModule: expense.workId ? "PROJECT_EXPENSE" : "GENERAL_EXPENSE",
              sourceId: expense.id,
            },
            include: {
              lines: { where: { debit: { gt: 0 }, account: { accountType: "EXPENSE" } } },
            },
          });
          for (const line of journal?.lines ?? []) {
            if (line.accountId === expenseLedgerAccountId) continue;
            const oldAccountId = line.accountId;
            await tx.journalLine.update({
              where: { id: line.id },
              data: { accountId: expenseLedgerAccountId },
            });
            reclassifiedJournalLines += 1;
            const reversals = await tx.journalEntry.findMany({
              where: { organizationId, sourceModule: "JOURNAL_REVERSAL", sourceId: journal!.id },
              select: { id: true },
            });
            if (reversals.length) {
              const result = await tx.journalLine.updateMany({
                where: {
                  journalEntryId: { in: reversals.map((item) => item.id) },
                  accountId: oldAccountId,
                },
                data: { accountId: expenseLedgerAccountId },
              });
              reclassifiedJournalLines += result.count;
            }
          }
        }
      });
    }
  }

  console.log(`Mapped expense heads: ${mappedHeads}`);
  console.log(`Mapped historical expenses: ${mappedExpenses}`);
  console.log(`Reclassified journal lines: ${reclassifiedJournalLines}`);
  const [unmappedHeadCount, unmappedExpenseCount, expenses, journals] = await Promise.all([
    prisma.expenseHead.count({ where: { ledgerAccountId: null } }),
    prisma.expense.count({ where: { expenseHeadId: { not: null }, expenseLedgerAccountId: null } }),
    prisma.expense.findMany({
      where: { expenseHeadId: { not: null } },
      select: { id: true, expenseLedgerAccountId: true },
    }),
    prisma.journalEntry.findMany({
      where: { sourceModule: { in: ["PROJECT_EXPENSE", "GENERAL_EXPENSE"] } },
      include: { lines: { include: { account: { select: { accountType: true } } } } },
    }),
  ]);
  const ledgerByExpense = new Map(
    expenses.map((expense) => [expense.id, expense.expenseLedgerAccountId]),
  );
  const misclassifiedJournals = journals.filter((journal) => {
    const expected = ledgerByExpense.get(journal.sourceId);
    if (!expected) return false;
    return !journal.lines.some(
      (line) =>
        line.account.accountType === "EXPENSE" && line.debit.gt(0) && line.accountId === expected,
    );
  }).length;
  const unbalancedJournals = journals.filter(
    (journal) =>
      journal.lines.reduce((net, line) => net + Number(line.debit) - Number(line.credit), 0) !== 0,
  ).length;
  console.log(`Verification - unmapped heads: ${unmappedHeadCount}`);
  console.log(`Verification - unmapped expenses: ${unmappedExpenseCount}`);
  console.log(`Verification - misclassified expense journals: ${misclassifiedJournals}`);
  console.log(`Verification - unbalanced expense journals: ${unbalancedJournals}`);
  if (
    apply &&
    (unmappedHeadCount || unmappedExpenseCount || misclassifiedJournals || unbalancedJournals)
  ) {
    throw new Error("Expense-to-chart verification failed");
  }
  if (!apply) console.log("Dry run only. Add --apply to persist these mappings.");
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
