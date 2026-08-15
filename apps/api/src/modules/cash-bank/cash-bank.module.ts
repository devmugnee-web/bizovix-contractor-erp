import { forwardRef, Module } from "@nestjs/common";
import { CashBankController } from "./cash-bank.controller";
import { CashBankService } from "./cash-bank.service";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { AccountingModule } from "../accounting/accounting.module";

@Module({ imports: [AuditLogModule, forwardRef(() => AccountingModule)], controllers: [CashBankController], providers: [CashBankService], exports: [CashBankService] })
export class CashBankModule {}
