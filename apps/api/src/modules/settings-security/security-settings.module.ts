import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { SecuritySettingsController } from "./security-settings.controller";
import { SecuritySettingsService } from "./security-settings.service";

@Module({
  imports: [AuditLogModule],
  controllers: [SecuritySettingsController],
  providers: [SecuritySettingsService],
})
export class SecuritySettingsModule {}
