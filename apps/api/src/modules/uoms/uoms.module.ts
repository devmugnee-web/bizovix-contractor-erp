import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { UomsController } from "./uoms.controller";
import { UomsService } from "./uoms.service";

@Module({
  imports: [AuditLogModule],
  controllers: [UomsController],
  providers: [UomsService],
  exports: [UomsService],
})
export class UomsModule {}
