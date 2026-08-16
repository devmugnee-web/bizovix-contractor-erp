import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { FinanceSettingsController } from "./finance-settings.controller";
import { FinanceSettingsService } from "./finance-settings.service";

@Module({
  imports: [AuditLogModule],
  controllers: [FinanceSettingsController],
  providers: [FinanceSettingsService],
  exports: [FinanceSettingsService],
})
export class FinanceSettingsModule {}
