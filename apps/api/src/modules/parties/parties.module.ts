import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { NumberingModule } from "../settings-numbering/numbering.module";
import { PartiesController } from "./parties.controller";
import { PartiesService } from "./parties.service";

@Module({
  imports: [AuditLogModule, NumberingModule],
  controllers: [PartiesController],
  providers: [PartiesService],
  exports: [PartiesService],
})
export class PartiesModule {}
