import { Module } from "@nestjs/common";
import { AccountingModule } from "../accounting/accounting.module";
import { CashBankModule } from "../cash-bank/cash-bank.module";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { PrismaModule } from "../prisma/prisma.module";
import { TenderBankSettingsModule } from "../settings-tender-bank/tender-bank-settings.module";
import { TenderSecuritiesController } from "./tender-securities.controller";
import { TenderSecuritiesService } from "./tender-securities.service";

@Module({
  imports: [PrismaModule, AuditLogModule, TenderBankSettingsModule, AccountingModule, CashBankModule],
  controllers: [TenderSecuritiesController],
  providers: [TenderSecuritiesService],
})
export class TenderSecuritiesModule {}
