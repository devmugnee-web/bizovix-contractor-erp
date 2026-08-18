import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { NumberingModule } from "../settings-numbering/numbering.module";
import { GrnController } from "./grn.controller";
import { GrnService } from "./grn.service";

@Module({
  imports: [AuditLogModule, NumberingModule],
  controllers: [GrnController],
  providers: [GrnService],
  exports: [GrnService],
})
export class GrnModule {}
