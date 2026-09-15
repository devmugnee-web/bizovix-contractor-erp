import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { RemindersService } from "./reminders.service";

@Injectable()
export class RemindersSchedulerService {
  private readonly logger = new Logger(RemindersSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reminders: RemindersService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async generateDueNotifications(): Promise<void> {
    const organizations = await this.prisma.organization.findMany({ select: { id: true } });
    for (const org of organizations) {
      try {
        await this.notifications.generateForOrg(org.id);
      } catch (error) {
        this.logger.error(
          `Reminder notification generation failed for organization ${org.id}`,
          error instanceof Error ? error.stack : error,
        );
      }
    }
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async syncAllOrganizations(): Promise<void> {
    const organizations = await this.prisma.organization.findMany({ select: { id: true } });
    for (const org of organizations) {
      try {
        await this.reminders.syncOrganization(org.id);
      } catch (error) {
        this.logger.error(
          `Reminder sync failed for organization ${org.id}`,
          error instanceof Error ? error.stack : error,
        );
      }
    }
  }
}
