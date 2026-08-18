import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { NumberingModule } from "../settings-numbering/numbering.module";
import { DeductionConfigsModule } from "../deduction-configs/deduction-configs.module";
import { FinanceSettingsModule } from "../settings-finance/finance-settings.module";
import { AccountingModule } from "../accounting/accounting.module";
import { SupplierBillsController } from "./supplier-bills.controller";
import { SupplierBillsService } from "./supplier-bills.service";

@Module({
  imports: [AuditLogModule, NumberingModule, DeductionConfigsModule, FinanceSettingsModule, AccountingModule],
  controllers: [SupplierBillsController],
  providers: [SupplierBillsService],
  exports: [SupplierBillsService],
})
export class SupplierBillsModule {}
