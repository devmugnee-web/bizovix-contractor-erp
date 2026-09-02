import { Injectable, OnModuleInit, Logger } from "@nestjs/common";
import { AccountLevel, AccountNature } from "../generated/prisma/index.js";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class CoaBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(CoaBootstrapService.name);

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    try {
      if (!this.prisma) {
        this.logger.warn("PrismaService not available yet");
        return;
      }

      const existing = await this.prisma.account.count();
      if (existing > 0) {
        this.logger.debug(`COA already exists (${existing} accounts)`);
        return;
      }

      this.logger.log("Initializing Chart of Accounts...");
      await this.seedCoa();
      const total = await this.prisma.account.count();
      this.logger.log(`✅ COA seeding complete: ${total} accounts created`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`COA bootstrap failed: ${msg}`);
      if (error instanceof Error) {
        this.logger.error(`Stack: ${error.stack}`);
      }
    }
  }

  private async seedCoa() {
    const tenants = await this.prisma.tenant.findMany({ take: 1 });
    if (!tenants.length) {
      this.logger.warn("No tenant found, skipping COA seed");
      return;
    }
    const tenantId = tenants[0].id;

    const companies = await this.prisma.company.findMany({
      where: { tenantId },
      take: 1,
    });
    if (!companies.length) {
      this.logger.warn("No company found, skipping COA seed");
      return;
    }
    const companyId = companies[0].id;

    // Helper to create account with parent lookup
    const createAccount = async (data: {
      code: string;
      name: string;
      accountType: "CATEGORY" | "SUBCATEGORY" | "LEDGER";
      nature: AccountNature;
      isSystem: boolean;
      parentCode?: string;
    }) => {
      let parentId: string | null = null;
      if (data.parentCode) {
        const parent = await this.prisma.account.findFirst({
          where: { code: data.parentCode, companyId },
        });
        parentId = parent?.id || null;
      }

      return this.prisma.account.create({
        data: {
          code: data.code,
          name: data.name,
          level: data.accountType === "LEDGER" ? AccountLevel.LEDGER : AccountLevel.CATEGORY,
          nature: data.nature,
          isSystem: data.isSystem,
          parentId,
          tenantId,
          companyId,
        },
      });
    };

    // ======== 1. ASSETS ========
    await createAccount({
      code: "1000",
      name: "Fixed Assets",
      accountType: "CATEGORY",
      nature: "ASSET",
      isSystem: true,
    });

    await createAccount({
      code: "1100",
      name: "Fixed Assets - Property & Equipment",
      accountType: "SUBCATEGORY",
      nature: "ASSET",
      isSystem: true,
      parentCode: "1000",
    });

    await createAccount({
      code: "1110",
      name: "Office Equipment",
      accountType: "LEDGER",
      nature: "ASSET",
      isSystem: false,
      parentCode: "1100",
    });

    await createAccount({
      code: "1120",
      name: "Vehicles",
      accountType: "LEDGER",
      nature: "ASSET",
      isSystem: false,
      parentCode: "1100",
    });

    await createAccount({
      code: "1130",
      name: "Building & Furniture",
      accountType: "LEDGER",
      nature: "ASSET",
      isSystem: false,
      parentCode: "1100",
    });

    await createAccount({
      code: "2000",
      name: "Current Assets",
      accountType: "CATEGORY",
      nature: "ASSET",
      isSystem: true,
    });

    await createAccount({
      code: "2100",
      name: "Closing Balance",
      accountType: "SUBCATEGORY",
      nature: "ASSET",
      isSystem: true,
      parentCode: "2000",
    });

    await createAccount({
      code: "2110",
      name: "Closing Balance",
      accountType: "LEDGER",
      nature: "ASSET",
      isSystem: false,
      parentCode: "2100",
    });

    await createAccount({
      code: "2200",
      name: "Cash & Cash Equivalents",
      accountType: "SUBCATEGORY",
      nature: "ASSET",
      isSystem: true,
      parentCode: "2000",
    });

    await createAccount({
      code: "2210",
      name: "Cash Accounts",
      accountType: "SUBCATEGORY",
      nature: "ASSET",
      isSystem: true,
      parentCode: "2200",
    });

    await createAccount({
      code: "2211",
      name: "Cash in Hand",
      accountType: "LEDGER",
      nature: "ASSET",
      isSystem: true,
      parentCode: "2210",
    });

    await createAccount({
      code: "2212",
      name: "Petty Cash",
      accountType: "LEDGER",
      nature: "ASSET",
      isSystem: true,
      parentCode: "2210",
    });

    await createAccount({
      code: "2220",
      name: "Bank & MFS Accounts",
      accountType: "SUBCATEGORY",
      nature: "ASSET",
      isSystem: true,
      parentCode: "2200",
    });

    await createAccount({
      code: "2221",
      name: "Bank Accounts",
      accountType: "LEDGER",
      nature: "ASSET",
      isSystem: true,
      parentCode: "2220",
    });

    await createAccount({
      code: "2222",
      name: "MFS",
      accountType: "LEDGER",
      nature: "ASSET",
      isSystem: true,
      parentCode: "2220",
    });

    await createAccount({
      code: "2300",
      name: "Receivables",
      accountType: "SUBCATEGORY",
      nature: "ASSET",
      isSystem: true,
      parentCode: "2000",
    });

    await createAccount({
      code: "2310",
      name: "Accounts Receivables Control",
      accountType: "LEDGER",
      nature: "ASSET",
      isSystem: true,
      parentCode: "2300",
    });

    await createAccount({
      code: "2320",
      name: "Others Receivable",
      accountType: "LEDGER",
      nature: "ASSET",
      isSystem: false,
      parentCode: "2300",
    });

    await createAccount({
      code: "2400",
      name: "Deposit & Advance",
      accountType: "SUBCATEGORY",
      nature: "ASSET",
      isSystem: true,
      parentCode: "2000",
    });

    await createAccount({
      code: "2410",
      name: "Utility Deposit",
      accountType: "LEDGER",
      nature: "ASSET",
      isSystem: false,
      parentCode: "2400",
    });

    await createAccount({
      code: "2420",
      name: "Advance to Supplier",
      accountType: "LEDGER",
      nature: "ASSET",
      isSystem: false,
      parentCode: "2400",
    });

    await createAccount({
      code: "2500",
      name: "Goods in Transit",
      accountType: "SUBCATEGORY",
      nature: "ASSET",
      isSystem: true,
      parentCode: "2000",
    });

    await createAccount({
      code: "2510",
      name: "Goods in Transit",
      accountType: "LEDGER",
      nature: "ASSET",
      isSystem: false,
      parentCode: "2500",
    });

    // ======== 2. LIABILITIES ========
    await createAccount({
      code: "3000",
      name: "Liabilities",
      accountType: "CATEGORY",
      nature: "LIABILITY",
      isSystem: true,
    });

    await createAccount({
      code: "3100",
      name: "Long Term Liabilities",
      accountType: "SUBCATEGORY",
      nature: "LIABILITY",
      isSystem: true,
      parentCode: "3000",
    });

    await createAccount({
      code: "3110",
      name: "Bank Loan",
      accountType: "LEDGER",
      nature: "LIABILITY",
      isSystem: false,
      parentCode: "3100",
    });

    await createAccount({
      code: "3200",
      name: "Current Liabilities",
      accountType: "SUBCATEGORY",
      nature: "LIABILITY",
      isSystem: true,
      parentCode: "3000",
    });

    await createAccount({
      code: "3210",
      name: "Payable",
      accountType: "SUBCATEGORY",
      nature: "LIABILITY",
      isSystem: true,
      parentCode: "3200",
    });

    await createAccount({
      code: "3211",
      name: "Accounts Payable Control",
      accountType: "LEDGER",
      nature: "LIABILITY",
      isSystem: true,
      parentCode: "3210",
    });

    await createAccount({
      code: "3212",
      name: "Others Payable",
      accountType: "LEDGER",
      nature: "LIABILITY",
      isSystem: true,
      parentCode: "3210",
    });

    await createAccount({
      code: "3220",
      name: "Advance Received",
      accountType: "SUBCATEGORY",
      nature: "LIABILITY",
      isSystem: true,
      parentCode: "3200",
    });

    await createAccount({
      code: "3221",
      name: "Advance from Customer",
      accountType: "LEDGER",
      nature: "LIABILITY",
      isSystem: false,
      parentCode: "3220",
    });

    await createAccount({
      code: "3230",
      name: "VAT",
      accountType: "SUBCATEGORY",
      nature: "LIABILITY",
      isSystem: true,
      parentCode: "3200",
    });

    await createAccount({
      code: "3231",
      name: "VAT Input",
      accountType: "LEDGER",
      nature: "LIABILITY",
      isSystem: true,
      parentCode: "3230",
    });

    await createAccount({
      code: "3232",
      name: "VAT Output",
      accountType: "LEDGER",
      nature: "LIABILITY",
      isSystem: true,
      parentCode: "3230",
    });

    await createAccount({
      code: "3240",
      name: "Loan",
      accountType: "SUBCATEGORY",
      nature: "LIABILITY",
      isSystem: true,
      parentCode: "3200",
    });

    await createAccount({
      code: "3241",
      name: "Short Term Loan",
      accountType: "LEDGER",
      nature: "LIABILITY",
      isSystem: false,
      parentCode: "3240",
    });

    await createAccount({
      code: "3242",
      name: "Time Loan",
      accountType: "LEDGER",
      nature: "LIABILITY",
      isSystem: false,
      parentCode: "3240",
    });

    await createAccount({
      code: "3243",
      name: "Personal Loan",
      accountType: "LEDGER",
      nature: "LIABILITY",
      isSystem: false,
      parentCode: "3240",
    });

    // ======== 3. EQUITY ========
    await createAccount({
      code: "4000",
      name: "Equity",
      accountType: "CATEGORY",
      nature: "EQUITY",
      isSystem: true,
    });

    await createAccount({
      code: "4100",
      name: "Capital & Reserves",
      accountType: "SUBCATEGORY",
      nature: "EQUITY",
      isSystem: true,
      parentCode: "4000",
    });

    await createAccount({
      code: "4110",
      name: "Paid-up Capital",
      accountType: "LEDGER",
      nature: "EQUITY",
      isSystem: false,
      parentCode: "4100",
    });

    await createAccount({
      code: "4200",
      name: "Withdraws",
      accountType: "SUBCATEGORY",
      nature: "EQUITY",
      isSystem: true,
      parentCode: "4000",
    });

    await createAccount({
      code: "4210",
      name: "Drawings",
      accountType: "LEDGER",
      nature: "EQUITY",
      isSystem: false,
      parentCode: "4200",
    });

    await createAccount({
      code: "4300",
      name: "Profit & Loss",
      accountType: "SUBCATEGORY",
      nature: "EQUITY",
      isSystem: true,
      parentCode: "4000",
    });

    await createAccount({
      code: "4310",
      name: "Retained Earnings",
      accountType: "LEDGER",
      nature: "EQUITY",
      isSystem: false,
      parentCode: "4300",
    });

    // ======== 4. INCOME ========
    await createAccount({
      code: "5000",
      name: "Income",
      accountType: "CATEGORY",
      nature: "INCOME",
      isSystem: true,
    });

    await createAccount({
      code: "5100",
      name: "Operating Income",
      accountType: "SUBCATEGORY",
      nature: "INCOME",
      isSystem: true,
      parentCode: "5000",
    });

    await createAccount({
      code: "5110",
      name: "Sales",
      accountType: "LEDGER",
      nature: "INCOME",
      isSystem: false,
      parentCode: "5100",
    });

    await createAccount({
      code: "5120",
      name: "Sales Return",
      accountType: "LEDGER",
      nature: "INCOME",
      isSystem: false,
      parentCode: "5100",
    });

    await createAccount({
      code: "5200",
      name: "Other Income",
      accountType: "SUBCATEGORY",
      nature: "INCOME",
      isSystem: true,
      parentCode: "5000",
    });

    await createAccount({
      code: "5210",
      name: "Service Income",
      accountType: "LEDGER",
      nature: "INCOME",
      isSystem: false,
      parentCode: "5200",
    });

    await createAccount({
      code: "5220",
      name: "Bank Interest",
      accountType: "LEDGER",
      nature: "INCOME",
      isSystem: false,
      parentCode: "5200",
    });

    await createAccount({
      code: "5230",
      name: "Commission",
      accountType: "LEDGER",
      nature: "INCOME",
      isSystem: false,
      parentCode: "5200",
    });

    // ======== 5. DIRECT EXPENSES ========
    await createAccount({
      code: "6000",
      name: "Direct Expenses",
      accountType: "CATEGORY",
      nature: "DIRECT_EXPENSE",
      isSystem: true,
    });

    await createAccount({
      code: "6100",
      name: "Direct Expenses",
      accountType: "SUBCATEGORY",
      nature: "DIRECT_EXPENSE",
      isSystem: true,
      parentCode: "6000",
    });

    await createAccount({
      code: "6110",
      name: "Carriage",
      accountType: "LEDGER",
      nature: "DIRECT_EXPENSE",
      isSystem: false,
      parentCode: "6100",
    });

    await createAccount({
      code: "6120",
      name: "Labour",
      accountType: "LEDGER",
      nature: "DIRECT_EXPENSE",
      isSystem: false,
      parentCode: "6100",
    });

    await createAccount({
      code: "6130",
      name: "Freight",
      accountType: "LEDGER",
      nature: "DIRECT_EXPENSE",
      isSystem: false,
      parentCode: "6100",
    });

    await createAccount({
      code: "6140",
      name: "Handling",
      accountType: "LEDGER",
      nature: "DIRECT_EXPENSE",
      isSystem: false,
      parentCode: "6100",
    });

    await createAccount({
      code: "6150",
      name: "Loading",
      accountType: "LEDGER",
      nature: "DIRECT_EXPENSE",
      isSystem: false,
      parentCode: "6100",
    });

    await createAccount({
      code: "6200",
      name: "Purchase",
      accountType: "SUBCATEGORY",
      nature: "DIRECT_EXPENSE",
      isSystem: true,
      parentCode: "6000",
    });

    await createAccount({
      code: "6210",
      name: "Purchase of Goods",
      accountType: "LEDGER",
      nature: "DIRECT_EXPENSE",
      isSystem: false,
      parentCode: "6200",
    });

    // ======== 6. INDIRECT EXPENSES ========
    await createAccount({
      code: "7000",
      name: "Indirect Expenses",
      accountType: "CATEGORY",
      nature: "INDIRECT_EXPENSE",
      isSystem: true,
    });

    await createAccount({
      code: "7100",
      name: "Administrative",
      accountType: "SUBCATEGORY",
      nature: "INDIRECT_EXPENSE",
      isSystem: true,
      parentCode: "7000",
    });

    await createAccount({
      code: "7110",
      name: "Depreciation",
      accountType: "LEDGER",
      nature: "INDIRECT_EXPENSE",
      isSystem: false,
      parentCode: "7100",
    });

    await createAccount({
      code: "7120",
      name: "Electricity",
      accountType: "LEDGER",
      nature: "INDIRECT_EXPENSE",
      isSystem: false,
      parentCode: "7100",
    });

    await createAccount({
      code: "7130",
      name: "Internet",
      accountType: "LEDGER",
      nature: "INDIRECT_EXPENSE",
      isSystem: false,
      parentCode: "7100",
    });

    await createAccount({
      code: "7140",
      name: "Rent",
      accountType: "LEDGER",
      nature: "INDIRECT_EXPENSE",
      isSystem: false,
      parentCode: "7100",
    });

    await createAccount({
      code: "7150",
      name: "Stationery",
      accountType: "LEDGER",
      nature: "INDIRECT_EXPENSE",
      isSystem: false,
      parentCode: "7100",
    });

    await createAccount({
      code: "7160",
      name: "Maintenance",
      accountType: "LEDGER",
      nature: "INDIRECT_EXPENSE",
      isSystem: false,
      parentCode: "7100",
    });

    await createAccount({
      code: "7200",
      name: "Financial",
      accountType: "SUBCATEGORY",
      nature: "INDIRECT_EXPENSE",
      isSystem: true,
      parentCode: "7000",
    });

    await createAccount({
      code: "7210",
      name: "Bank Charge",
      accountType: "LEDGER",
      nature: "INDIRECT_EXPENSE",
      isSystem: false,
      parentCode: "7200",
    });

    await createAccount({
      code: "7220",
      name: "Interest",
      accountType: "LEDGER",
      nature: "INDIRECT_EXPENSE",
      isSystem: false,
      parentCode: "7200",
    });

    await createAccount({
      code: "7230",
      name: "Loan Fee",
      accountType: "LEDGER",
      nature: "INDIRECT_EXPENSE",
      isSystem: false,
      parentCode: "7200",
    });

    await createAccount({
      code: "7300",
      name: "Sales & Marketing",
      accountType: "SUBCATEGORY",
      nature: "INDIRECT_EXPENSE",
      isSystem: true,
      parentCode: "7000",
    });

    await createAccount({
      code: "7310",
      name: "Advertisement",
      accountType: "LEDGER",
      nature: "INDIRECT_EXPENSE",
      isSystem: false,
      parentCode: "7300",
    });

    await createAccount({
      code: "7320",
      name: "Entertainment",
      accountType: "LEDGER",
      nature: "INDIRECT_EXPENSE",
      isSystem: false,
      parentCode: "7300",
    });

    await createAccount({
      code: "7330",
      name: "Digital Marketing",
      accountType: "LEDGER",
      nature: "INDIRECT_EXPENSE",
      isSystem: false,
      parentCode: "7300",
    });

    await createAccount({
      code: "7340",
      name: "Promotion",
      accountType: "LEDGER",
      nature: "INDIRECT_EXPENSE",
      isSystem: false,
      parentCode: "7300",
    });

    await createAccount({
      code: "7350",
      name: "Commission",
      accountType: "LEDGER",
      nature: "INDIRECT_EXPENSE",
      isSystem: false,
      parentCode: "7300",
    });
  }
}
