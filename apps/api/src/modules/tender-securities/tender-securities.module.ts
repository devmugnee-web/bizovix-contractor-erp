import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { PrismaModule } from "../prisma/prisma.module";
import { TenderBankSettingsModule } from "../settings-tender-bank/tender-bank-settings.module";
import { TenderSecuritiesController } from "./tender-securities.controller";
import { TenderSecuritiesService } from "./tender-securities.service";

@Module({
  imports: [PrismaModule, AuditLogModule, TenderBankSettingsModule],
  controllers: [TenderSecuritiesController],
  providers: [TenderSecuritiesService],
})
export class TenderSecuritiesModule {}
