import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { ProjectBudgetsController } from "./project-budgets.controller";
import { ProjectBudgetsService } from "./project-budgets.service";

@Module({
  imports: [AuditLogModule],
  controllers: [ProjectBudgetsController],
  providers: [ProjectBudgetsService],
  exports: [ProjectBudgetsService],
})
export class ProjectBudgetsModule {}
