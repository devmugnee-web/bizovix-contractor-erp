import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { NumberingModule } from "../settings-numbering/numbering.module";
import { TimeExtensionsController } from "./time-extensions.controller";
import { TimeExtensionsService } from "./time-extensions.service";

@Module({
  imports: [AuditLogModule, NumberingModule],
  controllers: [TimeExtensionsController],
  providers: [TimeExtensionsService],
  exports: [TimeExtensionsService],
})
export class TimeExtensionsModule {}
