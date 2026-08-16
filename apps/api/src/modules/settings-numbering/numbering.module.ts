import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { NumberingController } from "./numbering.controller";
import { NumberingService } from "./numbering.service";

@Module({
  imports: [AuditLogModule],
  controllers: [NumberingController],
  providers: [NumberingService],
  exports: [NumberingService],
})
export class NumberingModule {}
