import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { SupplierQuotationsController } from "./supplier-quotations.controller";
import { SupplierQuotationsService } from "./supplier-quotations.service";

@Module({
  imports: [AuditLogModule],
  controllers: [SupplierQuotationsController],
  providers: [SupplierQuotationsService],
  exports: [SupplierQuotationsService],
})
export class SupplierQuotationsModule {}
