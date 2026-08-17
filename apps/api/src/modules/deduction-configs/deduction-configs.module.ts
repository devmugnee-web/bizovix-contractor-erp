import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { DeductionConfigsController } from "./deduction-configs.controller";
import { DeductionConfigsService } from "./deduction-configs.service";

@Module({
  imports: [AuditLogModule],
  controllers: [DeductionConfigsController],
  providers: [DeductionConfigsService],
  exports: [DeductionConfigsService],
})
export class DeductionConfigsModule {}
