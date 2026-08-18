import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { NumberingModule } from "../settings-numbering/numbering.module";
import { PurchaseRequisitionsModule } from "../purchase-requisitions/purchase-requisitions.module";
import { RfqsController } from "./rfqs.controller";
import { RfqsService } from "./rfqs.service";

@Module({
  imports: [AuditLogModule, NumberingModule, PurchaseRequisitionsModule],
  controllers: [RfqsController],
  providers: [RfqsService],
  exports: [RfqsService],
})
export class RfqsModule {}
