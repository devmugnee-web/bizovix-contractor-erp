import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { TendersController } from "./tenders.controller";
import { TendersService } from "./tenders.service";

@Module({
  imports: [AuditLogModule],
  controllers: [TendersController],
  providers: [TendersService],
  exports: [TendersService],
})
export class TendersModule {}
