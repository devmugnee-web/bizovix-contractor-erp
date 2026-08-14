import { PrismaClient, PurchaseType, TenderStatus, GuaranteeType, InstrumentStatus, AccountType, ExpenseStatus, ReceiptStatus, CmsWorkStatus } from "@prisma/client";
import { PERMISSIONS } from "@bizovix/types";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function daysAgo(days: number): Date {
  return daysFromNow(-days);
}

async function main() {
  console.log("Seeding Bizovix Contractor ERP demo data...");

  const organization = await prisma.organization.upsert({
    where: { id: "seed-org-bizovix" },
    update: {},
    create: {
      id: "seed-org-bizovix",
      name: "Bizovix Construction Ltd",
      shortName: "BCL",
    },
  });

  await prisma.subscription.upsert({
    where: { organizationId: organization.id },
    update: {},
    create: {
      organizationId: organization.id,
      plan: "TRIAL",
      status: "TRIALING",
      trialEndsAt: daysFromNow(30),
    },
  });

  for (const key of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key, group: key.split(".")[0] ?? "general" },
    });
  }
  const allPermissions = await prisma.permission.findMany();

  const adminRole = await prisma.role.upsert({
    where: { organizationId_name: { organizationId: organization.id, name: "Admin" } },
    update: {},
    create: {
      organizationId: organization.id,
      name: "Admin",
      description: "Full access to all modules",
      isSystem: true,
    },
  });

  for (const permission of allPermissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRole.id, permissionId: permission.id } },
      update: {},
      create: { roleId: adminRole.id, permissionId: permission.id },
    });
  }

  const passwordHash = await bcrypt.hash("Admin@123", 10);
  const adminUser = await prisma.user.upsert({
    where: { email: "admin@bizovix.com" },
    update: {},
    create: {
      email: "admin@bizovix.com",
      passwordHash,
      name: "Saiful Islam",
    },
  });

  await prisma.organizationUser.upsert({
    where: { organizationId_userId: { organizationId: organization.id, userId: adminUser.id } },
    update: {},
    create: {
      organizationId: organization.id,
      userId: adminUser.id,
      roleId: adminRole.id,
      isDefault: true,
    },
  });

  const masterDefs = [
    { shortName: "DPHE", fullName: "Department of Public Health Engineering" },
    { shortName: "PWD", fullName: "Public Works Department" },
    { shortName: "WASA", fullName: "Water Supply and Sewerage Authority" },
    { shortName: "LGED", fullName: "Local Government Engineering Department" },
    { shortName: "BRTC", fullName: "Bangladesh Road Transport Corporation" },
    { shortName: "RHD", fullName: "Roads and Highways Department" },
    { shortName: "Education Board", fullName: "Board of Intermediate and Secondary Education" },
    { shortName: "BTV", fullName: "Bangladesh Television" },
    { shortName: "SREDA", fullName: "Sustainable and Renewable Energy Development Authority" },
    { shortName: "BKSP", fullName: "Bangladesh Krira Shikkha Protishtan" },
    { shortName: "Mymensingh PS", fullName: "Mymensingh Police Super Office" },
    { shortName: "Marine Academy", fullName: "Bangladesh Marine Academy" },
    { shortName: "BUP", fullName: "Bangladesh University of Professionals" },
    { shortName: "BFRI", fullName: "Bangladesh Fisheries Research Institute" },
    { shortName: "Dewanganj TSC", fullName: "Dewanganj Technical School and College" },
  ];
  const masters: Record<string, { id: string }> = {};
  for (const m of masterDefs) {
    masters[m.shortName] = await prisma.organizationMaster.upsert({
      where: { organizationId_shortName: { organizationId: organization.id, shortName: m.shortName } },
      update: {},
      create: { organizationId: organization.id, shortName: m.shortName, fullName: m.fullName },
    });
  }

  const dbbl = await prisma.bankAccount.create({
    data: {
      organizationId: organization.id,
      accountName: "DBBL A/C",
      accountType: AccountType.BANK,
      bankName: "Dutch-Bangla Bank",
      accountNumber: "1012000045781",
      currentBalance: 320_000_000,
    },
  });
  const primeBank = await prisma.bankAccount.create({
    data: {
      organizationId: organization.id,
      accountName: "Prime Bank A/C",
      accountType: AccountType.BANK,
      bankName: "Prime Bank PLC",
      accountNumber: "2091000078452",
      currentBalance: 600_000_000,
    },
  });
  const cash = await prisma.bankAccount.create({
    data: {
      organizationId: organization.id,
      accountName: "Cash",
      accountType: AccountType.CASH,
      currentBalance: 13_000_000,
    },
  });
  const bankAccounts = [dbbl, primeBank, cash];

  const now = new Date();
  await prisma.monthlyTarget.upsert({
    where: {
      organizationId_year_month: {
        organizationId: organization.id,
        year: now.getFullYear(),
        month: now.getMonth() + 1,
      },
    },
    update: {},
    create: {
      organizationId: organization.id,
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      targetAmount: 100_000_000,
    },
  });

  // --- Tenders -----------------------------------------------------------
  // 35 tenders submitted this year: 12 won (NOA/awarded -> moved to ONGOING),
  // 8 under process, 15 rejected. This makes "Success Rate" a real 12/35 = 34.29%.
  const categories = ["LED Display", "Electrical Works", "IT Solutions", "Sound System", "Others"];
  const masterList = Object.values(masters);

  const flagshipProjects = [
    { name: "Dhaka Water Supply Extension", value: 285_000_000, progress: 65, category: "LED Display" },
    { name: "Rural Road Improvement Project", value: 227_500_000, progress: 40, category: "Electrical Works" },
    { name: "Government Building Construction", value: 183_000_000, progress: 75, category: "LED Display" },
    { name: "Drainage System Development", value: 154_000_000, progress: 30, category: "IT Solutions" },
    { name: "Upazila Complex Construction", value: 135_000_000, progress: 55, category: "LED Display" },
  ];
  for (const [i, p] of flagshipProjects.entries()) {
    await prisma.tender.create({
      data: {
        organizationId: organization.id,
        organizationMasterId: masterList[i % masterList.length]!.id,
        egpTenderId: `102${4400 + i}`,
        workName: p.name,
        category: p.category,
        contractValue: p.value,
        status: TenderStatus.ONGOING,
        progressPercentage: p.progress,
        submittedAt: daysAgo(60 + i * 10),
        awardedAt: daysAgo(30 + i * 5),
      },
    });
  }

  const fillerWonCategories = ["Electrical Works", "IT Solutions", "Sound System", "Sound System", "Others", "LED Display", "Electrical Works"];
  for (let i = 0; i < 7; i++) {
    await prisma.tender.create({
      data: {
        organizationId: organization.id,
        organizationMasterId: masterList[i % masterList.length]!.id,
        egpTenderId: `102${4600 + i}`,
        workName: `Supply & Installation Contract ${i + 1}`,
        category: fillerWonCategories[i]!,
        contractValue: 20_000_000 + i * 8_500_000,
        status: TenderStatus.ONGOING,
        progressPercentage: 20 + i * 8,
        submittedAt: daysAgo(50 + i * 4),
        awardedAt: daysAgo(20 + i * 3),
      },
    });
  }

  for (let i = 0; i < 8; i++) {
    await prisma.tender.create({
      data: {
        organizationId: organization.id,
        organizationMasterId: masterList[i % masterList.length]!.id,
        egpTenderId: `102${4700 + i}`,
        workName: `Tender Under Evaluation ${i + 1}`,
        category: categories[i % categories.length]!,
        contractValue: 15_000_000 + i * 3_000_000,
        status: TenderStatus.UNDER_PROCESS,
        submittedAt: daysAgo(10 + i * 2),
      },
    });
  }

  for (let i = 0; i < 15; i++) {
    await prisma.tender.create({
      data: {
        organizationId: organization.id,
        organizationMasterId: masterList[i % masterList.length]!.id,
        egpTenderId: `102${4800 + i}`,
        workName: `Tender Submission ${i + 1}`,
        category: categories[i % categories.length]!,
        contractValue: 8_000_000 + i * 1_500_000,
        status: i % 3 === 0 ? TenderStatus.REJECTED : TenderStatus.SUBMITTED,
        submittedAt: daysAgo(5 + i),
      },
    });
  }

  // --- Document Purchases --------------------------------------------------
  const documentPurchaseDefs: Array<{
    type: PurchaseType;
    tenderId: string | null;
    master: string;
    work: string;
    price: number;
    estimatedAmount: number;
    account: (typeof bankAccounts)[number];
    daysAgo: number;
  }> = [
    { type: PurchaseType.EGP, tenderId: "1024587", master: "DPHE", work: "Supply of LED Display at Patuakhali", price: 5000, estimatedAmount: 8_500_000, account: dbbl, daysAgo: 3 },
    { type: PurchaseType.EGP, tenderId: "1024523", master: "PWD", work: "Electrical Works at Cox's Bazar", price: 3000, estimatedAmount: 12_750_000, account: primeBank, daysAgo: 5 },
    { type: PurchaseType.EGP, tenderId: "1024480", master: "LGED", work: "Road Improvement Work", price: 5000, estimatedAmount: 9_200_000, account: dbbl, daysAgo: 11 },
    { type: PurchaseType.EGP, tenderId: "1024401", master: "RHD", work: "Rehabilitation of Road", price: 4000, estimatedAmount: 6_400_000, account: primeBank, daysAgo: 15 },
    { type: PurchaseType.EGP, tenderId: "1024322", master: "DPHE", work: "Drilling of Deep Tube Well", price: 2000, estimatedAmount: 4_800_000, account: dbbl, daysAgo: 24 },
    { type: PurchaseType.MANUAL, tenderId: null, master: "WASA", work: "Pipeline Extension Work", price: 2000, estimatedAmount: 7_250_000, account: cash, daysAgo: 8 },
    { type: PurchaseType.MANUAL, tenderId: null, master: "BRTC", work: "Office Building Construction", price: 1500, estimatedAmount: 14_000_000, account: cash, daysAgo: 12 },
    { type: PurchaseType.MANUAL, tenderId: null, master: "Education Board", work: "Renovation of College Building", price: 1000, estimatedAmount: 5_500_000, account: cash, daysAgo: 18 },
    { type: PurchaseType.EGP, tenderId: "1024290", master: "PWD", work: "Sound System Installation at Barisal", price: 3500, estimatedAmount: 8_750_000, account: primeBank, daysAgo: 30 },
    { type: PurchaseType.MANUAL, tenderId: null, master: "WASA", work: "Sewerage Line Upgrade", price: 1800, estimatedAmount: 6_900_000, account: cash, daysAgo: 35 },
    { type: PurchaseType.EGP, tenderId: "1024255", master: "LGED", work: "IT Solutions for Union Office", price: 4500, estimatedAmount: 11_500_000, account: dbbl, daysAgo: 40 },
    { type: PurchaseType.EGP, tenderId: "1024198", master: "RHD", work: "Bridge Approach Road Construction", price: 6000, estimatedAmount: 16_000_000, account: primeBank, daysAgo: 45 },
    { type: PurchaseType.EGP, tenderId: "1024176", master: "DPHE", work: "Water Treatment Plant Equipment", price: 4200, estimatedAmount: 10_500_000, account: dbbl, daysAgo: 48 },
    { type: PurchaseType.EGP, tenderId: "1024155", master: "PWD", work: "Government Office Renovation", price: 2800, estimatedAmount: 7_800_000, account: primeBank, daysAgo: 52 },
    { type: PurchaseType.EGP, tenderId: "1024120", master: "LGED", work: "Rural Market Development", price: 3200, estimatedAmount: 9_750_000, account: dbbl, daysAgo: 57 },
    { type: PurchaseType.EGP, tenderId: "1024098", master: "RHD", work: "Highway Lighting Installation", price: 5500, estimatedAmount: 13_200_000, account: primeBank, daysAgo: 63 },
    { type: PurchaseType.MANUAL, tenderId: null, master: "WASA", work: "Pump Station Maintenance", price: 1700, estimatedAmount: 4_250_000, account: cash, daysAgo: 68 },
    { type: PurchaseType.EGP, tenderId: "1024051", master: "DPHE", work: "Rural Water Supply Scheme", price: 3900, estimatedAmount: 8_900_000, account: dbbl, daysAgo: 72 },
    { type: PurchaseType.EGP, tenderId: "1024122", master: "LGED", work: "Electrical Work at Barisal Office", price: 3000, estimatedAmount: 7_500_000, account: dbbl, daysAgo: 76 },
    { type: PurchaseType.EGP, tenderId: "1023988", master: "BTV", work: "ICT Equipment Supply at BTV", price: 2500, estimatedAmount: 6_800_000, account: primeBank, daysAgo: 80 },
    { type: PurchaseType.EGP, tenderId: "1023781", master: "SREDA", work: "Solar System at Rajshahi", price: 4000, estimatedAmount: 9_600_000, account: dbbl, daysAgo: 84 },
    { type: PurchaseType.EGP, tenderId: "1023675", master: "BKSP", work: "Supply of PA System at BKSP", price: 2800, estimatedAmount: 5_900_000, account: primeBank, daysAgo: 88 },
  ];
  for (const d of documentPurchaseDefs) {
    const referenceDates: Record<string, string> = {
      "1024587": "2024-05-10T00:00:00.000Z",
      "1024523": "2024-05-08T00:00:00.000Z",
      "1024480": "2024-05-02T00:00:00.000Z",
      "1024401": "2024-04-28T00:00:00.000Z",
      "1024322": "2024-04-20T00:00:00.000Z",
    };
    await prisma.documentPurchase.create({
      data: {
        organizationId: organization.id,
        purchaseType: d.type,
        egpTenderId: d.tenderId,
        organizationMasterId: masters[d.master]!.id,
        paymentFromAccountId: d.account.id,
        tenderWorkName: d.work,
        purchaseDate: referenceDates[d.tenderId ?? ""] ? new Date(referenceDates[d.tenderId ?? ""]!) : daysAgo(d.daysAgo),
        documentPrice: d.price,
        estimatedTenderAmount: d.estimatedAmount,
      },
    });
  }

  // --- Tender Securities ----------------------------------------------------
  const tenderSecurityDefs = [
    { master: "DPHE", amount: 2_500_000, issued: 40, expires: 5, status: InstrumentStatus.ACTIVE },
    { master: "PWD", amount: 1_800_000, issued: 55, expires: 12, status: InstrumentStatus.ACTIVE },
    { master: "LGED", amount: 3_200_000, issued: 70, expires: 20, status: InstrumentStatus.ACTIVE },
    { master: "RHD", amount: 1_200_000, issued: 90, expires: -10, status: InstrumentStatus.EXPIRED },
    { master: "WASA", amount: 2_100_000, issued: 30, expires: 45, status: InstrumentStatus.ACTIVE },
  ];
  for (const t of tenderSecurityDefs) {
    await prisma.tenderSecurity.create({
      data: {
        organizationId: organization.id,
        organizationMasterId: masters[t.master]!.id,
        bankAccountId: dbbl.id,
        instrumentNo: `TS-${Math.floor(Math.random() * 900000 + 100000)}`,
        amount: t.amount,
        issueDate: daysAgo(t.issued),
        expiryDate: daysFromNow(t.expires),
        status: t.status,
      },
    });
  }

  // --- Performance Guarantees (PG/BG) ---------------------------------------
  const pgBgDefs = [
    { master: "DPHE", type: GuaranteeType.PG, amount: 5_000_000, issued: 60, expires: 15 },
    { master: "PWD", type: GuaranteeType.BG, amount: 3_500_000, issued: 45, expires: 28 },
    { master: "LGED", type: GuaranteeType.PG, amount: 4_200_000, issued: 90, expires: 60 },
    { master: "RHD", type: GuaranteeType.BG, amount: 2_800_000, issued: 30, expires: 90 },
  ];
  for (const p of pgBgDefs) {
    await prisma.performanceGuarantee.create({
      data: {
        organizationId: organization.id,
        organizationMasterId: masters[p.master]!.id,
        bankAccountId: primeBank.id,
        type: p.type,
        instrumentNo: `${p.type}-${Math.floor(Math.random() * 900000 + 100000)}`,
        amount: p.amount,
        issueDate: daysAgo(p.issued),
        expiryDate: daysFromNow(p.expires),
        status: InstrumentStatus.ACTIVE,
      },
    });
  }

  // --- CMS Ongoing Works ---------------------------------------------------
  const cmsWorkDefs = [
    { id: "seed-cms-work-01", master: "DPHE", name: "Supply of LED Display at Patuakhali", category: "LED Display", value: 12_500_000 },
    { id: "seed-cms-work-02", master: "LGED", name: "Electrical Work at Barisal Office", category: "Electrical", value: 8_750_000 },
    { id: "seed-cms-work-03", master: "BTV", name: "ICT Equipment Supply at BTV", category: "ICT", value: 6_200_000 },
    { id: "seed-cms-work-04", master: "SREDA", name: "Solar System at Rajshahi", category: "Solar System", value: 9_800_000 },
    { id: "seed-cms-work-05", master: "BKSP", name: "Supply of PA System at BKSP", category: "PA System", value: 4_500_000 },
    { id: "seed-cms-work-06", master: "Mymensingh PS", name: "LED Display for Mymensingh PS", category: "LED Display", value: 7_650_000 },
    { id: "seed-cms-work-07", master: "BTV", name: "Digital Studio Setup at BTV", category: "ICT", value: 11_200_000 },
    { id: "seed-cms-work-08", master: "Marine Academy", name: "Lighting Work at Marine Academy", category: "Electrical", value: 5_300_000 },
    { id: "seed-cms-work-09", master: "BUP", name: "Infrastructure Work at BUP", category: "Civil Work", value: 9_750_000 },
    { id: "seed-cms-work-10", master: "BFRI", name: "Equipment Supply at BFRI", category: "Equipment Supply", value: 6_900_000 },
    { id: "seed-cms-work-11", master: "Dewanganj TSC", name: "LED Display at Dewanganj TSC", category: "LED Display", value: 5_450_000 },
    { id: "seed-cms-work-12", master: "DPHE", name: "IT & Networking at DPHE HQ", category: "ICT", value: 9_000_000 },
  ];
  for (const work of cmsWorkDefs) {
    await prisma.cmsWork.upsert({
      where: { id: work.id },
      update: {},
      create: {
        id: work.id,
        organizationId: organization.id,
        organizationMasterId: masters[work.master]!.id,
        workName: work.name,
        workCategory: work.category,
        contractValue: work.value,
        status: CmsWorkStatus.ONGOING,
        startDate: new Date("2024-05-16"),
        expectedCompletionDate: new Date("2025-05-15"),
      },
    });
  }

  const archivedCmsWorkDefs = [
    ["seed-cms-archived-01", "DPHE", "Supply of LED Display at Patuakhali", "LED Display", 12_500_000, "2024-06-12"],
    ["seed-cms-archived-02", "LGED", "Electrical Work at Barisal Office", "Electrical", 8_750_000, "2024-05-28"],
    ["seed-cms-archived-03", "BTV", "ICT Equipment Supply at BTV", "ICT", 6_200_000, "2024-04-15"],
    ["seed-cms-archived-04", "SREDA", "Solar System at Rajshahi", "Solar System", 9_800_000, "2024-03-30"],
    ["seed-cms-archived-05", "BKSP", "Supply of PA System at BKSP", "PA System", 4_500_000, "2024-03-18"],
    ["seed-cms-archived-06", "Mymensingh PS", "LED Display for Mymensingh PS", "LED Display", 7_650_000, "2024-02-05"],
    ["seed-cms-archived-07", "BTV", "Digital Studio Setup at BTV", "ICT", 11_200_000, "2024-01-20"],
    ["seed-cms-archived-08", "Marine Academy", "Lighting Work at Marine Academy", "Electrical", 5_300_000, "2024-01-10"],
    ["seed-cms-archived-09", "BUP", "Infrastructure Work at BUP", "Civil Work", 9_750_000, "2023-12-28"],
    ["seed-cms-archived-10", "BFRI", "Equipment Supply at BFRI", "Equipment Supply", 6_900_000, "2023-12-15"],
    ["seed-cms-archived-11", "Dewanganj TSC", "LED Display at Dewanganj TSC", "LED Display", 5_450_000, "2023-11-30"],
    ["seed-cms-archived-12", "DPHE", "IT & Networking at DPHE HQ", "ICT", 9_000_000, "2023-11-20"],
    ["seed-cms-archived-13", "LGED", "District Road Improvement Package", "Civil Work", 80_000_000, "2023-10-31"],
    ["seed-cms-archived-14", "DPHE", "Municipal Water Supply Package", "Equipment Supply", 85_000_000, "2023-10-12"],
    ["seed-cms-archived-15", "BTV", "Broadcast Automation Upgrade", "ICT", 90_000_000, "2023-09-25"],
    ["seed-cms-archived-16", "SREDA", "Regional Solar Mini Grid", "Solar System", 95_000_000, "2023-09-10"],
    ["seed-cms-archived-17", "BKSP", "Sports Complex PA Modernization", "PA System", 88_000_000, "2023-08-22"],
    ["seed-cms-archived-18", "Mymensingh PS", "Command Center Electrical Works", "Electrical", 92_000_000, "2023-08-05"],
    ["seed-cms-archived-19", "Marine Academy", "Marine Simulator Infrastructure", "Equipment Supply", 100_000_000, "2023-07-19"],
    ["seed-cms-archived-20", "BUP", "Campus Network Expansion", "ICT", 86_000_000, "2023-06-30"],
    ["seed-cms-archived-21", "BFRI", "Research Laboratory Modernization", "Equipment Supply", 91_000_000, "2023-06-14"],
    ["seed-cms-archived-22", "Dewanganj TSC", "Technical Lab Development", "Civil Work", 89_000_000, "2023-05-26"],
    ["seed-cms-archived-23", "DPHE", "Coastal Water Treatment System", "Equipment Supply", 94_000_000, "2023-05-08"],
    ["seed-cms-archived-24", "LGED", "Urban Street Lighting Package", "Electrical", 87_000_000, "2023-04-20"],
    ["seed-cms-archived-25", "BTV", "Digital Transmission Expansion", "ICT", 96_000_000, "2023-04-02"],
    ["seed-cms-archived-26", "SREDA", "Government Rooftop Solar Package", "Solar System", 98_000_000, "2023-03-16"],
    ["seed-cms-archived-27", "BKSP", "National Sports Facility Upgrade", "Civil Work", 99_000_000, "2023-02-28"],
    ["seed-cms-archived-28", "BUP", "Academic Complex Technology Package", "ICT", 100_800_000, "2023-02-10"],
  ] as const;
  for (const [id, master, name, category, value, completedAt] of archivedCmsWorkDefs) {
    const completionDate = new Date(completedAt);
    const startDate = new Date(completionDate);
    startDate.setMonth(startDate.getMonth() - 9);
    await prisma.cmsWork.upsert({
      where: { id },
      update: {},
      create: {
        id,
        organizationId: organization.id,
        organizationMasterId: masters[master]!.id,
        workName: name,
        workCategory: category,
        contractValue: value,
        status: CmsWorkStatus.ARCHIVED,
        startDate,
        expectedCompletionDate: completionDate,
        completionDate,
      },
    });
  }

  // --- Credit Commitments ----------------------------------------------------
  const creditCommitmentDefs = [
    { master: "DPHE", amount: 8450, due: 12, charged: false },
    { master: "PWD", amount: 6200, due: -5, charged: true },
    { master: "LGED", amount: 9100, due: 25, charged: false },
  ];
  for (const c of creditCommitmentDefs) {
    await prisma.creditCommitment.create({
      data: {
        organizationId: organization.id,
        organizationMasterId: masters[c.master]!.id,
        amount: c.amount,
        chargeDate: daysFromNow(c.due),
        isCharged: c.charged,
      },
    });
  }

  // --- Expenses / Receipts ---------------------------------------------------
  const expenseDefs = [
    { category: "Site Operations", amount: 45_500, status: ExpenseStatus.APPROVED, days: 4 },
    { category: "Office Rent", amount: 120_000, status: ExpenseStatus.APPROVED, days: 15 },
    { category: "Transport", amount: 32_000, status: ExpenseStatus.PENDING, days: 2 },
    { category: "Utilities", amount: 18_500, status: ExpenseStatus.PENDING, days: 1 },
    { category: "Materials", amount: 610_000, status: ExpenseStatus.APPROVED, days: 20 },
    { category: "Labour", amount: 275_000, status: ExpenseStatus.PENDING, days: 6 },
  ];
  for (const e of expenseDefs) {
    await prisma.expense.create({
      data: {
        organizationId: organization.id,
        category: e.category,
        amount: e.amount,
        expenseDate: daysAgo(e.days),
        dueDate: e.status === ExpenseStatus.PENDING ? daysFromNow(10) : null,
        status: e.status,
      },
    });
  }

  const receiptDefs = [
    { amount: 1_250_000, status: ReceiptStatus.RECEIVED, days: 3, ref: "REC-2024-0098" },
    { amount: 4_800_000, status: ReceiptStatus.RECEIVED, days: 18, ref: "REC-2024-0091" },
    { amount: 2_100_000, status: ReceiptStatus.PENDING, days: 1, ref: "REC-2024-0102" },
    { amount: 6_400_000, status: ReceiptStatus.PENDING, days: 40, ref: "REC-2024-0075" },
    { amount: 3_300_000, status: ReceiptStatus.RECEIVED, days: 25, ref: "REC-2024-0088" },
  ];
  for (const r of receiptDefs) {
    await prisma.receipt.create({
      data: {
        organizationId: organization.id,
        referenceNo: r.ref,
        amount: r.amount,
        receiptDate: daysAgo(r.days),
        status: r.status,
      },
    });
  }

  // --- Documents --------------------------------------------------------------
  const documentDefs = [
    { name: "Trade License 2026", category: "Legal", expires: 31 },
    { name: "VAT Registration Certificate", category: "Legal", expires: 60 },
    { name: "Company Incorporation Certificate", category: "Legal", expires: null },
    { name: "Tax Identification Certificate", category: "Legal", expires: 90 },
    { name: "Bank Solvency Certificate", category: "Finance", expires: 20 },
  ];
  for (const doc of documentDefs) {
    await prisma.document.create({
      data: {
        organizationId: organization.id,
        name: doc.name,
        category: doc.category,
        expiryDate: doc.expires === null ? null : daysFromNow(doc.expires),
      },
    });
  }

  // --- Reminders ---------------------------------------------------------------
  const reminderDefs = [
    { type: "TENDER_SECURITY_EXPIRY", title: "Tender Security Expiry", subtitle: "03 Instruments will expire in next 7 days", due: 7 },
    { type: "PG_BG_EXPIRY", title: "PG/BG Expiry", subtitle: "02 Guarantees will expire in next 15 days", due: 15 },
    { type: "CREDIT_COMMITMENT_CHARGE", title: "Credit Commitment Charge", subtitle: "03 Commitments charge due", due: 12 },
    { type: "DOCUMENT_EXPIRY", title: "Document Expiry", subtitle: "05 Documents will expire soon", due: 31 },
    { type: "TENDER_OPENING", title: "Tender Opening Today", subtitle: "02 Tenders scheduled for opening today", due: 0 },
    { type: "TENDER_SECURITY_EXPIRY", title: "Tender Security Expiry", subtitle: "01 Instrument expiring soon", due: 20 },
    { type: "PG_BG_EXPIRY", title: "PG/BG Expiry", subtitle: "01 Guarantee expiring soon", due: 28 },
    { type: "CREDIT_COMMITMENT_CHARGE", title: "Credit Commitment Charge", subtitle: "01 Commitment charge due", due: 25 },
    { type: "DOCUMENT_EXPIRY", title: "Document Expiry", subtitle: "Bank Solvency Certificate expiring soon", due: 20 },
    { type: "TENDER_OPENING", title: "Tender Opening Upcoming", subtitle: "01 Tender scheduled for opening", due: 3 },
    { type: "LICENSE_RENEWAL", title: "License Renewal", subtitle: "Trade License renewal due soon", due: 31 },
    { type: "SUBSCRIPTION_TRIAL", title: "Trial Ending Soon", subtitle: "Upgrade to Premium before trial ends", due: 30 },
  ];
  for (const r of reminderDefs) {
    await prisma.reminder.create({
      data: {
        organizationId: organization.id,
        type: r.type,
        title: r.title,
        subtitle: r.subtitle,
        dueDate: daysFromNow(r.due),
      },
    });
  }

  await prisma.appSetting.upsert({
    where: { organizationId_key: { organizationId: organization.id, key: "loansAndEmi" } },
    update: {},
    create: {
      organizationId: organization.id,
      key: "loansAndEmi",
      value: { amount: 165_000_000, nextEmiDate: daysFromNow(18).toISOString() },
    },
  });

  console.log("Seed complete.");
  console.log("Admin login -> email: admin@bizovix.com / password: Admin@123");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
