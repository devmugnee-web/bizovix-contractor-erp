import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { TenderCostingsController } from "./tender-costings.controller";
import { TenderCostingsService } from "./tender-costings.service";

@Module({
  imports: [AuditLogModule],
  controllers: [TenderCostingsController],
  providers: [TenderCostingsService],
  exports: [TenderCostingsService],
})
export class TenderCostingsModule {}
