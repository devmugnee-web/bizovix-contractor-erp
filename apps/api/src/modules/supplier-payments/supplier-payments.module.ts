import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { NumberingModule } from "../settings-numbering/numbering.module";
import { AccountingModule } from "../accounting/accounting.module";
import { CashBankModule } from "../cash-bank/cash-bank.module";
import { SupplierPaymentsController } from "./supplier-payments.controller";
import { SupplierPaymentsService } from "./supplier-payments.service";

@Module({
  imports: [AuditLogModule, NumberingModule, AccountingModule, CashBankModule],
  controllers: [SupplierPaymentsController],
  providers: [SupplierPaymentsService],
  exports: [SupplierPaymentsService],
})
export class SupplierPaymentsModule {}
