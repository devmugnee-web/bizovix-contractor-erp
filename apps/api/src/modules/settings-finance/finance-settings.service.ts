import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import type { CreateAccountingPeriodDto, UpdateFinanceSettingDto } from "./dto/finance-settings.dto";

const ACCOUNT_FIELDS = [
  "defaultCashAccountId",
  "defaultPettyCashAccountId",
  "defaultBankChargeAccountId",
  "defaultReceivableAccountId",
  "defaultPayableAccountId",
  "defaultProjectRevenueAccountId",
  "defaultGeneralExpenseAccountId",
  "defaultTenderDocumentExpenseAccountId",
  "defaultCreditCommitmentChargeAccountId",
] as const;

@Injectable()
export class FinanceSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  get(org: string) {
    return this.prisma.financeSetting.upsert({
      where: { organizationId: org },
      update: {},
      create: { organizationId: org },
    });
  }

  accountOptions(org: string) {
    return this.prisma.ledgerAccount.findMany({
      where: { organizationId: org, isActive: true },
      select: { id: true, code: true, name: true, accountType: true },
      orderBy: { code: "asc" },
    });
  }

  async update(org: string, userId: string, dto: UpdateFinanceSettingDto) {
    const ids = ACCOUNT_FIELDS.map((field) => dto[field]).filter((id): id is string => !!id);
    if (ids.length) {
      const found = await this.prisma.ledgerAccount.count({
        where: { organizationId: org, id: { in: ids } },
      });
      if (found !== new Set(ids).size) throw new NotFoundException("One or more selected accounts were not found");
    }
    const old = await this.get(org);
    const row = await this.prisma.financeSetting.update({
      where: { organizationId: org },
      data: { ...dto, updatedById: userId },
    });
    await this.audit.record({
      organizationId: org,
      userId,
      action: "update",
      module: "Settings",
      entityType: "FinanceSetting",
      entityId: row.id,
      oldValue: old,
      newValue: row,
    });
    return row;
  }

  listPeriods(org: string) {
    return this.prisma.accountingPeriod.findMany({
      where: { organizationId: org },
      orderBy: { startDate: "desc" },
    });
  }

  async createPeriod(org: string, userId: string, dto: CreateAccountingPeriodDto) {
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (endDate < startDate) throw new BadRequestException("End date must be on or after the start date");
    const row = await this.prisma.accountingPeriod.create({
      data: { organizationId: org, label: dto.label.trim(), startDate, endDate },
    });
    await this.audit.record({
      organizationId: org,
      userId,
      action: "create",
      module: "Settings",
      entityType: "AccountingPeriod",
      entityId: row.id,
      referenceNo: row.label,
      newValue: row,
    });
    return row;
  }

  async setPeriodStatus(org: string, userId: string, id: string, status: "OPEN" | "LOCKED") {
    const old = await this.prisma.accountingPeriod.findFirst({ where: { id, organizationId: org } });
    if (!old) throw new NotFoundException("Accounting period not found");
    const row = await this.prisma.accountingPeriod.update({
      where: { id, organizationId: org },
      data:
        status === "LOCKED"
          ? { status, lockedById: userId, lockedAt: new Date() }
          : { status, lockedById: null, lockedAt: null },
    });
    await this.audit.record({
      organizationId: org,
      userId,
      action: status === "LOCKED" ? "lock" : "unlock",
      module: "Settings",
      entityType: "AccountingPeriod",
      entityId: id,
      referenceNo: row.label,
      oldValue: old,
      newValue: row,
    });
    return row;
  }

  /** Enforces posting-rule + period-lock policy for a proposed transaction date.
   * Called by AccountingService.post() so every journal-posting flow shares one gate. */
  async assertPostable(org: string, date: Date) {
    const [setting, lockedPeriod] = await Promise.all([
      this.prisma.financeSetting.findUnique({ where: { organizationId: org } }),
      this.prisma.accountingPeriod.findFirst({
        where: { organizationId: org, status: "LOCKED", startDate: { lte: date }, endDate: { gte: date } },
      }),
    ]);
    if (lockedPeriod)
      throw new BadRequestException(`The accounting period "${lockedPeriod.label}" is locked for posting`);
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfToday = new Date(startOfToday.getTime() + 86_400_000);
    if (setting && !setting.allowBackdatedTransactions && date < startOfToday)
      throw new BadRequestException("Backdated transactions are not allowed by Finance Settings");
    if (setting && !setting.allowFutureDatedTransactions && date >= endOfToday)
      throw new BadRequestException("Future-dated transactions are not allowed by Finance Settings");
  }
}
