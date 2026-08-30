import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { NumberingModule } from "../settings-numbering/numbering.module";
import { SalesQuotationsController } from "./sales-quotations.controller";
import { SalesQuotationsService } from "./sales-quotations.service";

@Module({
  imports: [AuditLogModule, NumberingModule],
  controllers: [SalesQuotationsController],
  providers: [SalesQuotationsService],
  exports: [SalesQuotationsService],
})
export class SalesQuotationsModule {}
