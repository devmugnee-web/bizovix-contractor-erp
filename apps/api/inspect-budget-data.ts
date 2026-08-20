import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function inspectData() {
  const works = await prisma.cmsWork.findMany({ where: { workName: "LED Display" } });
  const workId = works[0]?.id;

  console.log("\n=== FULL EXPENSE DETAIL (LED Display) ===");
  const expenses = await prisma.expense.findMany({
    where: { workId },
    include: { expenseHead: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  for (const exp of expenses) {
    console.log(
      `id=${exp.id} | ref=${exp.referenceNo} | head=${exp.expenseHead?.name} | amount=${exp.amount} | status=${exp.status} | replacesExpenseId=${exp.replacesExpenseId ?? "-"}`
    );
  }

  console.log("\n=== OLD (BUGGY) LOGIC SIMULATION: status != REJECTED, group by expenseHeadId ===");
  const oldLogicExpenses = await prisma.expense.findMany({
    where: { workId, status: { not: "REJECTED" } },
    include: { expenseHead: { select: { name: true } } },
  });
  const byHeadOld = new Map<string, number>();
  for (const e of oldLogicExpenses) {
    const name = e.expenseHead?.name ?? "NONE";
    byHeadOld.set(name, (byHeadOld.get(name) ?? 0) + Number(e.amount));
  }
  for (const [name, total] of byHeadOld) {
    console.log(`  ${name}: ${total}`);
  }

  console.log("\n=== NEW (FIXED) LOGIC: exclude REJECTED/CANCELLED/AMENDED, group by expenseHeadId ===");
  const newLogicExpenses = await prisma.expense.findMany({
    where: { workId, status: { notIn: ["REJECTED", "CANCELLED", "AMENDED"] } },
    include: { expenseHead: { select: { name: true } } },
  });
  const byHeadNew = new Map<string, number>();
  for (const e of newLogicExpenses) {
    const name = e.expenseHead?.name ?? "NONE";
    byHeadNew.set(name, (byHeadNew.get(name) ?? 0) + Number(e.amount));
  }
  for (const [name, total] of byHeadNew) {
    console.log(`  ${name}: ${total}`);
  }

  await prisma.$disconnect();
}

inspectData().catch(console.error);
