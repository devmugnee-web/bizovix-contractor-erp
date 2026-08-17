import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@bizovix/database";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { PrismaService } from "../prisma/prisma.service";
import type { QueryReportDto } from "./dto/query-report.dto";

type Cell = string | number | null;
type Report = {
  title: string;
  subtitle: string;
  kpis: Array<{ label: string; value: string; kind?: string }>;
  columns: Array<{ key: string; label: string; type?: string }>;
  rows: Array<Record<string, Cell>>;
  meta: { page: number; limit: number; total: number; totalPages: number };
};
const s = (v: Prisma.Decimal | number | string | null | undefined) => String(v ?? 0);
const moneyCol = (key: string, label: string) => ({ key, label, type: "money" });
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}
  private dates(q: QueryReportDto) {
    return q.dateFrom || q.dateTo
      ? {
          gte: q.dateFrom ? new Date(q.dateFrom) : undefined,
          lte: q.dateTo ? new Date(`${q.dateTo}T23:59:59.999Z`) : undefined,
        }
      : undefined;
  }
  private finish(base: Omit<Report, "meta">, q: QueryReportDto): Report {
    const page = q.page ?? 1,
      limit = q.limit ?? 10,
      total = base.rows.length;
    return {
      ...base,
      rows: base.rows.slice((page - 1) * limit, page * limit),
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }
  async summary(org: string) {
    const now = new Date(),
      month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const [expenses, receipts, works] = await Promise.all([
      this.prisma.expense.aggregate({
        where: { organizationId: org, expenseDate: { gte: month }, status: { not: "REJECTED" } },
        _sum: { amount: true },
      }),
      this.prisma.receipt.aggregate({
        where: { organizationId: org, receiptDate: { gte: month }, status: "RECEIVED" },
        _sum: { amount: true },
      }),
      this.prisma.cmsWork.findMany({
        where: { organizationId: org, status: "ONGOING" },
        select: {
          contractValue: true,
          receipts: { where: { status: "RECEIVED" }, select: { amount: true } },
        },
      }),
    ]);
    const outstanding = works.reduce(
      (s0, w) =>
        s0.add(
          Prisma.Decimal.max(
            new Prisma.Decimal(0),
            w.contractValue.minus(
              w.receipts.reduce((n, r) => n.add(r.amount), new Prisma.Decimal(0)),
            ),
          ),
        ),
      new Prisma.Decimal(0),
    );
    return {
      totalReports: 73,
      thisMonthExpenses: s(expenses._sum.amount),
      thisMonthReceipts: s(receipts._sum.amount),
      outstandingReceivables: s(outstanding),
    };
  }
  async options(org: string) {
    const [organizations, works, accounts, categories] = await Promise.all([
      this.prisma.organizationMaster.findMany({
        where: { organizationId: org },
        select: { id: true, shortName: true },
        orderBy: { shortName: "asc" },
      }),
      this.prisma.cmsWork.findMany({
        where: { organizationId: org },
        select: { id: true, workName: true },
        orderBy: { workName: "asc" },
      }),
      this.prisma.bankAccount.findMany({
        where: { organizationId: org },
        select: { id: true, accountName: true },
        orderBy: { accountName: "asc" },
      }),
      this.prisma.cmsWork.findMany({
        where: { organizationId: org },
        distinct: ["workCategory"],
        select: { workCategory: true },
      }),
    ]);
    return { organizations, works, accounts, categories: categories.map((x) => x.workCategory) };
  }
  async run(org: string, category: string, report: string, q: QueryReportDto): Promise<Report> {
    if (category === "tenders") return this.tenders(org, report, q);
    if (category === "projects") return this.projects(org, report, q);
    if (category === "expenses") return this.expenses(org, report, q);
    if (category === "receipts") return this.receipts(org, report, q);
    if (category === "cash-bank") return this.cashBank(org, report, q);
    if (category === "financial") return this.financial(org, report, q);
    if (category === "expiry-due") return this.expiry(org, report, q);
    if (["inventory", "assets", "inter-company"].includes(category))
      return this.unavailable(category, report, q);
    throw new NotFoundException("Report category not found");
  }
  private unavailable(category: string, report: string, q: QueryReportDto) {
    const label =
      category === "inter-company"
        ? "Inter-Company"
        : category[0]!.toUpperCase() + category.slice(1);
    return this.finish(
      {
        title: `${label} ${report
          .split("-")
          .map((x) => x[0]!.toUpperCase() + x.slice(1))
          .join(" ")} Report`,
        subtitle: `${label} source records are not available in this ERP yet. This report is ready for integration and does not invent financial data.`,
        kpis: [{ label: "Source Records", value: "0" }],
        columns: [
          { key: "status", label: "Integration Status" },
          { key: "note", label: "Data Source" },
        ],
        rows: [],
      },
      q,
    );
  }
  private async tenders(org: string, report: string, q: QueryReportDto) {
    if (report === "security-deposit")
      return this.finish(
        {
          title: "Security Deposit (SD) Report",
          subtitle:
            "No authoritative Security Deposit source exists yet. No estimated or duplicate balances are shown.",
          kpis: [{ label: "Source Records", value: "0" }],
          columns: [{ key: "status", label: "Integration Status" }],
          rows: [],
        },
        q,
      );
    if (report === "document-purchase") {
      const rows = await this.prisma.documentPurchase.findMany({
        where: {
          organizationId: org,
          purchaseDate: this.dates(q),
          organizationMasterId: q.organizationMasterId,
          paymentFromAccountId: q.accountId,
          purchaseType: q.category as never,
          OR: q.search
            ? [
                { egpTenderId: { contains: q.search, mode: "insensitive" } },
                { tenderWorkName: { contains: q.search, mode: "insensitive" } },
              ]
            : undefined,
        },
        include: { organizationMaster: true, paymentFromAccount: true },
        orderBy: { purchaseDate: "desc" },
      });
      const total = rows.reduce((n, x) => n.add(x.documentPrice), new Prisma.Decimal(0));
      return this.finish(
        {
          title: "Document Purchase Report",
          subtitle: "Tender document purchases from the authoritative document purchase source.",
          kpis: [
            { label: "Total Purchases", value: String(rows.length) },
            {
              label: "e-GP Purchases",
              value: String(rows.filter((x) => x.purchaseType === "EGP").length),
            },
            {
              label: "Manual Purchases",
              value: String(rows.filter((x) => x.purchaseType !== "EGP").length),
            },
            { label: "Total Document Amount", value: s(total), kind: "money" },
          ],
          columns: [
            { key: "date", label: "Purchase Date", type: "date" },
            { key: "type", label: "Purchase Type" },
            { key: "tender", label: "Tender ID" },
            { key: "organization", label: "Organization" },
            { key: "work", label: "Tender / Work Name" },
            moneyCol("price", "Document Price"),
            { key: "account", label: "Payment From" },
            { key: "status", label: "Status" },
          ],
          rows: rows.map((x) => ({
            date: x.purchaseDate.toISOString(),
            type: x.purchaseType,
            tender: x.egpTenderId ?? "-",
            organization: x.organizationMaster.shortName,
            work: x.tenderWorkName,
            price: s(x.documentPrice),
            account: x.paymentFromAccount.accountName,
            status: x.tenderSecurityStatus,
          })),
        },
        q,
      );
    }
    if (report === "tender-security") {
      const rows = await this.prisma.tenderSecurity.findMany({
        where: {
          organizationId: org,
          issueDate: this.dates(q),
          status: q.status as never,
          organizationMasterId: q.organizationMasterId,
        },
        include: { organizationMaster: true, bankAccount: true, tender: true },
        orderBy: { issueDate: "desc" },
      });
      const total = rows.reduce((n, r) => n.add(r.amount), new Prisma.Decimal(0));
      return this.finish(
        {
          title: "Tender Security Report",
          subtitle: "Security instruments, margin and expiry status.",
          kpis: [
            { label: "Total Securities", value: String(rows.length) },
            { label: "Total Security Amount", value: s(total), kind: "money" },
            { label: "Active", value: String(rows.filter((r) => r.status === "ACTIVE").length) },
            {
              label: "Expired / Expiring",
              value: String(
                rows.filter((r) => r.expiryDate <= new Date(Date.now() + 30 * 864e5)).length,
              ),
            },
          ],
          columns: [
            { key: "tender", label: "Tender ID" },
            { key: "organization", label: "Organization" },
            { key: "work", label: "Work / Tender" },
            { key: "type", label: "Security Type" },
            { key: "bank", label: "Bank" },
            moneyCol("amount", "Security Amount"),
            moneyCol("margin", "Margin Amount"),
            { key: "issueDate", label: "Issue Date", type: "date" },
            { key: "expiryDate", label: "Expiry Date", type: "date" },
            { key: "status", label: "Status" },
          ],
          rows: rows.map((r) => ({
            tender: r.tender?.egpTenderId ?? "-",
            organization: r.organizationMaster?.shortName ?? "-",
            work: r.tender?.workName ?? r.remarks ?? "-",
            type: r.securityType,
            bank: r.bankAccount?.accountName ?? "-",
            amount: s(r.amount),
            margin: s(r.marginAmount),
            issueDate: r.issueDate.toISOString(),
            expiryDate: r.expiryDate.toISOString(),
            status: r.status,
          })),
        },
        q,
      );
    }
    if (report === "credit-commitment") {
      const rows = await this.prisma.creditCommitmentItem.findMany({
        where: {
          creditCommitment: {
            organizationId: org,
            chargeDate: this.dates(q),
            organizationMasterId: q.organizationMasterId,
          },
        },
        include: {
          creditCommitment: { include: { organizationMaster: true, paymentFromAccount: true } },
          documentPurchase: true,
          bankAccount: true,
        },
        orderBy: { createdAt: "desc" },
      });
      return this.finish(
        {
          title: "Credit Commitment Report",
          subtitle: "Tender credit commitment charges by bank.",
          kpis: [
            { label: "Charged Tenders", value: String(rows.length) },
            {
              label: "Total Charge",
              value: s(rows.reduce((n, r) => n.add(r.chargeAmount), new Prisma.Decimal(0))),
              kind: "money",
            },
          ],
          columns: [
            { key: "date", label: "Date", type: "date" },
            { key: "tender", label: "Tender ID" },
            { key: "organization", label: "Organization" },
            { key: "work", label: "Work / Tender" },
            { key: "bank", label: "Bank" },
            moneyCol("amount", "Charge Amount"),
            { key: "paidFrom", label: "Paid From" },
            { key: "status", label: "Status" },
          ],
          rows: rows.map((r) => ({
            date: r.creditCommitment.chargeDate.toISOString(),
            tender: r.documentPurchase.egpTenderId ?? "-",
            organization: r.creditCommitment.organizationMaster?.shortName ?? "-",
            work: r.documentPurchase.tenderWorkName,
            bank: r.bankAccount.accountName,
            amount: s(r.chargeAmount),
            paidFrom: r.creditCommitment.paymentFromAccount?.accountName ?? "-",
            status: r.creditCommitment.isCharged ? "CHARGED" : "PENDING",
          })),
        },
        q,
      );
    }
    if (report === "pg-bg") {
      const rows = await this.prisma.performanceGuarantee.findMany({
        where: {
          organizationId: org,
          issueDate: this.dates(q),
          status: q.status as never,
          organizationMasterId: q.organizationMasterId,
        },
        include: { tender: true, organizationMaster: true, bankAccount: true, pgBgWorkflow: true },
        orderBy: { issueDate: "desc" },
      });
      return this.finish(
        {
          title: "PG/BG Report",
          subtitle: "Performance and bank guarantee exposure.",
          kpis: [
            { label: "Total PG/BG", value: String(rows.length) },
            {
              label: "Guarantee Amount",
              value: s(rows.reduce((n, r) => n.add(r.amount), new Prisma.Decimal(0))),
              kind: "money",
            },
            { label: "Active", value: String(rows.filter((r) => r.status === "ACTIVE").length) },
            {
              label: "Expiring Soon",
              value: String(
                rows.filter((r) => r.expiryDate <= new Date(Date.now() + 30 * 864e5)).length,
              ),
            },
          ],
          columns: [
            { key: "reference", label: "Reference" },
            { key: "work", label: "Tender / Project" },
            { key: "organization", label: "Organization" },
            { key: "type", label: "Type" },
            { key: "bank", label: "Bank" },
            moneyCol("amount", "Guarantee Amount"),
            { key: "issueDate", label: "Issue Date", type: "date" },
            { key: "expiryDate", label: "Expiry Date", type: "date" },
            { key: "status", label: "Status" },
          ],
          rows: rows.map((r) => ({
            reference: r.instrumentNo ?? r.id,
            work: r.tender?.workName ?? r.pgBgWorkflow?.workCategory ?? "-",
            organization: r.organizationMaster?.shortName ?? "-",
            type: r.type,
            bank: r.bankAccount?.accountName ?? "-",
            amount: s(r.amount),
            issueDate: r.issueDate.toISOString(),
            expiryDate: r.expiryDate.toISOString(),
            status: r.status,
          })),
        },
        q,
      );
    }
    const rows = await this.prisma.documentPurchase.findMany({
      where: {
        organizationId: org,
        purchaseDate: this.dates(q),
        organizationMasterId: q.organizationMasterId,
        purchaseType: q.category as never,
        OR: q.search
          ? [
              { egpTenderId: { contains: q.search, mode: "insensitive" } },
              { tenderWorkName: { contains: q.search, mode: "insensitive" } },
            ]
          : undefined,
      },
      include: { organizationMaster: true, pgBgWorkflow: true, cmsWork: true },
      orderBy: { purchaseDate: "desc" },
    });
    const awarded = rows.filter((r) => r.pgBgWorkflow?.acceptNoa).length,
      total = rows.reduce((n, r) => n.add(r.estimatedTenderAmount), new Prisma.Decimal(0));
    return this.finish(
      {
        title: report === "performance" ? "Tender Performance Report" : "Tender Summary Report",
        subtitle: "Purchased tender activity and award performance.",
        kpis: [
          { label: "Total Purchased", value: String(rows.length) },
          { label: "Total Tender Value", value: s(total), kind: "money" },
          { label: "NOA / Awarded", value: String(awarded) },
          {
            label: "Success Rate",
            value: `${rows.length ? ((awarded / rows.length) * 100).toFixed(2) : "0.00"}%`,
          },
        ],
        columns: [
          { key: "tender", label: "Tender ID" },
          { key: "organization", label: "Organization" },
          { key: "work", label: "Tender / Work Name" },
          { key: "category", label: "Work Category" },
          { key: "date", label: "Purchase Date", type: "date" },
          moneyCol("value", "Estimated Tender Value"),
          { key: "status", label: "Status" },
          { key: "noa", label: "NOA Status" },
        ],
        rows: rows.map((r) => ({
          tender: r.egpTenderId ?? "-",
          organization: r.organizationMaster.shortName,
          work: r.tenderWorkName,
          category: r.pgBgWorkflow?.workCategory ?? r.cmsWork?.workCategory ?? "-",
          date: r.purchaseDate.toISOString(),
          value: s(r.estimatedTenderAmount),
          status: r.cmsWork?.status ?? "PURCHASED",
          noa: r.pgBgWorkflow?.acceptNoa ? "AWARDED" : (r.pgBgWorkflow?.status ?? "PENDING"),
        })),
      },
      q,
    );
  }
  private async projects(org: string, report: string, q: QueryReportDto) {
    // "ongoing"/"archived" filter to that specific status; every other card (summary, cost,
    // profit-loss, receivable, expense-summary, financial-summary, performance) is a
    // portfolio-wide view across all project statuses, not just ongoing ones.
    const STATUS_FILTERED_REPORTS: Record<string, "ONGOING" | "ARCHIVED"> = {
      ongoing: "ONGOING",
      archived: "ARCHIVED",
    };
    const status = STATUS_FILTERED_REPORTS[report];
    const rows = await this.prisma.cmsWork.findMany({
      where: {
        organizationId: org,
        status,
        organizationMasterId: q.organizationMasterId,
        workCategory: q.category,
        OR: q.search ? [{ workName: { contains: q.search, mode: "insensitive" } }] : undefined,
      },
      include: {
        organizationMaster: true,
        projectExpenses: { where: { status: { not: "REJECTED" } }, include: { expenseHead: true } },
        receipts: { where: { status: "RECEIVED" } },
      },
      orderBy: { contractValue: "desc" },
    });
    const mapped = rows.map((r) => {
      const received = r.receipts.reduce((n, x) => n.add(x.amount), new Prisma.Decimal(0)),
        expense = r.projectExpenses.reduce((n, x) => n.add(x.amount), new Prisma.Decimal(0)),
        outstanding = Prisma.Decimal.max(new Prisma.Decimal(0), r.contractValue.minus(received)),
        profit = r.contractValue.minus(expense);
      return {
        project: r.workName,
        organization: r.organizationMaster.shortName,
        category: r.workCategory,
        startDate: r.startDate?.toISOString() ?? null,
        contract: s(r.contractValue),
        received: s(received),
        expense: s(expense),
        outstanding: s(outstanding),
        profit: s(profit),
        margin: r.contractValue.gt(0)
          ? `${profit.div(r.contractValue).mul(100).toFixed(2)}%`
          : "0.00%",
        progress: r.tenderId ? "Linked" : "Active",
        completion: r.completionDate?.toISOString() ?? null,
      };
    });
    return this.finish(
      {
        title:
          report === "ongoing"
            ? "Ongoing Works Report"
            : report === "archived"
              ? "Archived Works Report"
              : report === "cost"
                ? "Project Cost Report"
                : report === "profit-loss" || report === "profitability"
                  ? "Project-wise Profit & Loss"
                  : report === "receivable"
                    ? "Project Receivable Report"
                    : report === "expense-summary"
                      ? "Project Expense Summary"
                      : report === "financial-summary"
                        ? "Project Financial Summary"
                        : report === "performance"
                          ? "Project Performance Report"
                          : "Project Summary Report",
        subtitle: "Project contract, collection, expense and profitability analysis.",
        kpis: [
          { label: "Total Projects", value: String(rows.length) },
          {
            label: "Contract Value",
            value: s(rows.reduce((n, r) => n.add(r.contractValue), new Prisma.Decimal(0))),
            kind: "money",
          },
          {
            label: "Total Received",
            value: s(mapped.reduce((n, r) => n.add(r.received), new Prisma.Decimal(0))),
            kind: "money",
          },
          {
            label: "Total Expense",
            value: s(mapped.reduce((n, r) => n.add(r.expense), new Prisma.Decimal(0))),
            kind: "money",
          },
        ],
        columns: [
          { key: "project", label: "Project" },
          { key: "organization", label: "Organization" },
          { key: "category", label: "Category" },
          moneyCol("contract", "Contract Value"),
          moneyCol("received", "Received"),
          moneyCol("expense", "Total Cost"),
          moneyCol("outstanding", "Outstanding"),
          moneyCol("profit", "Estimated Profit"),
          { key: "margin", label: "Profit Margin" },
        ],
        rows: mapped,
      },
      q,
    );
  }
  private async expenses(org: string, report: string, q: QueryReportDto) {
    // "project"/"general" filter to that specific expense type; the analytical breakdowns
    // (category/person/account/monthly) span both — restricting them to project-only would
    // silently exclude general expenses from what should be a company-wide breakdown.
    const project = report === "project" ? true : report === "general" ? false : undefined;
    const rows = await this.prisma.expense.findMany({
      where: {
        organizationId: org,
        workId: project === true ? { not: null } : project === false ? null : undefined,
        expenseDate: this.dates(q),
        work: { organizationMasterId: q.organizationMasterId },
        expenseHeadId: q.category,
        status: { not: "REJECTED" },
        OR: q.search
          ? [
              { description: { contains: q.search, mode: "insensitive" } },
              { expenseHead: { name: { contains: q.search, mode: "insensitive" } } },
            ]
          : undefined,
      },
      include: {
        work: { include: { organizationMaster: true } },
        expenseHead: true,
        expenseBy: true,
        paidFromAccount: true,
      },
      orderBy: { expenseDate: "desc" },
    });
    const GROUPED_REPORTS: Record<string, { title: string; subtitle: string; columnLabel: string; keyOf: (r: (typeof rows)[number]) => string }> = {
      category: {
        title: "Expense by Category",
        subtitle: "Category contribution and transaction volume.",
        columnLabel: "Expense Category",
        keyOf: (r) => r.expenseHead?.name ?? r.category ?? "Other",
      },
      person: {
        title: "Expense by Person",
        subtitle: "Accountability of expenses by the person who incurred them.",
        columnLabel: "Expense By",
        keyOf: (r) => r.expenseBy?.name ?? "Unassigned",
      },
      account: {
        title: "Expense by Payment Account",
        subtitle: "Expenses grouped by the account they were paid from.",
        columnLabel: "Paid From Account",
        keyOf: (r) => r.paidFromAccount?.accountName ?? "Unassigned",
      },
      monthly: {
        title: "Monthly Expense",
        subtitle: "Month-wise expense movement.",
        columnLabel: "Month",
        keyOf: (r) => r.expenseDate.toLocaleDateString("en-GB", { month: "short", year: "numeric" }),
      },
    };
    const grouping = GROUPED_REPORTS[report];
    if (grouping) {
      const groups = new Map<string, { amount: Prisma.Decimal; count: number }>();
      rows.forEach((r) => {
        const k = grouping.keyOf(r),
          g = groups.get(k) ?? { amount: new Prisma.Decimal(0), count: 0 };
        g.amount = g.amount.add(r.amount);
        g.count++;
        groups.set(k, g);
      });
      const total = rows.reduce((n, r) => n.add(r.amount), new Prisma.Decimal(0));
      return this.finish(
        {
          title: grouping.title,
          subtitle: grouping.subtitle,
          kpis: [
            { label: "Total Expense", value: s(total), kind: "money" },
            { label: "Groups", value: String(groups.size) },
          ],
          columns: [
            { key: "category", label: grouping.columnLabel },
            moneyCol("total", "Total"),
            { key: "percentage", label: "Percentage" },
            { key: "count", label: "Transaction Count" },
          ],
          rows: [...groups].map(([category, g]) => ({
            category,
            total: s(g.amount),
            percentage: `${total.gt(0) ? g.amount.div(total).mul(100).toFixed(2) : "0.00"}%`,
            count: g.count,
          })),
        },
        q,
      );
    }
    const total = rows.reduce((n, r) => n.add(r.amount), new Prisma.Decimal(0));
    return this.finish(
      {
        title: project ? "Project Expense Report" : "General Expense Report",
        subtitle: "Expense details from the operational expense source.",
        kpis: [
          { label: "Total Expense", value: s(total), kind: "money" },
          { label: "Transactions", value: String(rows.length) },
          {
            label: "This Month",
            value: s(
              rows
                .filter(
                  (r) =>
                    r.expenseDate >= new Date(new Date().getFullYear(), new Date().getMonth(), 1),
                )
                .reduce((n, r) => n.add(r.amount), new Prisma.Decimal(0)),
            ),
            kind: "money",
          },
        ],
        columns: [
          { key: "date", label: "Date", type: "date" },
          { key: "project", label: "Project" },
          { key: "organization", label: "Organization" },
          { key: "head", label: "Expense Head" },
          { key: "description", label: "Description" },
          { key: "person", label: "Expense By" },
          { key: "account", label: "Paid From" },
          moneyCol("amount", "Amount"),
        ],
        rows: rows.map((r) => ({
          date: r.expenseDate.toISOString(),
          project: r.work?.workName ?? "General",
          organization: r.work?.organizationMaster.shortName ?? "Company",
          head: r.expenseHead?.name ?? r.category ?? "Other",
          description: r.description ?? "-",
          person: r.expenseBy?.name ?? "-",
          account: r.paidFromAccount?.accountName ?? "-",
          amount: s(r.amount),
        })),
      },
      q,
    );
  }
  private async receipts(org: string, report: string, q: QueryReportDto) {
    if (report === "outstanding" || report === "project-wise" || report === "collection-performance") {
      const rows = await this.prisma.cmsWork.findMany({
        where: { organizationId: org, organizationMasterId: q.organizationMasterId },
        include: {
          organizationMaster: true,
          receipts: { where: { status: "RECEIVED" }, orderBy: { receiptDate: "desc" } },
        },
      });
      const mapped = rows
        .map((r) => {
          const received = r.receipts.reduce((n, x) => n.add(x.amount), new Prisma.Decimal(0)),
            outstanding = Prisma.Decimal.max(
              new Prisma.Decimal(0),
              r.contractValue.minus(received),
            );
          return {
            project: r.workName,
            organization: r.organizationMaster.shortName,
            contract: s(r.contractValue),
            received: s(received),
            outstanding: s(outstanding),
            collection: r.contractValue.gt(0)
              ? `${received.div(r.contractValue).mul(100).toFixed(2)}%`
              : "0.00%",
            lastReceipt: r.receipts[0]?.receiptDate.toISOString() ?? null,
          };
        })
        .filter((r) => report !== "outstanding" || new Prisma.Decimal(r.outstanding).gt(0));
      const avgCollection = mapped.length
        ? mapped.reduce((n, r) => n + Number.parseFloat(r.collection), 0) / mapped.length
        : 0;
      return this.finish(
        {
          title:
            report === "outstanding"
              ? "Outstanding Receivables"
              : report === "collection-performance"
                ? "Collection Performance Report"
                : "Project-wise Receipts",
          subtitle:
            report === "collection-performance"
              ? "Collection rate against contract value, project by project."
              : "Project collection and outstanding receivable position.",
          kpis: [
            {
              label: "Total Receivable",
              value: s(mapped.reduce((n, r) => n.add(r.outstanding), new Prisma.Decimal(0))),
              kind: "money",
            },
            { label: "Projects", value: String(mapped.length) },
            ...(report === "collection-performance"
              ? [{ label: "Average Collection Rate", value: `${avgCollection.toFixed(2)}%` }]
              : []),
          ],
          columns: [
            { key: "project", label: "Project" },
            { key: "organization", label: "Organization" },
            moneyCol("contract", "Contract Value"),
            moneyCol("received", "Received"),
            moneyCol("outstanding", "Outstanding"),
            { key: "collection", label: "Collection %" },
            { key: "lastReceipt", label: "Last Receipt Date", type: "date" },
          ],
          rows: mapped,
        },
        q,
      );
    }
    const rows = await this.prisma.receipt.findMany({
      where: {
        organizationId: org,
        receiptDate: this.dates(q),
        workId: q.workId,
        receivedInAccountId: q.accountId,
        status: q.status as never,
        OR: q.search
          ? [
              { receiptNo: { contains: q.search, mode: "insensitive" } },
              { receivedFrom: { contains: q.search, mode: "insensitive" } },
            ]
          : undefined,
      },
      include: { work: { include: { organizationMaster: true } }, receivedInAccount: true },
      orderBy: { receiptDate: "desc" },
    });
    const RECEIPT_GROUPS: Record<string, { title: string; subtitle: string; columnLabel: string; keyOf: (r: (typeof rows)[number]) => string }> = {
      organization: {
        title: "Receipt by Organization",
        subtitle: "Client organization collection summary.",
        columnLabel: "Organization",
        keyOf: (r) => r.work?.organizationMaster.shortName ?? "General",
      },
      account: {
        title: "Receipt by Payment Account",
        subtitle: "Collections grouped by the receiving account.",
        columnLabel: "Received In",
        keyOf: (r) => r.receivedInAccount?.accountName ?? "Unassigned",
      },
      monthly: {
        title: "Monthly Receipt",
        subtitle: "Month-wise receipt movement.",
        columnLabel: "Month",
        keyOf: (r) => r.receiptDate.toLocaleDateString("en-GB", { month: "short", year: "numeric" }),
      },
    };
    const receiptGrouping = RECEIPT_GROUPS[report];
    if (receiptGrouping) {
      const received = rows.filter((r) => r.status === "RECEIVED");
      const groups = new Map<string, { amount: Prisma.Decimal; count: number }>();
      received.forEach((r) => {
        const k = receiptGrouping.keyOf(r),
          g = groups.get(k) ?? { amount: new Prisma.Decimal(0), count: 0 };
        g.amount = g.amount.add(r.amount);
        g.count++;
        groups.set(k, g);
      });
      const groupTotal = received.reduce((n, r) => n.add(r.amount), new Prisma.Decimal(0));
      return this.finish(
        {
          title: receiptGrouping.title,
          subtitle: receiptGrouping.subtitle,
          kpis: [
            { label: "Total Received", value: s(groupTotal), kind: "money" },
            { label: "Groups", value: String(groups.size) },
          ],
          columns: [
            { key: "group", label: receiptGrouping.columnLabel },
            moneyCol("total", "Total"),
            { key: "percentage", label: "Percentage" },
            { key: "count", label: "Transaction Count" },
          ],
          rows: [...groups].map(([group, g]) => ({
            group,
            total: s(g.amount),
            percentage: `${groupTotal.gt(0) ? g.amount.div(groupTotal).mul(100).toFixed(2) : "0.00"}%`,
            count: g.count,
          })),
        },
        q,
      );
    }
    const total = rows
      .filter((r) => r.status === "RECEIVED")
      .reduce((n, r) => n.add(r.amount), new Prisma.Decimal(0));
    return this.finish(
      {
        title: "Receipt Summary",
        subtitle: "Receipts counted once from the operational receipt source.",
        kpis: [
          { label: "Total Received", value: s(total), kind: "money" },
          { label: "Transactions", value: String(rows.length) },
          {
            label: "Project Receipts",
            value: s(
              rows.filter((r) => r.workId).reduce((n, r) => n.add(r.amount), new Prisma.Decimal(0)),
            ),
            kind: "money",
          },
        ],
        columns: [
          { key: "date", label: "Date", type: "date" },
          { key: "no", label: "Receipt No." },
          { key: "project", label: "Project / Source" },
          { key: "organization", label: "Organization" },
          { key: "type", label: "Receipt Type" },
          { key: "account", label: "Received In" },
          { key: "reference", label: "Reference" },
          moneyCol("amount", "Amount"),
          { key: "status", label: "Status" },
        ],
        rows: rows.map((r) => ({
          date: r.receiptDate.toISOString(),
          no: r.receiptNo ?? r.id,
          project: r.work?.workName ?? r.receivedFrom,
          organization: r.work?.organizationMaster.shortName ?? "Company",
          type: r.receiptType,
          account: r.receivedInAccount?.accountName ?? "-",
          reference: r.referenceNo ?? "-",
          amount: s(r.amount),
          status: r.status,
        })),
      },
      q,
    );
  }
  private async cashBank(org: string, report: string, q: QueryReportDto) {
    if (report === "transfers") {
      const rows = await this.prisma.fundTransfer.findMany({
        where: { organizationId: org, transferDate: this.dates(q) },
        include: { fromAccount: true, toAccount: true },
        orderBy: { transferDate: "desc" },
      });
      return this.finish(
        {
          title: "Bank Transfer Report",
          subtitle: "Internal movements shown separately from income and expense.",
          kpis: [
            { label: "Transfers", value: String(rows.length) },
            {
              label: "Transferred Amount",
              value: s(rows.reduce((n, r) => n.add(r.amount), new Prisma.Decimal(0))),
              kind: "money",
            },
            {
              label: "Bank Charges",
              value: s(rows.reduce((n, r) => n.add(r.bankCharge), new Prisma.Decimal(0))),
              kind: "money",
            },
          ],
          columns: [
            { key: "date", label: "Date", type: "date" },
            { key: "no", label: "Transfer No." },
            { key: "from", label: "Transfer From" },
            { key: "to", label: "Transfer To" },
            moneyCol("amount", "Amount"),
            moneyCol("charge", "Bank Charge"),
            { key: "status", label: "Status" },
          ],
          rows: rows.map((r) => ({
            date: r.transferDate.toISOString(),
            no: r.transferNo,
            from: r.fromAccount.accountName,
            to: r.toAccount.accountName,
            amount: s(r.amount),
            charge: s(r.bankCharge),
            status: r.status,
          })),
        },
        q,
      );
    }
    if (report === "cheques") {
      const rows = await this.prisma.cheque.findMany({
        where: { organizationId: org, chequeDate: this.dates(q), status: q.status },
        include: { account: true },
        orderBy: { chequeDate: "desc" },
      });
      return this.finish(
        {
          title: "Cheque Report",
          subtitle: "Issued and received cheque lifecycle.",
          kpis: [
            { label: "Total Cheques", value: String(rows.length) },
            { label: "Pending", value: String(rows.filter((r) => r.status === "PENDING").length) },
            { label: "Cleared", value: String(rows.filter((r) => r.status === "CLEARED").length) },
          ],
          columns: [
            { key: "date", label: "Cheque Date", type: "date" },
            { key: "no", label: "Cheque No." },
            { key: "type", label: "Type" },
            { key: "bank", label: "Bank" },
            { key: "party", label: "Party" },
            moneyCol("amount", "Amount"),
            { key: "status", label: "Status" },
          ],
          rows: rows.map((r) => ({
            date: r.chequeDate.toISOString(),
            no: r.chequeNo,
            type: r.type,
            bank: r.account?.accountName ?? r.bankName,
            party: r.party,
            amount: s(r.amount),
            status: r.status,
          })),
        },
        q,
      );
    }
    if (report === "reconciliation") {
      const rows = await this.prisma.bankReconciliation.findMany({
        where: { organizationId: org, accountId: q.accountId, statementTo: this.dates(q) },
        include: { account: true },
        orderBy: { statementTo: "desc" },
      });
      return this.finish(
        {
          title: "Bank Reconciliation Report",
          subtitle: "ERP balance vs. bank statement balance, and any unmatched difference.",
          kpis: [
            { label: "Reconciliations", value: String(rows.length) },
            { label: "Reconciled", value: String(rows.filter((r) => r.status === "RECONCILED").length) },
            { label: "Needs Review", value: String(rows.filter((r) => r.status !== "RECONCILED").length) },
          ],
          columns: [
            { key: "account", label: "Account" },
            { key: "statementTo", label: "Statement Date", type: "date" },
            moneyCol("erpBalance", "ERP Balance"),
            moneyCol("statementBalance", "Statement Balance"),
            moneyCol("difference", "Difference"),
            { key: "status", label: "Status" },
          ],
          rows: rows.map((r) => ({
            account: r.account.accountName,
            statementTo: r.statementTo.toISOString(),
            erpBalance: s(r.erpBalance),
            statementBalance: s(r.statementBalance),
            difference: s(r.difference),
            status: r.status,
          })),
        },
        q,
      );
    }
    const accountType = report === "cash-book" || report === "petty-cash" ? "CASH" : "BANK";
    const namedCashAccount = report === "cash-book" ? "Main Cash" : report === "petty-cash" ? "Petty Cash" : undefined;
    const rows = await this.prisma.financialTransaction.findMany({
      where: {
        organizationId: org,
        accountId: q.accountId,
        account: { accountType, accountName: namedCashAccount },
        transactionDate: this.dates(q),
        OR: q.search
          ? [
              { transactionNo: { contains: q.search, mode: "insensitive" } },
              { description: { contains: q.search, mode: "insensitive" } },
            ]
          : undefined,
      },
      include: { account: true },
      orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
    });
    return this.finish(
      {
        title:
          report === "bank-book"
            ? "Bank Book"
            : report === "petty-cash"
              ? "Petty Cash Report"
              : report === "cash-book"
                ? "Main Cash Report"
                : report === "transactions"
                  ? "Bank Transaction Report"
                  : report === "cash-flow"
                    ? "Cash Flow Report"
                    : "Cash & Bank Summary",
        subtitle:
          "Account movements including internal transfers without treating them as revenue.",
        kpis: [
          {
            label: "Total In",
            value: s(
              rows.reduce(
                (n, r) => (r.direction === "IN" ? n.add(r.amount) : n),
                new Prisma.Decimal(0),
              ),
            ),
            kind: "money",
          },
          {
            label: "Total Out",
            value: s(
              rows.reduce(
                (n, r) => (r.direction === "OUT" ? n.add(r.amount) : n),
                new Prisma.Decimal(0),
              ),
            ),
            kind: "money",
          },
        ],
        columns: [
          { key: "date", label: "Date", type: "date" },
          { key: "no", label: "Transaction No." },
          { key: "account", label: "Account" },
          { key: "source", label: "Source" },
          { key: "description", label: "Description" },
          moneyCol("in", "Cash / Bank In"),
          moneyCol("out", "Cash / Bank Out"),
          moneyCol("balance", "Balance"),
        ],
        rows: rows.map((r) => ({
          date: r.transactionDate.toISOString(),
          no: r.transactionNo,
          account: r.account.accountName,
          source: r.sourceModule,
          description: r.description,
          in: r.direction === "IN" ? s(r.amount) : "0",
          out: r.direction === "OUT" ? s(r.amount) : "0",
          balance: s(r.balanceAfter),
        })),
      },
      q,
    );
  }
  private async financial(org: string, report: string, q: QueryReportDto) {
    if (report === "receivable-aging") return this.receipts(org, "outstanding", q);
    if (report === "payable-aging") return this.payableAging(org, q);
    const lines = await this.prisma.journalLine.findMany({
      where: {
        accountId: q.accountId,
        projectId: q.workId,
        journalEntry: {
          organizationId: org,
          status: "POSTED",
          journalDate: this.dates(q),
          OR: q.search
            ? [
                { journalNo: { contains: q.search, mode: "insensitive" } },
                { referenceNo: { contains: q.search, mode: "insensitive" } },
              ]
            : undefined,
        },
      },
      include: { account: true, project: true, journalEntry: true },
      orderBy: [{ journalEntry: { journalDate: "asc" } }, { createdAt: "asc" }],
    });
    const debit = lines.reduce((n, x) => n.add(x.debit), new Prisma.Decimal(0));
    const credit = lines.reduce((n, x) => n.add(x.credit), new Prisma.Decimal(0));
    if (report === "ledger") {
      let running = new Prisma.Decimal(0);
      const rows = lines.map((x) => {
        running = running.add(x.debit).sub(x.credit);
        return {
          date: x.journalEntry.journalDate.toISOString(),
          journal: x.journalEntry.journalNo,
          reference: x.journalEntry.referenceNo ?? "-",
          account: `${x.account.code} - ${x.account.name}`,
          party: x.partyName ?? "-",
          project: x.project?.workName ?? "-",
          description: x.description ?? x.journalEntry.description,
          source: x.journalEntry.sourceModule,
          debit: s(x.debit),
          credit: s(x.credit),
          balance: s(running),
        };
      });
      return this.finish(
        {
          title: "General Ledger / Ledger Breakdown",
          subtitle: "Posted double-entry journal lines only.",
          kpis: [
            { label: "Total Debit", value: s(debit), kind: "money" },
            { label: "Total Credit", value: s(credit), kind: "money" },
            { label: "Closing Balance", value: s(debit.sub(credit)), kind: "money" },
          ],
          columns: [
            { key: "date", label: "Date", type: "date" },
            { key: "journal", label: "Voucher / Journal No" },
            { key: "reference", label: "Reference" },
            { key: "account", label: "Account" },
            { key: "party", label: "Party" },
            { key: "project", label: "Project" },
            { key: "source", label: "Source Module" },
            moneyCol("debit", "Debit"),
            moneyCol("credit", "Credit"),
            moneyCol("balance", "Running Balance"),
          ],
          rows,
        },
        q,
      );
    }
    const groups = new Map<
      string,
      { code: string; name: string; type: string; debit: Prisma.Decimal; credit: Prisma.Decimal }
    >();
    for (const x of lines) {
      const g = groups.get(x.accountId) ?? {
        code: x.account.code,
        name: x.account.name,
        type: x.account.accountType,
        debit: new Prisma.Decimal(0),
        credit: new Prisma.Decimal(0),
      };
      g.debit = g.debit.add(x.debit);
      g.credit = g.credit.add(x.credit);
      groups.set(x.accountId, g);
    }
    if (report === "trial-balance" || report === "account-balance") {
      const rows = [...groups.values()].map((g) => {
        const net = g.debit.sub(g.credit);
        return {
          code: g.code,
          name: g.name,
          type: g.type,
          openingDebit: "0",
          openingCredit: "0",
          periodDebit: s(g.debit),
          periodCredit: s(g.credit),
          closingDebit: s(Prisma.Decimal.max(net, 0)),
          closingCredit: s(Prisma.Decimal.max(net.negated(), 0)),
        };
      });
      return this.finish(
        {
          title: report === "trial-balance" ? "Trial Balance" : "Account Balance Summary",
          subtitle:
            "Balances from posted double-entry accounting data. Any imbalance is shown, never hidden.",
          kpis: [
            { label: "Total Debit", value: s(debit), kind: "money" },
            { label: "Total Credit", value: s(credit), kind: "money" },
            { label: "Difference", value: s(debit.sub(credit).abs()), kind: "money" },
          ],
          columns: [
            { key: "code", label: "Account Code" },
            { key: "name", label: "Account Name" },
            { key: "type", label: "Account Type" },
            moneyCol("openingDebit", "Opening Debit"),
            moneyCol("openingCredit", "Opening Credit"),
            moneyCol("periodDebit", "Period Debit"),
            moneyCol("periodCredit", "Period Credit"),
            moneyCol("closingDebit", "Closing Debit"),
            moneyCol("closingCredit", "Closing Credit"),
          ],
          rows,
        },
        q,
      );
    }
    const totals = (types: string[]) =>
      [...groups.values()]
        .filter((g) => types.includes(g.type.toUpperCase()))
        .reduce((n, g) => n.add(g.credit).sub(g.debit), new Prisma.Decimal(0));
    if (report === "profit-loss" || report === "company-profit-loss") {
      const income = totals(["INCOME", "REVENUE"]),
        expense = totals(["EXPENSE", "COST"]).negated(),
        net = income.sub(expense);
      return this.finish(
        {
          title: report === "company-profit-loss" ? "Company-wise Profit & Loss" : "Profit & Loss",
          subtitle:
            "Income and expense accounts from posted accounting entries; receipts are not treated as revenue.",
          kpis: [
            { label: "Total Revenue", value: s(income), kind: "money" },
            { label: "Total Expense", value: s(expense), kind: "money" },
            { label: "Net Profit / Loss", value: s(net), kind: "money" },
          ],
          columns: [
            { key: "section", label: "Section" },
            moneyCol("amount", "Amount"),
            { key: "percentage", label: "% of Revenue" },
          ],
          rows: [
            { section: "Revenue", amount: s(income), percentage: "100.00%" },
            {
              section: "Expenses",
              amount: s(expense),
              percentage: `${income.isZero() ? "0.00" : expense.div(income).mul(100).toFixed(2)}%`,
            },
            {
              section: "Net Profit / Loss",
              amount: s(net),
              percentage: `${income.isZero() ? "0.00" : net.div(income).mul(100).toFixed(2)}%`,
            },
          ],
        },
        q,
      );
    }
    if (report === "balance-sheet") {
      const by = (type: string) =>
        [...groups.values()]
          .filter((g) => g.type.toUpperCase() === type)
          .reduce((n, g) => n.add(g.debit).sub(g.credit), new Prisma.Decimal(0));
      const assets = by("ASSET"),
        liabilities = by("LIABILITY").negated(),
        equity = by("EQUITY").negated(),
        difference = assets.sub(liabilities.add(equity));
      return this.finish(
        {
          title: "Balance Sheet",
          subtitle: "Posted ledger balances only; missing setup remains visible as an imbalance.",
          kpis: [
            { label: "Total Assets", value: s(assets), kind: "money" },
            { label: "Liabilities + Equity", value: s(liabilities.add(equity)), kind: "money" },
            { label: "Difference", value: s(difference.abs()), kind: "money" },
          ],
          columns: [{ key: "section", label: "Section" }, moneyCol("amount", "Amount")],
          rows: [
            { section: "TOTAL ASSETS", amount: s(assets) },
            { section: "TOTAL LIABILITIES", amount: s(liabilities) },
            { section: "TOTAL EQUITY", amount: s(equity) },
            { section: "BALANCE DIFFERENCE", amount: s(difference) },
          ],
        },
        q,
      );
    }
    return this.finish(
      {
        title: "Financial Cash Flow",
        subtitle:
          "Posted ledger architecture is available; configure cash-flow account mappings to classify activities without inventing balances.",
        kpis: [
          { label: "Posted Debit", value: s(debit), kind: "money" },
          { label: "Posted Credit", value: s(credit), kind: "money" },
        ],
        columns: [
          { key: "status", label: "Status" },
          { key: "note", label: "Accounting Source" },
        ],
        rows: [],
      },
      q,
    );
  }
  private async payableAging(org: string, q: QueryReportDto) {
    const rows = await this.prisma.payable.findMany({
      where: {
        organizationId: org,
        dueDate: this.dates(q),
        status: { not: "PAID" },
        projectId: q.workId,
      },
      include: { project: true },
      orderBy: { dueDate: "asc" },
    });
    const mapped = rows.map((x) => ({
      bill: x.billNo,
      party: x.partyName,
      project: x.project?.workName ?? "-",
      billDate: x.billDate.toISOString(),
      dueDate: x.dueDate?.toISOString() ?? null,
      original: s(x.amount),
      paid: s(x.paidAmount),
      outstanding: s(x.amount.sub(x.paidAmount)),
      status: x.status,
    }));
    return this.finish(
      {
        title: "Payable Aging",
        subtitle: "Outstanding supplier bills from the payable source.",
        kpis: [
          {
            label: "Total Outstanding",
            value: s(
              rows.reduce((n, x) => n.add(x.amount.sub(x.paidAmount)), new Prisma.Decimal(0)),
            ),
            kind: "money",
          },
          { label: "Open Bills", value: String(rows.length) },
        ],
        columns: [
          { key: "bill", label: "Bill No" },
          { key: "party", label: "Party" },
          { key: "project", label: "Project" },
          { key: "billDate", label: "Bill Date", type: "date" },
          { key: "dueDate", label: "Due Date", type: "date" },
          moneyCol("original", "Original Amount"),
          moneyCol("paid", "Paid"),
          moneyCol("outstanding", "Outstanding"),
          { key: "status", label: "Status" },
        ],
        rows: mapped,
      },
      q,
    );
  }
  private expiryTotals(rows: Array<{ status: string }>) {
    return [
      { label: "Total Due Items", value: String(rows.length) },
      { label: "Expired", value: String(rows.filter((r) => r.status === "EXPIRED").length) },
      { label: "Due Soon", value: String(rows.filter((r) => r.status === "DUE SOON").length) },
    ];
  }
  private readonly expiryColumns = [
    { key: "type", label: "Item Type" },
    { key: "reference", label: "Reference" },
    { key: "dueDate", label: "Expiry / Due Date", type: "date" },
    moneyCol("amount", "Amount"),
    { key: "status", label: "Status" },
  ];
  private async expiry(org: string, report: string, q: QueryReportDto) {
    const to = new Date(Date.now() + 60 * 864e5);
    const now = new Date();

    if (report === "tender-security") {
      const rows = await this.prisma.tenderSecurity.findMany({
        where: { organizationId: org, expiryDate: { lte: to }, status: "ACTIVE" },
        orderBy: { expiryDate: "asc" },
      });
      const mapped = rows.map((r) => ({
        type: "Tender Security",
        reference: r.instrumentNo ?? r.id,
        dueDate: r.expiryDate.toISOString(),
        status: r.expiryDate < now ? "EXPIRED" : "DUE SOON",
        amount: s(r.amount),
      }));
      return this.finish(
        { title: "Tender Security Expiry", subtitle: "Tender security instruments approaching or past expiry.", kpis: this.expiryTotals(mapped), columns: this.expiryColumns, rows: mapped },
        q,
      );
    }
    if (report === "pg-bg") {
      const rows = await this.prisma.performanceGuarantee.findMany({
        where: { organizationId: org, expiryDate: { lte: to }, status: "ACTIVE" },
        orderBy: { expiryDate: "asc" },
      });
      const mapped = rows.map((r) => ({
        type: r.type,
        reference: r.instrumentNo ?? r.id,
        dueDate: r.expiryDate.toISOString(),
        status: r.expiryDate < now ? "EXPIRED" : "DUE SOON",
        amount: s(r.amount),
      }));
      return this.finish(
        { title: "PG/BG Expiry", subtitle: "Performance and bid guarantees approaching or past expiry.", kpis: this.expiryTotals(mapped), columns: this.expiryColumns, rows: mapped },
        q,
      );
    }
    if (report === "cheques") {
      const rows = await this.prisma.cheque.findMany({
        where: { organizationId: org, status: { in: ["PENDING", "DEPOSITED"] } },
        orderBy: { chequeDate: "asc" },
      });
      const mapped = rows.map((r) => ({
        type: "Cheque",
        reference: r.chequeNo,
        dueDate: r.chequeDate.toISOString(),
        status: r.chequeDate < now ? "EXPIRED" : "DUE SOON",
        amount: s(r.amount),
      }));
      return this.finish(
        { title: "Cheque Maturity", subtitle: "Pending and deposited cheques awaiting clearance by maturity date.", kpis: this.expiryTotals(mapped), columns: this.expiryColumns, rows: mapped },
        q,
      );
    }
    if (report === "documents") {
      const rows = await this.prisma.document.findMany({
        where: { organizationId: org, expiryDate: { lte: to }, status: { not: "ARCHIVED" } },
        orderBy: { expiryDate: "asc" },
      });
      const mapped = rows.map((r) => ({
        type: "Document",
        reference: r.name,
        dueDate: r.expiryDate?.toISOString() ?? null,
        status: r.expiryDate && r.expiryDate < now ? "EXPIRED" : "DUE SOON",
        amount: "0",
      }));
      return this.finish(
        { title: "Document Expiry", subtitle: "Business documents approaching or past their expiry date.", kpis: this.expiryTotals(mapped), columns: this.expiryColumns, rows: mapped },
        q,
      );
    }
    if (report === "payables" || report === "bill-maturity") {
      const rows = await this.prisma.payable.findMany({
        where: { organizationId: org, status: { not: "PAID" }, dueDate: { lte: to } },
        orderBy: { dueDate: "asc" },
      });
      const mapped = rows.map((r) => ({
        type: "Payable",
        reference: r.billNo,
        dueDate: r.dueDate?.toISOString() ?? null,
        status: r.dueDate && r.dueDate < now ? "EXPIRED" : "DUE SOON",
        amount: s(r.amount.sub(r.paidAmount)),
      }));
      if (report === "payables") {
        return this.finish(
          { title: "Payable Due", subtitle: "Outstanding vendor/party bills approaching or past their due date.", kpis: this.expiryTotals(mapped), columns: this.expiryColumns, rows: mapped },
          q,
        );
      }
      // bill-maturity: a broader "bills due" view spanning both payables and outstanding receivables.
      const projects = await this.prisma.cmsWork.findMany({
        where: { organizationId: org, expectedCompletionDate: { lte: to } },
        include: { receipts: { where: { status: "RECEIVED" } } },
      });
      const receivableRows = projects
        .map((r) => {
          const received = r.receipts.reduce((n, x) => n.add(x.amount), new Prisma.Decimal(0));
          const outstanding = Prisma.Decimal.max(new Prisma.Decimal(0), r.contractValue.minus(received));
          return {
            type: "Receivable",
            reference: r.workName,
            dueDate: r.expectedCompletionDate?.toISOString() ?? null,
            status: r.expectedCompletionDate && r.expectedCompletionDate < now ? "EXPIRED" : "DUE SOON",
            amount: s(outstanding),
          };
        })
        .filter((r) => new Prisma.Decimal(r.amount).gt(0));
      const combined = [...mapped, ...receivableRows];
      return this.finish(
        { title: "Bill Maturity Report", subtitle: "Upcoming and overdue bills — both payable and receivable — by maturity bucket.", kpis: this.expiryTotals(combined), columns: this.expiryColumns, rows: combined },
        q,
      );
    }
    if (report === "receivables") {
      const projects = await this.prisma.cmsWork.findMany({
        where: { organizationId: org },
        include: { receipts: { where: { status: "RECEIVED" } } },
      });
      const mapped = projects
        .map((r) => {
          const received = r.receipts.reduce((n, x) => n.add(x.amount), new Prisma.Decimal(0));
          const outstanding = Prisma.Decimal.max(new Prisma.Decimal(0), r.contractValue.minus(received));
          return {
            type: "Receivable",
            reference: r.workName,
            dueDate: r.expectedCompletionDate?.toISOString() ?? null,
            status: r.expectedCompletionDate && r.expectedCompletionDate < now ? "EXPIRED" : "DUE SOON",
            amount: s(outstanding),
          };
        })
        .filter((r) => new Prisma.Decimal(r.amount).gt(0));
      return this.finish(
        { title: "Receivable Due", subtitle: "Outstanding project collections against expected completion date.", kpis: this.expiryTotals(mapped), columns: this.expiryColumns, rows: mapped },
        q,
      );
    }
    if (report === "security-deposit") {
      return this.finish(
        {
          title: "Security Deposit Release Due",
          subtitle: "No authoritative Security Deposit source exists yet. No estimated or duplicate balances are shown.",
          kpis: [{ label: "Source Records", value: "0" }],
          columns: [{ key: "status", label: "Integration Status" }],
          rows: [],
        },
        q,
      );
    }
    throw new NotFoundException("Expiry & Due report not found");
  }
  async export(org: string, userId: string, category: string, report: string, q: QueryReportDto) {
    const result = await this.run(org, category, report, { ...q, page: 1, limit: 100 });
    const esc = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const lines = [
      result.columns.map((c) => esc(c.label)).join(","),
      ...result.rows.map((r) => result.columns.map((c) => esc(r[c.key])).join(",")),
    ];
    await this.audit.record({
      organizationId: org,
      userId,
      action: "REPORT_EXPORTED",
      module: "Reports",
      description: `Exported ${result.title}`,
      referenceNo: `${category}/${report}`,
      entityType: "Report",
      newValue: { filters: q, rowCount: result.meta.total },
    });
    return {
      filename: `${category}-${report}-${new Date().toISOString().slice(0, 10)}.csv`,
      content: `\uFEFF${lines.join("\r\n")}`,
    };
  }
}
