import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { NumberingModule } from "../settings-numbering/numbering.module";
import { ChallanSubmissionsController } from "./challan-submissions.controller";
import { ChallanSubmissionsService } from "./challan-submissions.service";

@Module({
  imports: [AuditLogModule, NumberingModule],
  controllers: [ChallanSubmissionsController],
  providers: [ChallanSubmissionsService],
  exports: [ChallanSubmissionsService],
})
export class ChallanSubmissionsModule {}
