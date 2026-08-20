import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function inspectData() {
  console.log("\n=== EXISTING EXPENSE HEADS ===");
  const heads = await prisma.expenseHead.findMany({
    include: {
      expenses: {
        where: { status: { notIn: ["REJECTED", "CANCELLED", "AMENDED"] } },
        select: { id: true, amount: true, workId: true, status: true },
      },
    },
    orderBy: { name: "asc" },
  });

  for (const head of heads) {
    console.log(`\n${head.name}`);
    console.log(`  ID: ${head.id}`);
    console.log(`  Budget Category: ${head.budgetCategory || "NOT SET"}`);
    console.log(`  Active: ${head.isActive}`);
    console.log(`  Active Expenses: ${head.expenses.length}`);
    let total = 0;
    for (const exp of head.expenses) {
      console.log(`    - ${exp.id}: ${exp.amount} (${exp.status})`);
      total += Number(exp.amount);
    }
    if (head.expenses.length > 0) {
      console.log(`  Total: ${total}`);
    }
  }

  console.log("\n=== LED DISPLAY PROJECT ===");
  const ledProject = await prisma.cmsWork.findFirst({
    where: { name: "LED Display" },
    include: {
      expenses: {
        where: { status: { notIn: ["REJECTED"] } },
        include: { expenseHead: { select: { name: true, budgetCategory: true } } },
      },
    },
  });

  if (ledProject) {
    console.log(`Project: ${ledProject.name}`);
    console.log(`\nAll expenses (including AMENDED/CANCELLED):`);
    let active = 0, amended = 0, cancelled = 0;
    for (const exp of ledProject.expenses) {
      console.log(`  ${exp.referenceNo} | ${exp.expenseHead?.name || "NO HEAD"} | ${exp.amount} | ${exp.status}`);
      if (exp.status === "APPROVED") active += Number(exp.amount);
      if (exp.status === "AMENDED") amended += Number(exp.amount);
      if (exp.status === "CANCELLED") cancelled += Number(exp.amount);
    }
    console.log(`\nTotals:`);
    console.log(`  APPROVED (active): ${active}`);
    console.log(`  AMENDED: ${amended}`);
    console.log(`  CANCELLED: ${cancelled}`);
    console.log(`  ALL: ${active + amended + cancelled}`);
  } else {
    console.log("LED Display project not found");
  }

  await prisma.$disconnect();
}

inspectData().catch(console.error);
