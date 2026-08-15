import { Module } from "@nestjs/common";
import { CashBankController } from "./cash-bank.controller";
import { CashBankService } from "./cash-bank.service";
import { AuditLogModule } from "../audit-logs/audit-log.module";

@Module({ imports: [AuditLogModule], controllers: [CashBankController], providers: [CashBankService], exports: [CashBankService] })
export class CashBankModule {}
