import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { NumberingModule } from "../settings-numbering/numbering.module";
import { RfqsModule } from "../rfqs/rfqs.module";
import { ComparativeStatementsController } from "./comparative-statements.controller";
import { ComparativeStatementsService } from "./comparative-statements.service";

@Module({
  imports: [AuditLogModule, NumberingModule, RfqsModule],
  controllers: [ComparativeStatementsController],
  providers: [ComparativeStatementsService],
  exports: [ComparativeStatementsService],
})
export class ComparativeStatementsModule {}
