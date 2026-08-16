import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { ApprovalRuleController } from "./approval-rule.controller";
import { ApprovalRuleService } from "./approval-rule.service";

@Module({
  imports: [AuditLogModule],
  controllers: [ApprovalRuleController],
  providers: [ApprovalRuleService],
  exports: [ApprovalRuleService],
})
export class ApprovalRuleModule {}
