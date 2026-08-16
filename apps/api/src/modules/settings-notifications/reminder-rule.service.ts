import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import type { UpdateReminderRuleDto } from "./dto/reminder-rule.dto";

export const REMINDER_RULE_TYPES = [
  "TENDER_OPENING",
  "TENDER_CLOSING",
  "TENDER_SECURITY_EXPIRY",
  "PG_EXPIRY",
  "BG_EXPIRY",
  "SECURITY_DEPOSIT_EXPIRY",
  "BILL_MATURITY",
  "CHEQUE_MATURITY",
  "LOAN_EMI_DUE",
  "DOCUMENT_EXPIRY",
  "RECEIVABLE_DUE",
  "PAYABLE_DUE",
  "CONTRACT_EXPIRY",
] as const;
export type ReminderRuleType = (typeof REMINDER_RULE_TYPES)[number];

const DEFAULT_PRIORITY: Record<ReminderRuleType, string> = {
  TENDER_OPENING: "MEDIUM",
  TENDER_CLOSING: "MEDIUM",
  TENDER_SECURITY_EXPIRY: "HIGH",
  PG_EXPIRY: "CRITICAL",
  BG_EXPIRY: "CRITICAL",
  SECURITY_DEPOSIT_EXPIRY: "MEDIUM",
  BILL_MATURITY: "MEDIUM",
  CHEQUE_MATURITY: "HIGH",
  LOAN_EMI_DUE: "MEDIUM",
  DOCUMENT_EXPIRY: "MEDIUM",
  RECEIVABLE_DUE: "HIGH",
  PAYABLE_DUE: "HIGH",
  CONTRACT_EXPIRY: "MEDIUM",
};

const DEFAULT_OFFSETS: Record<ReminderRuleType, number[]> = {
  TENDER_OPENING: [7, 3],
  TENDER_CLOSING: [7, 3],
  TENDER_SECURITY_EXPIRY: [30, 15],
  PG_EXPIRY: [30, 15],
  BG_EXPIRY: [30, 15],
  SECURITY_DEPOSIT_EXPIRY: [30],
  BILL_MATURITY: [7],
  CHEQUE_MATURITY: [3],
  LOAN_EMI_DUE: [7],
  DOCUMENT_EXPIRY: [30],
  RECEIVABLE_DUE: [7],
  PAYABLE_DUE: [7],
  CONTRACT_EXPIRY: [30],
};

@Injectable()
export class ReminderRuleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async ensureDefaults(org: string) {
    for (const reminderType of REMINDER_RULE_TYPES) {
      await this.prisma.reminderRuleSetting.upsert({
        where: { organizationId_reminderType: { organizationId: org, reminderType } },
        update: {},
        create: {
          organizationId: org,
          reminderType,
          defaultPriority: DEFAULT_PRIORITY[reminderType],
          offsetDays: DEFAULT_OFFSETS[reminderType],
        },
      });
    }
  }

  async list(org: string) {
    await this.ensureDefaults(org);
    return this.prisma.reminderRuleSetting.findMany({
      where: { organizationId: org },
      orderBy: { reminderType: "asc" },
    });
  }

  /** Reads the effective rule for a reminder type, falling back to library defaults
   * when a row hasn't been created yet — used by RemindersService's generation pass. */
  async ruleFor(org: string, reminderType: string) {
    const row = await this.prisma.reminderRuleSetting.findUnique({
      where: { organizationId_reminderType: { organizationId: org, reminderType } },
    });
    if (row) return row;
    if (!REMINDER_RULE_TYPES.includes(reminderType as ReminderRuleType)) return null;
    return {
      isEnabled: true,
      defaultPriority: DEFAULT_PRIORITY[reminderType as ReminderRuleType],
      offsetDays: DEFAULT_OFFSETS[reminderType as ReminderRuleType],
      inAppEnabled: true,
      emailEnabled: false,
    };
  }

  async allRules(org: string) {
    await this.ensureDefaults(org);
    const rows = await this.prisma.reminderRuleSetting.findMany({ where: { organizationId: org } });
    return new Map(rows.map((row) => [row.reminderType, row]));
  }

  async update(org: string, userId: string, reminderType: string, dto: UpdateReminderRuleDto) {
    if (!REMINDER_RULE_TYPES.includes(reminderType as ReminderRuleType))
      throw new BadRequestException(`Unknown reminder type: ${reminderType}`);
    await this.ensureDefaults(org);
    const old = await this.prisma.reminderRuleSetting.findUnique({
      where: { organizationId_reminderType: { organizationId: org, reminderType } },
    });
    const offsetDays = Array.from(new Set(dto.offsetDays)).sort((a, b) => b - a);
    const row = await this.prisma.reminderRuleSetting.update({
      where: { organizationId_reminderType: { organizationId: org, reminderType } },
      data: {
        isEnabled: dto.isEnabled,
        defaultPriority: dto.defaultPriority,
        offsetDays,
        inAppEnabled: dto.inAppEnabled,
        emailEnabled: dto.emailEnabled,
        updatedById: userId,
      },
    });
    await this.audit.record({
      organizationId: org,
      userId,
      action: "update",
      module: "Settings",
      entityType: "ReminderRuleSetting",
      entityId: row.id,
      referenceNo: reminderType,
      oldValue: old,
      newValue: row,
    });
    return row;
  }
}
