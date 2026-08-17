import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { AccountingModule } from "../accounting/accounting.module";
import { DeductionConfigsModule } from "../deduction-configs/deduction-configs.module";
import { NumberingModule } from "../settings-numbering/numbering.module";
import { ProjectBillsController } from "./project-bills.controller";
import { ProjectBillsService } from "./project-bills.service";

@Module({
  imports: [AuditLogModule, AccountingModule, DeductionConfigsModule, NumberingModule],
  controllers: [ProjectBillsController],
  providers: [ProjectBillsService],
  exports: [ProjectBillsService],
})
export class ProjectBillsModule {}
