import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { DocumentSettingsController } from "./document-settings.controller";
import { DocumentSettingsService } from "./document-settings.service";

@Module({
  imports: [AuditLogModule],
  controllers: [DocumentSettingsController],
  providers: [DocumentSettingsService],
  exports: [DocumentSettingsService],
})
export class DocumentSettingsModule {}
