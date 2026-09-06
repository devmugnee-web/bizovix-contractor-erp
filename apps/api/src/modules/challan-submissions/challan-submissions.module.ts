import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { NumberingModule } from "../settings-numbering/numbering.module";
import { ChallanSubmissionsController } from "./challan-submissions.controller";
import { ChallanSubmissionsService } from "./challan-submissions.service";
import { ChallanPdfService } from "./challan-pdf.service";
import { TenderChallanController } from "./tender-challan.controller";
import { TenderChallanService } from "./tender-challan.service";

@Module({
  imports: [AuditLogModule, NumberingModule],
  controllers: [TenderChallanController, ChallanSubmissionsController],
  providers: [
    ChallanSubmissionsService,
    ChallanPdfService,
    TenderChallanService,
  ],
  exports: [ChallanSubmissionsService],
})
export class ChallanSubmissionsModule {}
