import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { ContractsController } from "./contracts.controller";
import { ContractsService } from "./contracts.service";

@Module({
  imports: [AuditLogModule],
  controllers: [ContractsController],
  providers: [ContractsService],
  exports: [ContractsService],
})
export class ContractsModule {}
