import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { NumberingModule } from "../settings-numbering/numbering.module";
import { VariationOrdersController } from "./variation-orders.controller";
import { VariationOrdersService } from "./variation-orders.service";

@Module({
  imports: [AuditLogModule, NumberingModule],
  controllers: [VariationOrdersController],
  providers: [VariationOrdersService],
  exports: [VariationOrdersService],
})
export class VariationOrdersModule {}
