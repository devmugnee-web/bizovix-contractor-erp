import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { QueryNotificationDto } from "./dto/notification.dto";
import {
  calendarDaysUntil,
  DEFAULT_REMINDER_TIME_ZONE,
  reminderDueAt,
} from "../reminders/reminder-timing";

interface ReminderForNotification {
  id: string;
  type: string;
  title: string;
  priority: string;
  status: string;
  dueDate: Date;
  dueTime: string | null;
  notificationBefore: number;
  assignedToUserId: string | null;
  relatedEntityName: string | null;
  referenceNo: string | null;
  sourceModule: string;
  sourceType: string | null;
  sourceId: string | null;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(org: string, userId: string, q: QueryNotificationDto) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 10;
    const where = {
      organizationId: org,
      userId,
      ...(q.isRead !== undefined ? { isRead: q.isRead } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" as const },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      items,
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  unreadCount(org: string, userId: string) {
    return this.prisma.notification.count({
      where: { organizationId: org, userId, isRead: false },
    });
  }

  async markRead(org: string, userId: string, id: string) {
    const row = await this.prisma.notification.findFirst({
      where: { id, organizationId: org, userId },
    });
    if (!row) throw new NotFoundException("Notification not found");
    if (row.isRead) return row;
    return this.prisma.notification.update({
      where: { id, organizationId: org, userId },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllRead(org: string, userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { organizationId: org, userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { count: result.count };
  }

  async resolveForReminder(org: string, reminderId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { organizationId: org, reminderId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async resetForReminders(org: string, reminderIds: string[]): Promise<void> {
    if (!reminderIds.length) return;
    await this.prisma.notification.deleteMany({
      where: { organizationId: org, reminderId: { in: reminderIds } },
    });
  }

  async generateForOrg(org: string, organizationTimeZone?: string): Promise<void> {
    const reminders = await this.prisma.reminder.findMany({
      where: { organizationId: org, status: { in: ["UPCOMING", "DUE_TODAY", "OVERDUE"] } },
    });
    if (!reminders.length) return;

    const fallbackRecipients = await this.prisma.organizationUser.findMany({
      where: {
        organizationId: org,
        role: { permissions: { some: { permission: { key: "reminders.read" } } } },
      },
      select: { userId: true },
    });
    const fallbackUserIds = fallbackRecipients.map((r) => r.userId);
    const timeZone =
      organizationTimeZone ??
      (
        await this.prisma.generalSetting.findUnique({
          where: { organizationId: org },
          select: { timezone: true },
        })
      )?.timezone ??
      DEFAULT_REMINDER_TIME_ZONE;
    const now = new Date();

    for (const reminder of reminders as ReminderForNotification[]) {
      const daysUntilDue = calendarDaysUntil(
        reminder.dueDate,
        now,
        timeZone,
        reminder.sourceModule === "MANUAL",
      );
      const stage = this.resolveStage(reminder, daysUntilDue, now, timeZone);
      if (!stage) continue;

      const recipients = reminder.assignedToUserId ? [reminder.assignedToUserId] : fallbackUserIds;
      if (!recipients.length) continue;

      const { title, message } = this.buildMessage(reminder, stage, daysUntilDue);

      for (const userId of recipients) {
        await this.prisma.notification.upsert({
          where: {
            organizationId_userId_reminderId_type: {
              organizationId: org,
              userId,
              reminderId: reminder.id,
              type: stage,
            },
          },
          update: {},
          create: {
            organizationId: org,
            userId,
            reminderId: reminder.id,
            type: stage,
            title,
            message,
            priority: reminder.priority,
            sourceModule: reminder.sourceModule,
            sourceType: reminder.sourceType,
            sourceId: reminder.sourceId,
          },
        });
      }
    }
  }

  private resolveStage(
    reminder: ReminderForNotification,
    daysUntilDue: number,
    now = new Date(),
    timeZone = DEFAULT_REMINDER_TIME_ZONE,
  ): string | null {
    if (daysUntilDue === 0 && reminder.dueTime) {
      return now.getTime() >= reminderDueAt(reminder.dueDate, reminder.dueTime, timeZone).getTime()
        ? "DUE_NOW"
        : null;
    }
    if (reminder.status === "OVERDUE") return "OVERDUE";
    if (reminder.status === "DUE_TODAY") return "DUE_TODAY";
    if (reminder.sourceModule === "TENDER_SECURITY" && reminder.sourceType === "Tender Security") {
      if (daysUntilDue <= 7) return "TENDER_SECURITY_7_DAYS";
      if (daysUntilDue <= 15) return "TENDER_SECURITY_15_DAYS";
      return null;
    }
    if (reminder.notificationBefore <= 0) return null;
    if (daysUntilDue <= 1) return "URGENT";
    return daysUntilDue <= reminder.notificationBefore ? "UPCOMING" : null;
  }

  private buildMessage(reminder: ReminderForNotification, stage: string, daysUntilDue: number) {
    const subject = reminder.relatedEntityName ?? reminder.title;
    const ref = reminder.referenceNo ? ` (${reminder.referenceNo})` : "";
    const stageText =
      stage === "OVERDUE"
        ? `is overdue by ${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) === 1 ? "" : "s"}`
        : stage === "DUE_NOW"
          ? "is due now"
          : stage === "DUE_TODAY"
            ? "is due today"
            : stage === "TENDER_SECURITY_7_DAYS" || stage === "TENDER_SECURITY_15_DAYS"
              ? `expires in ${daysUntilDue} days`
              : stage === "URGENT"
                ? "is due tomorrow"
                : `is due in ${daysUntilDue} days`;
    const stageTitle =
      stage === "OVERDUE"
        ? "overdue"
        : stage === "DUE_NOW"
          ? "due now"
          : stage === "DUE_TODAY"
            ? "expires today"
            : stage === "TENDER_SECURITY_7_DAYS"
              ? "expires within 7 days"
              : stage === "TENDER_SECURITY_15_DAYS"
                ? "expires within 15 days"
                : stage === "URGENT"
                  ? "due tomorrow"
                  : "upcoming";

    return {
      title: `${reminder.type} ${stageTitle}`,
      message: `${subject}${ref} ${stageText}.`,
    };
  }
}
