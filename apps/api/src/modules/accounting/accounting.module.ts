import { forwardRef, Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { AccountingController } from "./accounting.controller";
import { AccountingService } from "./accounting.service";
import { CashBankModule } from "../cash-bank/cash-bank.module";
@Module({
  imports: [AuditLogModule, forwardRef(() => CashBankModule)],
  controllers: [AccountingController],
  providers: [AccountingService],
  exports: [AccountingService],
})
export class AccountingModule {}
