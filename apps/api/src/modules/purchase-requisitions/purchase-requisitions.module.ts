import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { NumberingModule } from "../settings-numbering/numbering.module";
import { PurchaseRequisitionsController } from "./purchase-requisitions.controller";
import { PurchaseRequisitionsService } from "./purchase-requisitions.service";

@Module({
  imports: [AuditLogModule, NumberingModule],
  controllers: [PurchaseRequisitionsController],
  providers: [PurchaseRequisitionsService],
  exports: [PurchaseRequisitionsService],
})
export class PurchaseRequisitionsModule {}
