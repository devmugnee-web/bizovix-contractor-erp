import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ReminderRuleModule } from "../settings-notifications/reminder-rule.module";
import { ProjectClosingModule } from "../project-closing/project-closing.module";
import { RemindersController } from "./reminders.controller";
import { RemindersSchedulerService } from "./reminders-scheduler.service";
import { RemindersService } from "./reminders.service";
@Module({
  imports: [PrismaModule, AuditLogModule, NotificationsModule, ReminderRuleModule, ProjectClosingModule],
  controllers: [RemindersController],
  providers: [RemindersService, RemindersSchedulerService],
  exports: [RemindersService],
})
export class RemindersModule {}
