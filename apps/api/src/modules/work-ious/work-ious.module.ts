import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { NumberingModule } from "../settings-numbering/numbering.module";
import { WorkIousController } from "./work-ious.controller";
import { WorkIousService } from "./work-ious.service";

@Module({
  imports: [AuditLogModule, NumberingModule],
  controllers: [WorkIousController],
  providers: [WorkIousService],
  exports: [WorkIousService],
})
export class WorkIousModule {}

