import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { AccountingModule } from "../accounting/accounting.module";
import { DeductionConfigsModule } from "../deduction-configs/deduction-configs.module";
import { NumberingModule } from "../settings-numbering/numbering.module";
import { ProjectBillsController } from "./project-bills.controller";
import { ProjectBillsService } from "./project-bills.service";
import { BillWorkspaceService } from "./bill-workspace.service";
import { ProjectCostingReportController, TenderBillCostingController } from "./project-costing-report.controller";
import { ProjectCostingReportService } from "./project-costing-report.service";

@Module({
  imports: [AuditLogModule, AccountingModule, DeductionConfigsModule, NumberingModule],
  controllers: [ProjectBillsController, ProjectCostingReportController, TenderBillCostingController],
  providers: [ProjectBillsService, BillWorkspaceService, ProjectCostingReportService],
  exports: [ProjectBillsService],
})
export class ProjectBillsModule {}
