import { Module } from "@nestjs/common";
import { AccountingModule } from "../accounting/accounting.module";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { CashBankModule } from "../cash-bank/cash-bank.module";
import { NumberingModule } from "../settings-numbering/numbering.module";
import { LcController } from "./lc.controller";
import { LcService } from "./lc.service";

@Module({ imports: [AccountingModule, AuditLogModule, CashBankModule, NumberingModule], controllers: [LcController], providers: [LcService] })
export class LcModule {}
