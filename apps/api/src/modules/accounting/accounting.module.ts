import { forwardRef, Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { AccountingController } from "./accounting.controller";
import { AccountingService } from "./accounting.service";
import { CashBankModule } from "../cash-bank/cash-bank.module";
import { FinanceSettingsModule } from "../settings-finance/finance-settings.module";
@Module({
  imports: [AuditLogModule, forwardRef(() => CashBankModule), FinanceSettingsModule],
  controllers: [AccountingController],
  providers: [AccountingService],
  exports: [AccountingService],
})
export class AccountingModule {}
