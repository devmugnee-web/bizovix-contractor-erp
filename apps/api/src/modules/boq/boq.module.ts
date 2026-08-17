import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { BoqController } from "./boq.controller";
import { BoqService } from "./boq.service";

@Module({
  imports: [AuditLogModule],
  controllers: [BoqController],
  providers: [BoqService],
  exports: [BoqService],
})
export class BoqModule {}
