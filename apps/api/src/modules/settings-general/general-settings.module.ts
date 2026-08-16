import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { GeneralSettingsController } from "./general-settings.controller";
import { GeneralSettingsService } from "./general-settings.service";

@Module({
  imports: [AuditLogModule],
  controllers: [GeneralSettingsController],
  providers: [GeneralSettingsService],
})
export class GeneralSettingsModule {}
