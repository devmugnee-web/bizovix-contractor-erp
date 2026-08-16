import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { TenderBankSettingsController } from "./tender-bank-settings.controller";
import { TenderBankSettingsService } from "./tender-bank-settings.service";

@Module({
  imports: [AuditLogModule],
  controllers: [TenderBankSettingsController],
  providers: [TenderBankSettingsService],
  exports: [TenderBankSettingsService],
})
export class TenderBankSettingsModule {}
