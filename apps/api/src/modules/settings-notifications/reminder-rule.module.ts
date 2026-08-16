import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { ReminderRuleController } from "./reminder-rule.controller";
import { ReminderRuleService } from "./reminder-rule.service";

@Module({
  imports: [AuditLogModule],
  controllers: [ReminderRuleController],
  providers: [ReminderRuleService],
  exports: [ReminderRuleService],
})
export class ReminderRuleModule {}
