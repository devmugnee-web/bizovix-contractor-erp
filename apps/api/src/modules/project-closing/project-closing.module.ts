import { Module } from "@nestjs/common";
import { AccountingModule } from "../accounting/accounting.module";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { NumberingModule } from "../settings-numbering/numbering.module";
import { ProjectClosingController } from "./project-closing.controller";
import { ProjectClosingService } from "./project-closing.service";
import { WorkCompletionCertificatesController } from "./work-completion-certificates.controller";
import { WorkCompletionCertificatesService } from "./work-completion-certificates.service";

@Module({
  imports: [AccountingModule, AuditLogModule, NumberingModule],
  controllers: [ProjectClosingController, WorkCompletionCertificatesController],
  providers: [ProjectClosingService, WorkCompletionCertificatesService],
  exports: [ProjectClosingService, WorkCompletionCertificatesService],
})
export class ProjectClosingModule {}
