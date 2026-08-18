import { PrismaClient, PurchaseType, TenderStatus, GuaranteeType, InstrumentStatus, AccountType, ExpenseStatus, ReceiptStatus, CmsWorkStatus, ContractType, ContractStatus, ProjectBudgetStatus, BillType, BillStatus, AdjustmentDirection, DeductionCalcType, VariationType, VariationStatus, TimeExtensionStatus, PartyRole, PartyStatus, MasterCategoryType, ItemType, ItemStatus, PrPriority, PrStatus, RfqStatus, QuotationStatus, ComparativeStatementStatus, TechnicalComplianceStatus, PurchaseOrderStatus, GrnInspectionStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { syncPermissions } from "./lib/sync-permissions";
import { seedDemoBankAccounts } from "../src/demo-bank-seed";

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

  await syncPermissions(prisma);

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

  // Additional demo staff users referenced by fixed id further below (general expenses),
  // so those foreign keys point at real rows rather than dangling id strings.
  const staffDefs = [
    { id: "seed-user-shajib", email: "shajib@bizovix.com", name: "Shajib Ahmed" },
    { id: "seed-user-galib", email: "galib@bizovix.com", name: "Galib Hasan" },
    { id: "seed-user-rokon", email: "rokon@bizovix.com", name: "Rokon Uddin" },
  ];
  for (const staff of staffDefs) {
    const staffUser = await prisma.user.upsert({
      where: { id: staff.id },
      update: {},
      create: { id: staff.id, email: staff.email, passwordHash, name: staff.name },
    });
    await prisma.organizationUser.upsert({
      where: { organizationId_userId: { organizationId: organization.id, userId: staffUser.id } },
      update: {},
      create: { organizationId: organization.id, userId: staffUser.id, roleId: adminRole.id, isDefault: true },
    });
  }

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

  const { dbbl, primeBank, cash, islamiBank } = await seedDemoBankAccounts(prisma, organization.id);
  const bankAccounts = [dbbl, primeBank, cash, islamiBank];

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

  // --- Flagship coherent workflow tender ------------------------------------
  // Tender 1024587 (DPHE, BDT 12,500,000) traces the full workflow end-to-end:
  // Tender -> Document Purchase -> Tender Security -> Credit Commitment -> PG/BG -> CMS Work
  // -> Project Expense -> Receipt -> Documents -> Reminders, all via real relational FKs
  // (never by re-matching egpTenderId strings).
  const flagshipTender = await prisma.tender.upsert({
    where: { id: "seed-tender-1024587" },
    update: {},
    create: {
      id: "seed-tender-1024587",
      organizationId: organization.id,
      organizationMasterId: masters["DPHE"]!.id,
      egpTenderId: "1024587",
      workName: "Supply of LED Display at Patuakhali",
      category: "LED Display",
      tenderType: "Open Tender",
      procurementMethod: "OTM",
      tenderMethod: "Single Stage One Envelope",
      contractValue: 12_500_000,
      status: TenderStatus.ONGOING,
      publishedDate: new Date("2024-04-15T00:00:00.000Z"),
      documentPurchaseDeadline: new Date("2024-05-05T00:00:00.000Z"),
      submissionDeadline: new Date("2024-05-12T00:00:00.000Z"),
      openingDate: new Date("2024-05-13T00:00:00.000Z"),
      tenderSecurityRequired: true,
      estimatedTenderSecurityAmount: 500_000,
      assignedToName: "Saiful Islam",
      description:
        "Flagship demo tender tracing the full Tender -> Document Purchase -> Tender Security -> Credit Commitment -> PG/BG -> Project workflow.",
      submissionDate: new Date("2024-05-10T00:00:00.000Z"),
      submissionMethod: "Online (e-GP)",
      quotedAmount: 12_500_000,
      submittedById: adminUser.id,
      submittedByName: adminUser.name,
      submissionReference: "EGP-SUB-1024587",
      checklistStatus: "Completed",
      submittedAt: new Date("2024-05-10T00:00:00.000Z"),
      openingResult: "Lowest",
      lowestBidAmount: 12_500_000,
      lowestBidder: "Bizovix Construction Ltd",
      awardedAt: new Date("2024-05-16T00:00:00.000Z"),
      createdById: adminUser.id,
    },
  });

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
  let flagshipDocumentPurchase: { id: string } | null = null;
  for (const d of documentPurchaseDefs) {
    const referenceDates: Record<string, string> = {
      "1024587": "2024-05-10T00:00:00.000Z",
      "1024523": "2024-05-08T00:00:00.000Z",
      "1024480": "2024-05-02T00:00:00.000Z",
      "1024401": "2024-04-28T00:00:00.000Z",
      "1024322": "2024-04-20T00:00:00.000Z",
    };
    const data = {
      organizationId: organization.id,
      purchaseType: d.type,
      egpTenderId: d.tenderId,
      // Real FK linkage (not string matching) for the flagship coherent-workflow tender.
      linkedTenderId: d.tenderId === "1024587" ? flagshipTender.id : null,
      organizationMasterId: masters[d.master]!.id,
      paymentFromAccountId: d.account.id,
      tenderWorkName: d.work,
      purchaseDate: referenceDates[d.tenderId ?? ""] ? new Date(referenceDates[d.tenderId ?? ""]!) : daysAgo(d.daysAgo),
      documentPrice: d.price,
      estimatedTenderAmount: d.estimatedAmount,
    };
    // The flagship purchase is upserted by a fixed id so the whole downstream chain
    // (tender security, credit commitment, PG/BG) stays stable across repeated seed runs.
    const created =
      d.tenderId === "1024587"
        ? await prisma.documentPurchase.upsert({
            where: { id: "seed-document-purchase-1024587" },
            update: data,
            create: { id: "seed-document-purchase-1024587", ...data },
          })
        : await prisma.documentPurchase.create({ data });
    if (d.tenderId === "1024587") flagshipDocumentPurchase = created;
  }

  // --- Tender Securities ----------------------------------------------------
  // DPHE's tender security is created below, properly linked into the flagship chain
  // (real tenderId + a real TenderSecurityItem against the 1024587 document purchase)
  // instead of a flat, unlinked filler row.
  const flagshipSecurityAmount = 500_000;
  const flagshipMarginAmount = flagshipSecurityAmount * 0.1;
  // TenderSecurityItem.documentPurchaseId is unique — guard so re-running the seed
  // doesn't try to create a second item against the same (upserted, stable) purchase.
  const existingFlagshipSecurityItem = await prisma.tenderSecurityItem.findUnique({
    where: { documentPurchaseId: flagshipDocumentPurchase!.id },
  });
  if (!existingFlagshipSecurityItem) {
    await prisma.tenderSecurity.create({
      data: {
        organizationId: organization.id,
        tenderId: flagshipTender.id,
        organizationMasterId: masters["DPHE"]!.id,
        bankAccountId: dbbl.id,
        chargeFromAccountId: dbbl.id,
        instrumentNo: "TS-102587",
        amount: flagshipSecurityAmount,
        marginAmount: flagshipMarginAmount,
        bankFinanceAmount: flagshipSecurityAmount - flagshipMarginAmount,
        interestRate: 15,
        validityMonths: 6,
        issueDate: new Date("2024-05-13T00:00:00.000Z"),
        expiryDate: new Date("2024-11-13T00:00:00.000Z"),
        status: InstrumentStatus.ACTIVE,
        items: {
          create: [
            {
              documentPurchaseId: flagshipDocumentPurchase!.id,
              securityAmount: flagshipSecurityAmount,
              marginPercentage: 10,
              marginAmount: flagshipMarginAmount,
              bankFinanceAmount: flagshipSecurityAmount - flagshipMarginAmount,
              referenceNo: "PO-IBBL-88912",
            },
          ],
        },
      },
    });
    await prisma.documentPurchase.update({
      where: { id: flagshipDocumentPurchase!.id },
      data: { tenderSecurityStatus: "CREATED" },
    });
  }

  const tenderSecurityDefs = [
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

  // --- PG/BG Workflow + Performance Guarantee -------------------------------
  // DPHE's PG/BG is created below as a real, finalized workflow (matching the flow
  // pg-bg.service.ts drives in production) instead of a flat, unlinked filler row.
  const dpheContact = await prisma.organizationContact.upsert({
    where: {
      organizationId_organizationMasterId_mobile: {
        organizationId: organization.id,
        organizationMasterId: masters["DPHE"]!.id,
        mobile: "01712-345678",
      },
    },
    update: {},
    create: {
      organizationId: organization.id,
      organizationMasterId: masters["DPHE"]!.id,
      name: "Md. Mahbubur Rahman",
      designation: "Executive Engineer",
      mobile: "01712-345678",
      email: "mahbub.dphe@gov.bd",
      address: "DPHE Office, Patuakhali, Patuakhali Sadar, Patuakhali - 8600, Bangladesh",
    },
  });
  const flagshipPgBgWorkflow = await prisma.pgBgWorkflow.upsert({
    where: { documentPurchaseId: flagshipDocumentPurchase!.id },
    update: {},
    create: {
      organizationId: organization.id,
      documentPurchaseId: flagshipDocumentPurchase!.id,
      organizationMasterId: masters["DPHE"]!.id,
      contactId: dpheContact.id,
      tenderSecurityAmount: flagshipSecurityAmount,
      noaDate: new Date("2024-05-16T00:00:00.000Z"),
      noaAmount: 12_500_000,
      workCategory: "LED Display",
      acceptNoa: true,
      pgBgRequired: true,
      status: "FINALIZED",
      currentStep: 5,
      acceptedAt: new Date("2024-05-16T00:00:00.000Z"),
      acceptedById: adminUser.id,
      createdById: adminUser.id,
    },
  });
  const flagshipPerformanceGuarantee = await prisma.performanceGuarantee.upsert({
    where: { pgBgWorkflowId: flagshipPgBgWorkflow.id },
    update: {},
    create: {
      organizationId: organization.id,
      tenderId: flagshipTender.id,
      organizationMasterId: masters["DPHE"]!.id,
      bankAccountId: primeBank.id,
      pgBgWorkflowId: flagshipPgBgWorkflow.id,
      type: GuaranteeType.PG,
      instrumentNo: "PG-102587",
      amount: 5_000_000,
      issueDate: new Date("2024-05-20T00:00:00.000Z"),
      expiryDate: daysFromNow(15),
      status: InstrumentStatus.ACTIVE,
      createdById: adminUser.id,
    },
  });

  const pgBgDefs = [
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
    const isFlagship = work.id === "seed-cms-work-01";
    await prisma.cmsWork.upsert({
      where: { id: work.id },
      // Backfill the flagship linkage even if this row already existed from a seed run
      // before these fields were added — everything else stays untouched on conflict.
      update: isFlagship
        ? {
            tenderId: flagshipTender.id,
            documentPurchaseId: flagshipDocumentPurchase!.id,
            pgBgWorkflowId: flagshipPgBgWorkflow.id,
          }
        : {},
      create: {
        id: work.id,
        organizationId: organization.id,
        organizationMasterId: masters[work.master]!.id,
        // The flagship work is the real terminus of the Tender -> ... -> PG/BG chain above.
        tenderId: isFlagship ? flagshipTender.id : undefined,
        documentPurchaseId: isFlagship ? flagshipDocumentPurchase!.id : undefined,
        pgBgWorkflowId: isFlagship ? flagshipPgBgWorkflow.id : undefined,
        workName: work.name,
        workCategory: work.category,
        contractValue: work.value,
        status: CmsWorkStatus.ONGOING,
        startDate: new Date("2024-05-16"),
        expectedCompletionDate: new Date("2025-05-15"),
        createdById: isFlagship ? adminUser.id : undefined,
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
  // DPHE's credit commitment charge is created below, properly linked into the flagship
  // chain (real tenderId + a real CreditCommitmentItem against the 1024587 document
  // purchase), matching what credit-commitments.service.ts's create() flow produces.
  // CreditCommitmentItem.documentPurchaseId is unique — guard so re-running the seed
  // doesn't try to create a second item against the same (upserted, stable) purchase.
  const existingFlagshipCommitmentItem = await prisma.creditCommitmentItem.findUnique({
    where: { documentPurchaseId: flagshipDocumentPurchase!.id },
  });
  if (!existingFlagshipCommitmentItem) {
    await prisma.creditCommitment.create({
      data: {
        organizationId: organization.id,
        tenderId: flagshipTender.id,
        organizationMasterId: masters["DPHE"]!.id,
        paymentFromAccountId: dbbl.id,
        amount: 8450,
        totalAmount: 8450,
        chargeDate: daysFromNow(12),
        paymentDate: daysFromNow(12),
        isCharged: false,
        createdById: adminUser.id,
        items: {
          create: [
            {
              documentPurchaseId: flagshipDocumentPurchase!.id,
              bankAccountId: dbbl.id,
              chargeAmount: 8450,
            },
          ],
        },
      },
    });
  }

  const creditCommitmentDefs = [
    { master: "PWD", amount: 6200, due: -5, charged: true },
    { master: "LGED", amount: 9100, due: 25, charged: false },
  ];
  for (const c of creditCommitmentDefs) {
    await prisma.creditCommitment.create({
      data: {
        organizationId: organization.id,
        organizationMasterId: masters[c.master]!.id,
        paymentFromAccountId: primeBank.id,
        amount: c.amount,
        totalAmount: c.amount,
        chargeDate: daysFromNow(c.due),
        paymentDate: daysFromNow(c.due),
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

  const generalExpenseHeadNames = ["Office Supplies", "Internet & Telephone", "Transport", "Refreshment", "Printing & Photocopy"] as const;
  const generalExpenseHeads: Record<string, string> = {};
  for (const name of generalExpenseHeadNames) {
    const head = await prisma.expenseHead.upsert({
      where: { organizationId_name: { organizationId: organization.id, name } },
      update: { isActive: true },
      create: { organizationId: organization.id, name },
    });
    generalExpenseHeads[name] = head.id;
  }

  const generalExpenseDefs = [
    ["seed-general-expense-01", "2026-08-15", "Office Supplies", 5_500, "seed-user-shajib", "seed-bank-islami-01", "Stationery and office supplies"],
    ["seed-general-expense-02", "2026-08-14", "Internet & Telephone", 2_000, "seed-user-galib", "seed-bank-islami-01", "Internet bill for office"],
    ["seed-general-expense-03", "2026-08-13", "Transport", 1_500, "seed-user-rokon", "seed-bank-islami-01", "Office meeting transport"],
    ["seed-general-expense-04", "2026-08-12", "Refreshment", 850, "seed-user-shajib", "seed-bank-islami-01", "Meeting refreshment"],
    ["seed-general-expense-05", "2026-08-11", "Printing & Photocopy", 650, "seed-user-galib", "seed-bank-islami-01", "Photocopy and printing"],
  ] as const;
  for (const [id, expenseDate, headName, amount, expenseById, paidFromAccountId, description] of generalExpenseDefs) {
    await prisma.expense.upsert({
      where: { id },
      update: {},
      create: {
        id,
        organizationId: organization.id,
        expenseHeadId: generalExpenseHeads[headName],
        expenseById,
        paidFromAccountId,
        category: headName,
        description,
        amount,
        expenseDate: new Date(`${expenseDate}T00:00:00.000Z`),
        status: ExpenseStatus.APPROVED,
        createdById: adminUser.id,
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

  const receiptReferenceDefs = [
    ["seed-receipt-ref-24", "RC-2026-00024", "2026-08-15", "PROJECT", "PROGRESS_PAYMENT", "seed-cms-work-01", "DPHE", 500_000, "seed-bank-islami-01", "BANK_TRANSFER"],
    ["seed-receipt-ref-23", "RC-2026-00023", "2026-08-14", "PROJECT", "RUNNING_BILL_PAYMENT", "seed-cms-work-02", "LGED", 375_000, primeBank.id, "CHEQUE"],
    ["seed-receipt-ref-22", "RC-2026-00022", "2026-08-13", "PROJECT", "ADVANCE_PAYMENT", "seed-cms-work-03", "BTV", 200_000, cash.id, "CASH"],
    ["seed-receipt-ref-21", "RC-2026-00021", "2026-08-12", "GENERAL", "GENERAL_RECEIPT", null, "ABC Traders Ltd.", 50_000, "seed-bank-islami-01", "BANK_TRANSFER"],
    ["seed-receipt-ref-20", "RC-2026-00020", "2026-08-11", "PROJECT", "RETENTION_RECEIVED", "seed-cms-work-04", "PWD", 125_000, primeBank.id, "CHEQUE"],
  ] as const;
  for (const [id, receiptNo, receiptDate, receiptCategory, receiptType, workId, receivedFrom, amount, receivedInAccountId, paymentMethod] of receiptReferenceDefs) {
    await prisma.receipt.upsert({ where: { id }, update: {}, create: { id, organizationId: organization.id, receiptNo, receiptDate: new Date(`${receiptDate}T00:00:00.000Z`), receiptCategory, receiptType, workId, receivedFrom, amount, receivedInAccountId, paymentMethod, status: ReceiptStatus.RECEIVED, createdById: adminUser.id } });
  }
  await prisma.receiptSequence.upsert({ where: { organizationId_year: { organizationId: organization.id, year: 2026 } }, update: { value: { set: 24 } }, create: { organizationId: organization.id, year: 2026, value: 24 } });

  // --- Documents ----------------------------------------------------------
  // Real seeded rows (no physical file attached — metadata only, same as a document
  // logged before its file is uploaded). Linked via real FKs where the original demo
  // data implied a relationship, instead of a free-text "tenderId" string.
  const documentDefs = [
    {
      name: "Trade License 2026",
      category: "Company",
      documentType: "Trade License",
      relatedModule: "Company",
      referenceNumber: "TL/DNCC/2026/1842",
      certificateNumber: "TRAD/DNCC/1842",
      issuingAuthority: "Dhaka North City Corporation",
      issueDate: daysAgo(330),
      expires: 31,
      reminderDays: 30,
      responsiblePerson: "Saiful Islam",
      description: "Current company trade license.",
      tags: ["license", "compliance"],
    },
    {
      name: "TIN Certificate",
      category: "Tax & VAT",
      documentType: "TIN Certificate",
      relatedModule: "Company",
      referenceNumber: "TIN-745921638",
      certificateNumber: "745921638",
      issuingAuthority: "National Board of Revenue",
      issueDate: daysAgo(900),
      expires: null,
      responsiblePerson: "Accounts Manager",
      tags: ["tax", "company"],
    },
    {
      name: "BIN Certificate",
      category: "Tax & VAT",
      documentType: "BIN / VAT Certificate",
      relatedModule: "Company",
      certificateNumber: "BIN-001482795",
      issuingAuthority: "National Board of Revenue",
      issueDate: daysAgo(700),
      expires: -5,
      reminderDays: 30,
      responsiblePerson: "Accounts Manager",
      tags: ["vat", "compliance"],
    },
    {
      name: "Bank Solvency Certificate",
      category: "Financial",
      documentType: "Bank Solvency",
      relatedModule: "Bank Instrument",
      organizationMasterId: masters["DPHE"]!.id,
      tenderId: flagshipTender.id,
      referenceNumber: "IBBL/SLV/2026/882",
      issueDate: daysAgo(12),
      expires: 20,
      reminderDays: 15,
      responsiblePerson: "Saiful Islam",
      tags: ["bank", "tender"],
    },
    {
      name: "Tender Schedule - 1024587",
      category: "Tender",
      documentType: "Tender Schedule",
      relatedModule: "Tender",
      tenderId: flagshipTender.id,
      relatedEntityName: flagshipTender.workName,
      organizationMasterId: masters["DPHE"]!.id,
      referenceNumber: "e-GP/1024587",
      issueDate: daysAgo(40),
      expires: 42,
      reminderDays: 15,
      responsiblePerson: "Mahbubur Rahman",
      tags: ["egp", "schedule"],
    },
    {
      name: "NOA - Supply of LED Display at Patuakhali",
      category: "Project",
      documentType: "NOA",
      relatedModule: "Project / CMS",
      tenderId: flagshipTender.id,
      workId: "seed-cms-work-01",
      relatedEntityName: flagshipTender.workName,
      organizationMasterId: masters["DPHE"]!.id,
      referenceNumber: "DPHE/NOA/2026/44",
      issueDate: daysAgo(60),
      expires: null,
      tags: ["noa", "project"],
    },
    {
      name: "Contract Agreement - LED Display",
      category: "Project",
      documentType: "Contract Agreement",
      relatedModule: "Project / CMS",
      workId: "seed-cms-work-01",
      relatedEntityName: flagshipTender.workName,
      organizationMasterId: masters["DPHE"]!.id,
      referenceNumber: "DPHE/CON/2026/19",
      issueDate: daysAgo(48),
      expires: 280,
      reminderDays: 30,
      responsiblePerson: "Project Manager",
      tags: ["contract"],
    },
    {
      name: "Power of Attorney",
      category: "Legal",
      documentType: "Power of Attorney",
      relatedModule: "Company",
      referenceNumber: "POA-2024-09",
      issueDate: daysAgo(600),
      expires: null,
      tags: ["legal"],
      archived: true,
      archiveReason: "Superseded by renewed authorization",
    },
  ] as const;
  for (const doc of documentDefs) {
    await prisma.document.create({
      data: {
        organizationId: organization.id,
        name: doc.name,
        category: doc.category,
        documentType: "documentType" in doc ? doc.documentType : undefined,
        relatedModule: "relatedModule" in doc ? doc.relatedModule : undefined,
        relatedEntityName: "relatedEntityName" in doc ? doc.relatedEntityName : undefined,
        tenderId: "tenderId" in doc ? doc.tenderId : undefined,
        workId: "workId" in doc ? doc.workId : undefined,
        organizationMasterId: "organizationMasterId" in doc ? doc.organizationMasterId : undefined,
        referenceNumber: "referenceNumber" in doc ? doc.referenceNumber : undefined,
        certificateNumber: "certificateNumber" in doc ? doc.certificateNumber : undefined,
        issuingAuthority: "issuingAuthority" in doc ? doc.issuingAuthority : undefined,
        issueDate: "issueDate" in doc ? doc.issueDate : undefined,
        expiryDate: doc.expires === null ? null : daysFromNow(doc.expires),
        reminderDays: "reminderDays" in doc ? doc.reminderDays : undefined,
        responsiblePerson: "responsiblePerson" in doc ? doc.responsiblePerson : undefined,
        description: "description" in doc ? doc.description : undefined,
        tags: [...doc.tags],
        status: "archived" in doc && doc.archived ? "ARCHIVED" : "ACTIVE",
        archivedAt: "archived" in doc && doc.archived ? daysAgo(20) : undefined,
        archivedByName: "archived" in doc && doc.archived ? "Admin User" : undefined,
        archiveReason: "archiveReason" in doc ? doc.archiveReason : undefined,
        uploadedByName: "Saiful Islam",
        createdById: adminUser.id,
      },
    });
  }

  // --- Reminders ---------------------------------------------------------------
  // Only genuinely "manual" reminder concepts are seeded here (no dedicated auto-sync
  // source exists for these). Tender Security/PG-BG/Credit Commitment/Document/Tender
  // Submission & Opening reminders are now generated for real by syncSources() from the
  // actual seeded instruments/documents/tenders above — seeding duplicate manual summary
  // rows for those would just be stale fake data sitting next to the real thing.
  const reminderDefs = [
    { type: "License Renewal", title: "License Renewal", subtitle: "Trade License renewal due soon", due: 31 },
    { type: "Trial Ending Soon", title: "Trial Ending Soon", subtitle: "Upgrade to Premium before trial ends", due: 30 },
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

  // --- Contract / Work Order + Project Budget + BOQ (flagship project) -------------------
  const budgetCategoryNames = [
    "Material",
    "Labour",
    "Transport",
    "Subcontract",
    "Equipment",
    "Accommodation",
    "Site Expense",
    "Bank / Financial Charges",
    "Overhead",
    "Contingency",
    "Other",
  ] as const;
  const budgetCategoryHeads: Record<string, string> = {};
  for (const name of budgetCategoryNames) {
    const head = await prisma.expenseHead.upsert({
      where: { organizationId_name: { organizationId: organization.id, name } },
      update: { isActive: true },
      create: { organizationId: organization.id, name },
    });
    budgetCategoryHeads[name] = head.id;
  }

  const flagshipContract = await prisma.projectContract.upsert({
    where: { organizationId_contractNo: { organizationId: organization.id, contractNo: "WO-2026-0012" } },
    update: {},
    create: {
      organizationId: organization.id,
      tenderId: flagshipTender.id,
      cmsWorkId: "seed-cms-work-01",
      pgBgWorkflowId: flagshipPgBgWorkflow.id,
      organizationMasterId: masters["DPHE"]!.id,
      contractNo: "WO-2026-0012",
      contractType: ContractType.WORK_ORDER,
      issueDate: new Date("2024-05-18T00:00:00.000Z"),
      contractDate: new Date("2024-05-18T00:00:00.000Z"),
      originalContractValue: 12_500_000,
      currentContractValue: 12_500_000,
      currency: "BDT",
      commencementDate: new Date("2024-05-16T00:00:00.000Z"),
      originalCompletionDate: new Date("2025-05-15T00:00:00.000Z"),
      currentCompletionDate: new Date("2025-05-15T00:00:00.000Z"),
      durationDays: 364,
      dlpDays: 365,
      retentionPct: 5,
      securityDepositPct: 10,
      clientContactName: "Md. Mahbubur Rahman",
      responsiblePerson: "Saiful Islam",
      scopeOfWork:
        "Supply, installation, testing and commissioning of the LED display system at Patuakhali as per approved specifications and NOA terms.",
      status: ContractStatus.ACTIVE,
      createdById: adminUser.id,
    },
  });

  const flagshipBudget = await prisma.projectBudget.upsert({
    where: { organizationId_cmsWorkId_version: { organizationId: organization.id, cmsWorkId: "seed-cms-work-01", version: 1 } },
    update: {},
    create: {
      organizationId: organization.id,
      cmsWorkId: "seed-cms-work-01",
      version: 1,
      status: ProjectBudgetStatus.APPROVED,
      totalBudget: 6_950_000,
      revisionNote: "Initial approved budget at contract commencement.",
      createdById: adminUser.id,
      approvedById: adminUser.id,
      approvedAt: new Date("2024-05-20T00:00:00.000Z"),
    },
  });
  const budgetLineDefs = [
    { category: "Material", amount: 4_200_000, description: "LED panels, controllers, power supplies and structure" },
    { category: "Labour", amount: 1_800_000, description: "Installation and site labour" },
    { category: "Transport", amount: 350_000, description: "Equipment and material transport" },
    { category: "Accommodation", amount: 250_000, description: "Site team accommodation" },
    { category: "Bank / Financial Charges", amount: 180_000, description: "PG/BG and tender security charges" },
    { category: "Other", amount: 170_000, description: "Miscellaneous site expenses" },
  ] as const;
  await prisma.projectBudgetLine.deleteMany({ where: { budgetId: flagshipBudget.id } });
  await prisma.projectBudgetLine.createMany({
    data: budgetLineDefs.map((line) => ({
      budgetId: flagshipBudget.id,
      expenseHeadId: budgetCategoryHeads[line.category]!,
      category: line.category,
      description: line.description,
      amount: line.amount,
    })),
  });

  const boqSectionDefs = ["Supply Items", "Civil Works", "Installation", "Testing & Commissioning"] as const;
  const boqSections: Record<string, string> = {};
  for (const name of boqSectionDefs) {
    const section = await prisma.boqSection.upsert({
      where: { cmsWorkId_name: { cmsWorkId: "seed-cms-work-01", name } },
      update: {},
      create: { organizationId: organization.id, cmsWorkId: "seed-cms-work-01", name },
    });
    boqSections[name] = section.id;
  }
  const boqItemDefs = [
    { code: "LED-01", section: "Supply Items", description: "LED Display Panel", unit: "Nos", qty: 50, rate: 200_000 },
    { code: "LED-02", section: "Supply Items", description: "Controller", unit: "Nos", qty: 5, rate: 150_000 },
    { code: "LED-03", section: "Supply Items", description: "Power Supply", unit: "Nos", qty: 10, rate: 45_000 },
    { code: "LED-04", section: "Civil Works", description: "Structure", unit: "Lot", qty: 1, rate: 800_000 },
    { code: "LED-05", section: "Installation", description: "Installation", unit: "Lot", qty: 1, rate: 350_000 },
    { code: "LED-06", section: "Testing & Commissioning", description: "Testing & Commissioning", unit: "Lot", qty: 1, rate: 150_000 },
  ] as const;
  for (const item of boqItemDefs) {
    await prisma.boqItem.upsert({
      where: { cmsWorkId_itemCode: { cmsWorkId: "seed-cms-work-01", itemCode: item.code } },
      update: {},
      create: {
        organizationId: organization.id,
        cmsWorkId: "seed-cms-work-01",
        sectionId: boqSections[item.section]!,
        itemCode: item.code,
        description: item.description,
        unit: item.unit,
        contractQty: item.qty,
        unitRate: item.rate,
        contractAmount: item.qty * item.rate,
        originalQty: item.qty,
        originalRate: item.rate,
        originalAmount: item.qty * item.rate,
        createdById: adminUser.id,
      },
    });
  }

  // Real Project Expenses against the same budget categories, so Budget vs Actual has
  // genuine variance to show (Material/Accommodation under, Labour/Bank Charges over).
  const flagshipExpenseDefs = [
    { id: "seed-project-expense-flagship-01", category: "Material", amount: 3_000_000, days: 60, ref: "PE-2024-1001" },
    { id: "seed-project-expense-flagship-02", category: "Labour", amount: 1_850_000, days: 45, ref: "PE-2024-1002" },
    { id: "seed-project-expense-flagship-03", category: "Transport", amount: 300_000, days: 40, ref: "PE-2024-1003" },
    { id: "seed-project-expense-flagship-04", category: "Bank / Financial Charges", amount: 190_000, days: 30, ref: "PE-2024-1004" },
  ] as const;
  for (const e of flagshipExpenseDefs) {
    await prisma.expense.upsert({
      where: { id: e.id },
      update: {},
      create: {
        id: e.id,
        organizationId: organization.id,
        workId: "seed-cms-work-01",
        expenseHeadId: budgetCategoryHeads[e.category]!,
        expenseById: "seed-user-shajib",
        paidFromAccountId: primeBank.id,
        category: e.category,
        description: `${e.category} expense for Supply of LED Display at Patuakhali`,
        amount: e.amount,
        expenseDate: daysAgo(e.days),
        status: ExpenseStatus.APPROVED,
        referenceNo: e.ref,
        createdById: adminUser.id,
      },
    });
  }

  // --- Running Bill / IPC + Retention + VAT/AIT + Variation Order + Time Extension (flagship) ---
  await prisma.deductionConfig.upsert({
    where: { id: "seed-deduction-vat-01" },
    update: {},
    create: {
      id: "seed-deduction-vat-01",
      organizationId: organization.id,
      type: "VAT",
      name: "Standard VAT (VDS)",
      code: "VAT-STD",
      rate: 7.5,
      effectiveFrom: new Date("2024-01-01T00:00:00.000Z"),
      createdById: adminUser.id,
    },
  });
  await prisma.deductionConfig.upsert({
    where: { id: "seed-deduction-ait-01" },
    update: {},
    create: {
      id: "seed-deduction-ait-01",
      organizationId: organization.id,
      type: "AIT",
      name: "Standard AIT",
      code: "AIT-STD",
      rate: 6,
      effectiveFrom: new Date("2024-01-01T00:00:00.000Z"),
      createdById: adminUser.id,
    },
  });

  const flagshipBoqItems = await prisma.boqItem.findMany({ where: { cmsWorkId: "seed-cms-work-01" } });
  const boqByCode = Object.fromEntries(flagshipBoqItems.map((b) => [b.itemCode, b]));

  const flagshipBill = await prisma.projectBill.upsert({
    where: { id: "seed-project-bill-01" },
    update: {},
    create: {
      id: "seed-project-bill-01",
      organizationId: organization.id,
      cmsWorkId: "seed-cms-work-01",
      contractId: flagshipContract.id,
      billNo: "RB-2026-0001",
      billType: BillType.RUNNING,
      billDate: new Date("2024-08-20T00:00:00.000Z"),
      periodFrom: new Date("2024-07-01T00:00:00.000Z"),
      periodTo: new Date("2024-08-20T00:00:00.000Z"),
      submissionDate: new Date("2024-08-22T00:00:00.000Z"),
      certificationDate: new Date("2024-08-25T00:00:00.000Z"),
      clientCertificateRef: "DPHE/IPC/2024/01",
      measurementBookRef: "MB-2024-014",
      grossWorkValue: 7_250_000,
      approvedAdditions: 500_000,
      grossBillAmount: 7_750_000,
      retentionPct: 5,
      retentionAmount: 362_500,
      retentionReleaseDueDate: new Date("2026-05-15T00:00:00.000Z"),
      vatRate: 7.5,
      vatAmount: 581_250,
      aitRate: 6,
      aitAmount: 465_000,
      otherDeductionAmount: 100_000,
      netCertifiedAmount: 6_241_250,
      receivedAmount: 4_000_000,
      status: BillStatus.PARTIALLY_RECEIVED,
      createdById: adminUser.id,
      certifiedById: adminUser.id,
    },
  });

  const billItemDefs = [
    { code: "LED-01", currentQty: 30 },
    { code: "LED-02", currentQty: 3 },
    { code: "LED-04", currentQty: 1 },
  ] as const;
  for (const def of billItemDefs) {
    const boqItem = boqByCode[def.code]!;
    const currentValue = def.currentQty * Number(boqItem.unitRate);
    await prisma.projectBillItem.upsert({
      where: { billId_boqItemId: { billId: flagshipBill.id, boqItemId: boqItem.id } },
      update: {},
      create: {
        billId: flagshipBill.id,
        boqItemId: boqItem.id,
        description: boqItem.description,
        unit: boqItem.unit,
        approvedRate: boqItem.unitRate,
        contractQty: boqItem.contractQty,
        previousQty: 0,
        currentQty: def.currentQty,
        cumulativeQty: def.currentQty,
        previousValue: 0,
        currentValue,
        cumulativeValue: currentValue,
      },
    });
    // Certification-time effect: BOQ execution cache reflects the certified cumulative qty.
    await prisma.boqItem.update({
      where: { id: boqItem.id },
      data: { executedQty: def.currentQty, executedValue: currentValue },
    });
  }

  const billAdjustmentDefs = [
    { id: "seed-bill-adjustment-01", type: "Mobilization Advance", direction: AdjustmentDirection.ADDITION, amount: 500_000 },
    { id: "seed-bill-adjustment-02", type: "Advance Recovery", direction: AdjustmentDirection.DEDUCTION, amount: 100_000 },
  ] as const;
  for (const [index, def] of billAdjustmentDefs.entries()) {
    await prisma.billAdjustment.upsert({
      where: { id: def.id },
      update: {},
      create: {
        id: def.id,
        billId: flagshipBill.id,
        type: def.type,
        direction: def.direction,
        calculationType: DeductionCalcType.FIXED_AMOUNT,
        amount: def.amount,
        sortOrder: index,
      },
    });
  }

  const flagshipReceivable = await prisma.receivable.upsert({
    where: { projectBillId: flagshipBill.id },
    update: {},
    create: {
      organizationId: organization.id,
      projectId: "seed-cms-work-01",
      contractId: flagshipContract.id,
      projectBillId: flagshipBill.id,
      partyName: "DPHE",
      billNo: flagshipBill.billNo,
      billDate: flagshipBill.billDate,
      amount: 6_241_250,
      receivedAmount: 4_000_000,
      status: "PARTIALLY_RECEIVED",
      createdById: adminUser.id,
    },
  });

  await prisma.receipt.upsert({
    where: { id: "seed-receipt-flagship-bill-01" },
    update: {},
    create: {
      id: "seed-receipt-flagship-bill-01",
      organizationId: organization.id,
      workId: "seed-cms-work-01",
      receivableId: flagshipReceivable.id,
      receiptNo: "RC-2026-00099",
      receiptCategory: "PROJECT",
      receiptType: "PROGRESS_PAYMENT",
      receivedFrom: "DPHE",
      receivedInAccountId: primeBank.id,
      amount: 4_000_000,
      receiptDate: new Date("2024-09-05T00:00:00.000Z"),
      status: ReceiptStatus.RECEIVED,
      description: "Partial payment against RB-2026-0001",
      createdById: adminUser.id,
    },
  });

  // Approved Variation Order — authorized quantity increase on LED-03 (Power Supply).
  const led03 = boqByCode["LED-03"]!;
  const variationOrder = await prisma.variationOrder.upsert({
    where: { id: "seed-variation-order-01" },
    update: {},
    create: {
      id: "seed-variation-order-01",
      organizationId: organization.id,
      cmsWorkId: "seed-cms-work-01",
      contractId: flagshipContract.id,
      variationNo: "VO-2026-0001",
      variationType: VariationType.QUANTITY_CHANGE,
      title: "Additional Power Supply Units",
      reason: "Client requested 5 additional power supply units for redundancy.",
      requestDate: new Date("2024-09-10T00:00:00.000Z"),
      approvalDate: new Date("2024-09-18T00:00:00.000Z"),
      requestedAmount: 225_000,
      approvedAmount: 225_000,
      status: VariationStatus.APPROVED,
      createdById: adminUser.id,
      approvedById: adminUser.id,
    },
  });
  await prisma.variationItem.upsert({
    where: { id: "seed-variation-item-01" },
    update: {},
    create: {
      id: "seed-variation-item-01",
      variationOrderId: variationOrder.id,
      boqItemId: led03.id,
      itemCode: led03.itemCode,
      description: led03.description,
      unit: led03.unit,
      originalQty: 10,
      originalRate: 45_000,
      revisedQty: 15,
      revisedRate: 45_000,
      amount: 225_000,
    },
  });
  // Approved-variation effect: BOQ ceiling and current contract value both move, while
  // BoqItem.originalQty/originalRate/originalAmount (set at BOQ creation) stay untouched.
  await prisma.boqItem.update({
    where: { id: led03.id },
    data: { contractQty: 15, contractAmount: 675_000 },
  });
  await prisma.projectContract.update({
    where: { id: flagshipContract.id },
    data: { currentContractValue: 12_725_000 },
  });

  // Approved Time Extension — 45 days.
  await prisma.timeExtension.upsert({
    where: { id: "seed-time-extension-01" },
    update: {},
    create: {
      id: "seed-time-extension-01",
      organizationId: organization.id,
      cmsWorkId: "seed-cms-work-01",
      contractId: flagshipContract.id,
      eotNo: "EOT-2026-0001",
      requestDate: new Date("2025-03-01T00:00:00.000Z"),
      requestedDays: 45,
      reason: "Monsoon-related site access delays.",
      approvalDate: new Date("2025-03-10T00:00:00.000Z"),
      approvedDays: 45,
      originalCompletionDate: new Date("2025-05-15T00:00:00.000Z"),
      previousCompletionDate: new Date("2025-05-15T00:00:00.000Z"),
      revisedCompletionDate: new Date("2025-06-29T00:00:00.000Z"),
      status: TimeExtensionStatus.APPROVED,
      createdById: adminUser.id,
      approvedById: adminUser.id,
    },
  });
  await prisma.projectContract.update({
    where: { id: flagshipContract.id },
    data: { currentCompletionDate: new Date("2025-06-29T00:00:00.000Z") },
  });

  // ---------------------------------------------------------------------------
  // Masters — Vendor / Supplier / Subcontractor / Item Foundation
  // ---------------------------------------------------------------------------

  const uomDefs: Array<{ id: string; code: string; name: string; symbol: string }> = [
    { id: "seed-uom-pcs", code: "PCS", name: "Pieces", symbol: "pcs" },
    { id: "seed-uom-kg", code: "KG", name: "Kilogram", symbol: "kg" },
    { id: "seed-uom-ton", code: "TON", name: "Ton", symbol: "t" },
    { id: "seed-uom-m", code: "M", name: "Meter", symbol: "m" },
    { id: "seed-uom-sqm", code: "SQM", name: "Square Meter", symbol: "m²" },
    { id: "seed-uom-cft", code: "CFT", name: "Cubic Feet", symbol: "cft" },
    { id: "seed-uom-liter", code: "LITER", name: "Liter", symbol: "L" },
    { id: "seed-uom-lot", code: "LOT", name: "Lot", symbol: "lot" },
    { id: "seed-uom-day", code: "DAY", name: "Day", symbol: "day" },
    { id: "seed-uom-month", code: "MONTH", name: "Month", symbol: "mo" },
    { id: "seed-uom-job", code: "JOB", name: "Job", symbol: "job" },
  ];
  const uoms: Record<string, { id: string }> = {};
  for (const def of uomDefs) {
    uoms[def.code] = await prisma.unitOfMeasurement.upsert({
      where: { id: def.id },
      update: {},
      create: { id: def.id, organizationId: organization.id, code: def.code, name: def.name, symbol: def.symbol },
    });
  }

  const paymentTermDefs: Array<{ id: string; name: string; days: number }> = [
    { id: "seed-pt-immediate", name: "Immediate", days: 0 },
    { id: "seed-pt-7", name: "7 Days", days: 7 },
    { id: "seed-pt-15", name: "15 Days", days: 15 },
    { id: "seed-pt-30", name: "30 Days", days: 30 },
    { id: "seed-pt-45", name: "45 Days", days: 45 },
    { id: "seed-pt-60", name: "60 Days", days: 60 },
  ];
  const paymentTerms: Record<string, { id: string }> = {};
  for (const def of paymentTermDefs) {
    paymentTerms[def.name] = await prisma.paymentTerm.upsert({
      where: { id: def.id },
      update: {},
      create: { id: def.id, organizationId: organization.id, name: def.name, days: def.days },
    });
  }

  const vendorCategoryDefs: Array<{ id: string; name: string }> = [
    { id: "seed-cat-vendor-electrical", name: "Electrical Equipment Supplier" },
    { id: "seed-cat-vendor-led", name: "LED Display Supplier" },
    { id: "seed-cat-vendor-it", name: "IT Equipment Supplier" },
    { id: "seed-cat-vendor-general", name: "General Contractor Supplier" },
  ];
  const vendorCategories: Record<string, { id: string }> = {};
  for (const def of vendorCategoryDefs) {
    vendorCategories[def.name] = await prisma.masterCategory.upsert({
      where: { id: def.id },
      update: {},
      create: { id: def.id, organizationId: organization.id, type: MasterCategoryType.VENDOR, name: def.name },
    });
  }

  const materialCategoryDefs: Array<{ id: string; name: string }> = [
    { id: "seed-cat-material-electrical", name: "Electrical Materials" },
    { id: "seed-cat-material-led", name: "LED & Display Components" },
    { id: "seed-cat-material-it", name: "IT & Networking Equipment" },
    { id: "seed-cat-material-civil", name: "Civil Construction Materials" },
  ];
  const materialCategories: Record<string, { id: string }> = {};
  for (const def of materialCategoryDefs) {
    materialCategories[def.name] = await prisma.masterCategory.upsert({
      where: { id: def.id },
      update: {},
      create: { id: def.id, organizationId: organization.id, type: MasterCategoryType.MATERIAL, name: def.name },
    });
  }

  const tradeCategoryDefs: Array<{ id: string; name: string }> = [
    { id: "seed-cat-trade-electrical", name: "Electrical Works" },
    { id: "seed-cat-trade-civil", name: "Civil Works" },
    { id: "seed-cat-trade-led", name: "LED Installation" },
  ];
  const tradeCategories: Record<string, { id: string }> = {};
  for (const def of tradeCategoryDefs) {
    tradeCategories[def.name] = await prisma.masterCategory.upsert({
      where: { id: def.id },
      update: {},
      create: { id: def.id, organizationId: organization.id, type: MasterCategoryType.SUBCONTRACTOR_TRADE, name: def.name },
    });
  }

  // ABC Engineering — the master task's own worked example of a multi-role party
  // (Supplier + Subcontractor on the same record, not a duplicated pair of rows).
  const abcEngineering = await prisma.party.upsert({
    where: { id: "seed-party-abc-engineering" },
    update: {},
    create: {
      id: "seed-party-abc-engineering",
      organizationId: organization.id,
      code: "VEN-0001",
      name: "ABC Engineering Ltd",
      roles: [PartyRole.SUPPLIER, PartyRole.SUBCONTRACTOR],
      status: PartyStatus.ACTIVE,
      contactPerson: "Md. Aminul Islam",
      phone: "+880-1711-000001",
      email: "info@abcengineering.example",
      address: "House 12, Road 5, Banani",
      district: "Dhaka",
      country: "Bangladesh",
      binVat: "000123456-0101",
      tinNo: "123456789012",
      tradeLicenseNo: "TRAD/DNCC/000111/2020",
      bankName: "Dutch Bangla Bank",
      bankAccountName: "ABC Engineering Ltd",
      bankAccountNo: "1011000000123",
      bankBranch: "Banani Branch",
      paymentTermId: paymentTerms["30 Days"]!.id,
      categoryId: vendorCategories["Electrical Equipment Supplier"]!.id,
      createdById: adminUser.id,
    },
  });
  await prisma.subcontractorProfile.upsert({
    where: { id: "seed-subprofile-abc" },
    update: {},
    create: {
      id: "seed-subprofile-abc",
      organizationId: organization.id,
      partyId: abcEngineering.id,
      tradeCategoryId: tradeCategories["Electrical Works"]!.id,
      specialization: "Electrical supply and installation for commercial projects",
      defaultRetentionPct: 5,
      performanceRating: 4.5,
    },
  });

  const primeElectronics = await prisma.party.upsert({
    where: { id: "seed-party-prime-electronics" },
    update: {},
    create: {
      id: "seed-party-prime-electronics",
      organizationId: organization.id,
      code: "VEN-0002",
      name: "Prime Electronics & Supplies",
      roles: [PartyRole.VENDOR, PartyRole.SUPPLIER],
      status: PartyStatus.ACTIVE,
      contactPerson: "Farhana Kabir",
      phone: "+880-1711-000002",
      email: "sales@primeelectronics.example",
      address: "Shop 45, Elephant Road",
      district: "Dhaka",
      country: "Bangladesh",
      binVat: "000234567-0101",
      tinNo: "234567890123",
      bankName: "Islami Bank Bangladesh",
      bankAccountName: "Prime Electronics & Supplies",
      bankAccountNo: "2022000000456",
      paymentTermId: paymentTerms["15 Days"]!.id,
      categoryId: vendorCategories["IT Equipment Supplier"]!.id,
      createdById: adminUser.id,
    },
  });

  const bengalLed = await prisma.party.upsert({
    where: { id: "seed-party-bengal-led" },
    update: {},
    create: {
      id: "seed-party-bengal-led",
      organizationId: organization.id,
      code: "VEN-0003",
      name: "Bengal LED Display Suppliers",
      roles: [PartyRole.SUPPLIER],
      status: PartyStatus.ACTIVE,
      contactPerson: "Shahriar Kabir",
      phone: "+880-1711-000003",
      email: "contact@bengalled.example",
      address: "Plot 8, Tejgaon Industrial Area",
      district: "Dhaka",
      country: "Bangladesh",
      binVat: "000345678-0101",
      tinNo: "345678901234",
      bankName: "Prime Bank",
      bankAccountName: "Bengal LED Display Suppliers",
      bankAccountNo: "3033000000789",
      paymentTermId: paymentTerms["30 Days"]!.id,
      categoryId: vendorCategories["LED Display Supplier"]!.id,
      createdById: adminUser.id,
    },
  });

  const souravTrading = await prisma.party.upsert({
    where: { id: "seed-party-sourav-trading" },
    update: {},
    create: {
      id: "seed-party-sourav-trading",
      organizationId: organization.id,
      code: "VEN-0004",
      name: "Sourav Trading",
      roles: [PartyRole.VENDOR],
      status: PartyStatus.ACTIVE,
      contactPerson: "Sourav Ahmed",
      phone: "+880-1711-000004",
      address: "Karwan Bazar",
      district: "Dhaka",
      country: "Bangladesh",
      paymentTermId: paymentTerms["Immediate"]!.id,
      categoryId: vendorCategories["General Contractor Supplier"]!.id,
      createdById: adminUser.id,
    },
  });

  const karimElectrical = await prisma.party.upsert({
    where: { id: "seed-party-karim-electrical" },
    update: {},
    create: {
      id: "seed-party-karim-electrical",
      organizationId: organization.id,
      code: "SUB-0001",
      name: "Karim Electrical Works",
      roles: [PartyRole.SUBCONTRACTOR],
      status: PartyStatus.ACTIVE,
      contactPerson: "Abdul Karim",
      phone: "+880-1711-000005",
      address: "Mirpur-1",
      district: "Dhaka",
      country: "Bangladesh",
      tinNo: "456789012345",
      bankName: "Sonali Bank",
      bankAccountName: "Abdul Karim",
      bankAccountNo: "4044000000012",
      paymentTermId: paymentTerms["7 Days"]!.id,
      createdById: adminUser.id,
    },
  });
  await prisma.subcontractorProfile.upsert({
    where: { id: "seed-subprofile-karim" },
    update: {},
    create: {
      id: "seed-subprofile-karim",
      organizationId: organization.id,
      partyId: karimElectrical.id,
      tradeCategoryId: tradeCategories["Electrical Works"]!.id,
      specialization: "Electrical wiring, panel installation and maintenance",
      defaultRetentionPct: 5,
      performanceRating: 4.2,
    },
  });

  await prisma.organizationContact.upsert({
    where: { id: "seed-party-contact-abc-accounts" },
    update: {},
    create: {
      id: "seed-party-contact-abc-accounts",
      organizationId: organization.id,
      partyId: abcEngineering.id,
      contactRole: "Accounts",
      name: "Nasrin Sultana",
      designation: "Accounts Manager",
      mobile: "+880-1711-000011",
      email: "accounts@abcengineering.example",
      address: "House 12, Road 5, Banani, Dhaka",
    },
  });

  const itemDefs: Array<{
    id: string;
    itemCode: string;
    itemName: string;
    itemType: ItemType;
    categoryId?: string;
    uomCode: string;
    defaultPurchaseRate?: number;
    preferredVendorId?: string;
    brandModel?: string;
  }> = [
    { id: "seed-item-01", itemCode: "ITM-0001", itemName: "LED Display Panel P3 Outdoor", itemType: ItemType.MATERIAL, categoryId: materialCategories["LED & Display Components"]!.id, uomCode: "PCS", defaultPurchaseRate: 12_000, preferredVendorId: bengalLed.id },
    { id: "seed-item-02", itemCode: "ITM-0002", itemName: "LED Controller Card", itemType: ItemType.MATERIAL, categoryId: materialCategories["LED & Display Components"]!.id, uomCode: "PCS", defaultPurchaseRate: 8_500, preferredVendorId: bengalLed.id },
    { id: "seed-item-03", itemCode: "ITM-0003", itemName: "Steel Structure Frame", itemType: ItemType.MATERIAL, categoryId: materialCategories["Civil Construction Materials"]!.id, uomCode: "LOT", defaultPurchaseRate: 400_000 },
    { id: "seed-item-04", itemCode: "ITM-0004", itemName: "Power Supply Unit 5V 40A", itemType: ItemType.MATERIAL, categoryId: materialCategories["Electrical Materials"]!.id, uomCode: "PCS", defaultPurchaseRate: 4_500, preferredVendorId: primeElectronics.id },
    { id: "seed-item-05", itemCode: "ITM-0005", itemName: "Copper Cable 2.5mm", itemType: ItemType.MATERIAL, categoryId: materialCategories["Electrical Materials"]!.id, uomCode: "M", defaultPurchaseRate: 45 },
    { id: "seed-item-06", itemCode: "ITM-0006", itemName: "MCB Distribution Box", itemType: ItemType.MATERIAL, categoryId: materialCategories["Electrical Materials"]!.id, uomCode: "PCS", defaultPurchaseRate: 2_200 },
    { id: "seed-item-07", itemCode: "ITM-0007", itemName: "Networking Switch 24-Port", itemType: ItemType.MATERIAL, categoryId: materialCategories["IT & Networking Equipment"]!.id, uomCode: "PCS", defaultPurchaseRate: 15_000, preferredVendorId: primeElectronics.id, brandModel: "TP-Link TL-SG1024" },
    { id: "seed-item-08", itemCode: "ITM-0008", itemName: "CAT6 Network Cable", itemType: ItemType.MATERIAL, categoryId: materialCategories["IT & Networking Equipment"]!.id, uomCode: "M", defaultPurchaseRate: 35 },
    { id: "seed-item-09", itemCode: "ITM-0009", itemName: "Cement (OPC, 50kg bag)", itemType: ItemType.MATERIAL, categoryId: materialCategories["Civil Construction Materials"]!.id, uomCode: "PCS", defaultPurchaseRate: 620 },
    { id: "seed-item-10", itemCode: "ITM-0010", itemName: "Sand (Local, Fine)", itemType: ItemType.MATERIAL, categoryId: materialCategories["Civil Construction Materials"]!.id, uomCode: "CFT", defaultPurchaseRate: 55 },
    { id: "seed-item-11", itemCode: "ITM-0011", itemName: "Site Supervision Service", itemType: ItemType.SERVICE, uomCode: "MONTH", defaultPurchaseRate: 50_000 },
    { id: "seed-item-12", itemCode: "ITM-0012", itemName: "Electrical Installation Service", itemType: ItemType.SERVICE, uomCode: "JOB", defaultPurchaseRate: 150_000, preferredVendorId: abcEngineering.id },
    { id: "seed-item-13", itemCode: "ITM-0013", itemName: "Diesel Generator 20kVA (Rental)", itemType: ItemType.EQUIPMENT, uomCode: "DAY", defaultPurchaseRate: 3_500 },
    { id: "seed-item-14", itemCode: "ITM-0014", itemName: "Scaffolding (Rental)", itemType: ItemType.EQUIPMENT, uomCode: "MONTH", defaultPurchaseRate: 25_000 },
    { id: "seed-item-15", itemCode: "ITM-0015", itemName: "Site Security Service", itemType: ItemType.SERVICE, uomCode: "MONTH", defaultPurchaseRate: 40_000 },
  ];
  for (const def of itemDefs) {
    await prisma.item.upsert({
      where: { id: def.id },
      update: {},
      create: {
        id: def.id,
        organizationId: organization.id,
        itemCode: def.itemCode,
        itemName: def.itemName,
        itemType: def.itemType,
        status: ItemStatus.ACTIVE,
        categoryId: def.categoryId,
        uomId: uoms[def.uomCode]!.id,
        defaultPurchaseRate: def.defaultPurchaseRate,
        preferredVendorId: def.preferredVendorId,
        brandModel: def.brandModel,
        createdById: adminUser.id,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Procurement Core — demo PR -> RFQ -> Quotations -> Comparative Statement ->
  // Purchase Order -> Goods Receipts chain
  // ---------------------------------------------------------------------------
  // Runs against the flagship ONGOING project (seed-cms-work-01) using the vendors/items
  // seeded above. Deliberately non-financial — no Payable/JournalEntry/Expense/InventoryStock
  // record is created anywhere in this block; Procurement Core stays a pre-financial workflow.

  const ledPanelItem = await prisma.item.findUniqueOrThrow({ where: { id: "seed-item-01" } });
  const ledControllerItem = await prisma.item.findUniqueOrThrow({ where: { id: "seed-item-02" } });

  const seedPr = await prisma.purchaseRequisition.upsert({
    where: { id: "seed-pr-01" },
    update: {},
    create: {
      id: "seed-pr-01",
      organizationId: organization.id,
      prNo: "PR-SEED-0001",
      requestDate: daysAgo(20),
      requiredByDate: daysFromNow(15),
      cmsWorkId: "seed-cms-work-01",
      department: "Site — Patuakhali",
      priority: PrPriority.HIGH,
      purpose: "LED display panel replenishment for the Patuakhali site",
      // Already carried through to RFQ in this seed, mirroring what PurchaseRequisitionsService's
      // markConverted() does at real RFQ-creation time.
      status: PrStatus.CONVERTED,
      submittedAt: daysAgo(19),
      approvedById: adminUser.id,
      approvedAt: daysAgo(18),
      createdById: adminUser.id,
    },
  });
  const seedPrItem1 = await prisma.purchaseRequisitionItem.upsert({
    where: { id: "seed-pr-item-01" },
    update: {},
    create: {
      id: "seed-pr-item-01",
      organizationId: organization.id,
      purchaseRequisitionId: seedPr.id,
      itemId: ledPanelItem.id,
      descriptionSnapshot: ledPanelItem.itemName,
      uomId: uoms["PCS"]!.id,
      requestedQty: 50,
      estimatedRate: 12_000,
      estimatedAmount: 600_000,
    },
  });
  const seedPrItem2 = await prisma.purchaseRequisitionItem.upsert({
    where: { id: "seed-pr-item-02" },
    update: {},
    create: {
      id: "seed-pr-item-02",
      organizationId: organization.id,
      purchaseRequisitionId: seedPr.id,
      itemId: ledControllerItem.id,
      descriptionSnapshot: ledControllerItem.itemName,
      uomId: uoms["PCS"]!.id,
      requestedQty: 10,
      estimatedRate: 8_500,
      estimatedAmount: 85_000,
    },
  });

  const seedRfq = await prisma.requestForQuotation.upsert({
    where: { id: "seed-rfq-01" },
    update: {},
    create: {
      id: "seed-rfq-01",
      organizationId: organization.id,
      rfqNo: "RFQ-SEED-0001",
      purchaseRequisitionId: seedPr.id,
      cmsWorkId: "seed-cms-work-01",
      issueDate: daysAgo(17),
      submissionDeadline: daysAgo(10),
      deliveryLocation: "Patuakhali Site Store",
      paymentTerms: "As quoted",
      status: RfqStatus.AWARDED,
      issuedById: adminUser.id,
      issuedAt: daysAgo(17),
      createdById: adminUser.id,
    },
  });
  for (const supplierId of [bengalLed.id, primeElectronics.id, abcEngineering.id]) {
    await prisma.rfqSupplier.upsert({
      where: { rfqId_supplierId: { rfqId: seedRfq.id, supplierId } },
      update: {},
      create: { organizationId: organization.id, rfqId: seedRfq.id, supplierId, invitedAt: daysAgo(17) },
    });
  }
  const seedRfqItem1 = await prisma.rfqItem.upsert({
    where: { id: "seed-rfq-item-01" },
    update: {},
    create: {
      id: "seed-rfq-item-01",
      organizationId: organization.id,
      rfqId: seedRfq.id,
      itemId: ledPanelItem.id,
      purchaseRequisitionItemId: seedPrItem1.id,
      itemCodeSnapshot: ledPanelItem.itemCode,
      itemNameSnapshot: ledPanelItem.itemName,
      unitSnapshot: "PCS",
      requestedQty: 50,
    },
  });
  const seedRfqItem2 = await prisma.rfqItem.upsert({
    where: { id: "seed-rfq-item-02" },
    update: {},
    create: {
      id: "seed-rfq-item-02",
      organizationId: organization.id,
      rfqId: seedRfq.id,
      itemId: ledControllerItem.id,
      purchaseRequisitionItemId: seedPrItem2.id,
      itemCodeSnapshot: ledControllerItem.itemCode,
      itemNameSnapshot: ledControllerItem.itemName,
      unitSnapshot: "PCS",
      requestedQty: 10,
    },
  });

  // Three invited suppliers, three RECEIVED quotations — Bengal LED comes out lowest evaluated
  // and is the one the Comparative Statement below explicitly selects.
  const seedQuoteBengal = await prisma.supplierQuotation.upsert({
    where: { id: "seed-quote-bengal" },
    update: {},
    create: {
      id: "seed-quote-bengal",
      organizationId: organization.id,
      rfqId: seedRfq.id,
      supplierId: bengalLed.id,
      quotationRef: "BLD-Q-2201",
      quotationDate: daysAgo(14),
      validityDate: daysFromNow(30),
      deliveryDays: 15,
      paymentTerms: "30 Days",
      warranty: "1 Year",
      status: QuotationStatus.RECEIVED,
      revisionNo: 1,
      totalAmount: 661_200,
      createdById: adminUser.id,
    },
  });
  await prisma.supplierQuotationItem.upsert({
    where: { id: "seed-quote-bengal-item-01" },
    update: {},
    create: {
      id: "seed-quote-bengal-item-01",
      organizationId: organization.id,
      quotationId: seedQuoteBengal.id,
      rfqItemId: seedRfqItem1.id,
      offeredQty: 50,
      unitRate: 11_800,
      discountPct: 2,
      lineAmount: 578_200,
      deliveryDays: 15,
    },
  });
  await prisma.supplierQuotationItem.upsert({
    where: { id: "seed-quote-bengal-item-02" },
    update: {},
    create: {
      id: "seed-quote-bengal-item-02",
      organizationId: organization.id,
      quotationId: seedQuoteBengal.id,
      rfqItemId: seedRfqItem2.id,
      offeredQty: 10,
      unitRate: 8_300,
      lineAmount: 83_000,
      deliveryDays: 15,
    },
  });

  const seedQuotePrime = await prisma.supplierQuotation.upsert({
    where: { id: "seed-quote-prime" },
    update: {},
    create: {
      id: "seed-quote-prime",
      organizationId: organization.id,
      rfqId: seedRfq.id,
      supplierId: primeElectronics.id,
      quotationRef: "PES-Q-3301",
      quotationDate: daysAgo(13),
      validityDate: daysFromNow(30),
      deliveryDays: 20,
      paymentTerms: "15 Days",
      warranty: "6 Months",
      status: QuotationStatus.RECEIVED,
      revisionNo: 1,
      totalAmount: 713_000,
      createdById: adminUser.id,
    },
  });
  await prisma.supplierQuotationItem.upsert({
    where: { id: "seed-quote-prime-item-01" },
    update: {},
    create: {
      id: "seed-quote-prime-item-01",
      organizationId: organization.id,
      quotationId: seedQuotePrime.id,
      rfqItemId: seedRfqItem1.id,
      offeredQty: 50,
      unitRate: 12_500,
      lineAmount: 625_000,
      deliveryDays: 20,
    },
  });
  await prisma.supplierQuotationItem.upsert({
    where: { id: "seed-quote-prime-item-02" },
    update: {},
    create: {
      id: "seed-quote-prime-item-02",
      organizationId: organization.id,
      quotationId: seedQuotePrime.id,
      rfqItemId: seedRfqItem2.id,
      offeredQty: 10,
      unitRate: 8_800,
      lineAmount: 88_000,
      deliveryDays: 20,
    },
  });

  const seedQuoteAbc = await prisma.supplierQuotation.upsert({
    where: { id: "seed-quote-abc" },
    update: {},
    create: {
      id: "seed-quote-abc",
      organizationId: organization.id,
      rfqId: seedRfq.id,
      supplierId: abcEngineering.id,
      quotationRef: "ABC-Q-4401",
      quotationDate: daysAgo(12),
      validityDate: daysFromNow(30),
      deliveryDays: 18,
      paymentTerms: "30 Days",
      warranty: "1 Year",
      status: QuotationStatus.RECEIVED,
      revisionNo: 1,
      totalAmount: 689_040,
      createdById: adminUser.id,
    },
  });
  await prisma.supplierQuotationItem.upsert({
    where: { id: "seed-quote-abc-item-01" },
    update: {},
    create: {
      id: "seed-quote-abc-item-01",
      organizationId: organization.id,
      quotationId: seedQuoteAbc.id,
      rfqItemId: seedRfqItem1.id,
      offeredQty: 50,
      unitRate: 12_200,
      discountPct: 1,
      lineAmount: 603_900,
      deliveryDays: 18,
    },
  });
  await prisma.supplierQuotationItem.upsert({
    where: { id: "seed-quote-abc-item-02" },
    update: {},
    create: {
      id: "seed-quote-abc-item-02",
      organizationId: organization.id,
      quotationId: seedQuoteAbc.id,
      rfqItemId: seedRfqItem2.id,
      offeredQty: 10,
      unitRate: 8_600,
      discountPct: 1,
      lineAmount: 85_140,
      deliveryDays: 18,
    },
  });

  // Comparative Statement — Bengal LED explicitly selected (it also happens to be lowest
  // evaluated, so no decision note is required) and approved, which awards the RFQ above.
  const seedCs = await prisma.comparativeStatement.upsert({
    where: { id: "seed-cs-01" },
    update: {},
    create: {
      id: "seed-cs-01",
      organizationId: organization.id,
      rfqId: seedRfq.id,
      cmsWorkId: "seed-cms-work-01",
      csNo: "CS-SEED-0001",
      status: ComparativeStatementStatus.APPROVED,
      preparedById: adminUser.id,
      approvedById: adminUser.id,
      approvedAt: daysAgo(8),
    },
  });
  const csSupplierDefs = [
    { id: "seed-cs-supplier-bengal", supplierId: bengalLed.id, quotationId: seedQuoteBengal.id, quotedTotal: 661_200, deliveryDays: 15, paymentTerms: "30 Days", rank: 1, isSelected: true, recommended: true },
    { id: "seed-cs-supplier-abc", supplierId: abcEngineering.id, quotationId: seedQuoteAbc.id, quotedTotal: 689_040, deliveryDays: 18, paymentTerms: "30 Days", rank: 2, isSelected: false, recommended: false },
    { id: "seed-cs-supplier-prime", supplierId: primeElectronics.id, quotationId: seedQuotePrime.id, quotedTotal: 713_000, deliveryDays: 20, paymentTerms: "15 Days", rank: 3, isSelected: false, recommended: false },
  ];
  for (const def of csSupplierDefs) {
    await prisma.comparativeStatementSupplier.upsert({
      where: { id: def.id },
      update: {},
      create: {
        id: def.id,
        organizationId: organization.id,
        comparativeStatementId: seedCs.id,
        supplierId: def.supplierId,
        quotationId: def.quotationId,
        quotedTotal: def.quotedTotal,
        evaluatedTotal: def.quotedTotal,
        deliveryDays: def.deliveryDays,
        paymentTerms: def.paymentTerms,
        technicalStatus: TechnicalComplianceStatus.COMPLIANT,
        recommended: def.recommended,
        rank: def.rank,
        isSelected: def.isSelected,
      },
    });
  }

  // Purchase Order raised from the approved CS, then fully received across two GRNs below —
  // ends this demo chain at RECEIVED/CLOSED-ready, matching real PO->GRN status derivation.
  const seedPo = await prisma.purchaseOrder.upsert({
    where: { id: "seed-po-01" },
    update: {},
    create: {
      id: "seed-po-01",
      organizationId: organization.id,
      poNo: "PO-SEED-0001",
      poDate: daysAgo(7),
      supplierId: bengalLed.id,
      cmsWorkId: "seed-cms-work-01",
      purchaseRequisitionId: seedPr.id,
      rfqId: seedRfq.id,
      comparativeStatementId: seedCs.id,
      deliveryAddress: "Patuakhali Site Store",
      paymentTerms: "30 Days",
      deliveryTerms: "Ex-Warehouse, Dhaka",
      currency: "BDT",
      subtotal: 673_000,
      discountAmount: 11_800,
      taxAmount: 0,
      otherCharges: 0,
      grandTotal: 661_200,
      status: PurchaseOrderStatus.RECEIVED,
      createdById: adminUser.id,
      approvedById: adminUser.id,
      approvedAt: daysAgo(6),
      issuedAt: daysAgo(5),
    },
  });
  const seedPoItem1 = await prisma.purchaseOrderItem.upsert({
    where: { id: "seed-po-item-01" },
    update: {},
    create: {
      id: "seed-po-item-01",
      organizationId: organization.id,
      purchaseOrderId: seedPo.id,
      itemId: ledPanelItem.id,
      itemCodeSnapshot: ledPanelItem.itemCode,
      itemNameSnapshot: ledPanelItem.itemName,
      unitSnapshot: "PCS",
      orderedQty: 50,
      unitRate: 11_800,
      discountAmount: 11_800,
      netRate: 11_564,
      lineAmount: 578_200,
      receivedQty: 50,
      cmsWorkId: "seed-cms-work-01",
      sourceQuotationItemId: "seed-quote-bengal-item-01",
    },
  });
  const seedPoItem2 = await prisma.purchaseOrderItem.upsert({
    where: { id: "seed-po-item-02" },
    update: {},
    create: {
      id: "seed-po-item-02",
      organizationId: organization.id,
      purchaseOrderId: seedPo.id,
      itemId: ledControllerItem.id,
      itemCodeSnapshot: ledControllerItem.itemCode,
      itemNameSnapshot: ledControllerItem.itemName,
      unitSnapshot: "PCS",
      orderedQty: 10,
      unitRate: 8_300,
      discountAmount: 0,
      netRate: 8_300,
      lineAmount: 83_000,
      receivedQty: 10,
      cmsWorkId: "seed-cms-work-01",
      sourceQuotationItemId: "seed-quote-bengal-item-02",
    },
  });

  // GRN 1 — partial receipt (30 of 50 panels, all 10 controllers)
  const seedGrn1 = await prisma.goodsReceiptNote.upsert({
    where: { id: "seed-grn-01" },
    update: {},
    create: {
      id: "seed-grn-01",
      organizationId: organization.id,
      grnNo: "GRN-SEED-0001",
      purchaseOrderId: seedPo.id,
      supplierId: bengalLed.id,
      cmsWorkId: "seed-cms-work-01",
      receiptDate: daysAgo(5),
      deliveryChallanNo: "DC-BLD-1001",
      deliveryChallanDate: daysAgo(5),
      receivedById: "Site Store Keeper",
      inspectionStatus: GrnInspectionStatus.ACCEPTED,
      warehouseLocation: "Patuakhali Site Store",
      remarks: "First partial delivery",
      createdById: adminUser.id,
    },
  });
  await prisma.grnItem.upsert({
    where: { id: "seed-grn1-item-01" },
    update: {},
    create: {
      id: "seed-grn1-item-01",
      organizationId: organization.id,
      grnId: seedGrn1.id,
      purchaseOrderItemId: seedPoItem1.id,
      descriptionSnapshot: ledPanelItem.itemName,
      unitSnapshot: "PCS",
      orderedQty: 50,
      previouslyReceivedQty: 0,
      currentReceivedQty: 30,
      cumulativeReceivedQty: 30,
      remainingQty: 20,
      acceptedQty: 30,
      rejectedQty: 0,
      damagedQty: 0,
    },
  });
  await prisma.grnItem.upsert({
    where: { id: "seed-grn1-item-02" },
    update: {},
    create: {
      id: "seed-grn1-item-02",
      organizationId: organization.id,
      grnId: seedGrn1.id,
      purchaseOrderItemId: seedPoItem2.id,
      descriptionSnapshot: ledControllerItem.itemName,
      unitSnapshot: "PCS",
      orderedQty: 10,
      previouslyReceivedQty: 0,
      currentReceivedQty: 10,
      cumulativeReceivedQty: 10,
      remainingQty: 0,
      acceptedQty: 10,
      rejectedQty: 0,
      damagedQty: 0,
    },
  });

  // GRN 2 — final receipt (remaining 20 of 50 panels), pushing the PO to fully RECEIVED
  const seedGrn2 = await prisma.goodsReceiptNote.upsert({
    where: { id: "seed-grn-02" },
    update: {},
    create: {
      id: "seed-grn-02",
      organizationId: organization.id,
      grnNo: "GRN-SEED-0002",
      purchaseOrderId: seedPo.id,
      supplierId: bengalLed.id,
      cmsWorkId: "seed-cms-work-01",
      receiptDate: daysAgo(2),
      deliveryChallanNo: "DC-BLD-1002",
      deliveryChallanDate: daysAgo(2),
      receivedById: "Site Store Keeper",
      inspectionStatus: GrnInspectionStatus.ACCEPTED,
      warehouseLocation: "Patuakhali Site Store",
      remarks: "Final delivery — balance quantity",
      createdById: adminUser.id,
    },
  });
  await prisma.grnItem.upsert({
    where: { id: "seed-grn2-item-01" },
    update: {},
    create: {
      id: "seed-grn2-item-01",
      organizationId: organization.id,
      grnId: seedGrn2.id,
      purchaseOrderItemId: seedPoItem1.id,
      descriptionSnapshot: ledPanelItem.itemName,
      unitSnapshot: "PCS",
      orderedQty: 50,
      previouslyReceivedQty: 30,
      currentReceivedQty: 20,
      cumulativeReceivedQty: 50,
      remainingQty: 0,
      acceptedQty: 20,
      rejectedQty: 0,
      damagedQty: 0,
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
