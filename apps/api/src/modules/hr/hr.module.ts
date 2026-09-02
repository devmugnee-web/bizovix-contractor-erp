import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { NumberingModule } from "../settings-numbering/numbering.module";
import { HrController } from "./hr.controller";
import { HrService } from "./hr.service";

@Module({ imports: [AuditLogModule, NumberingModule], controllers: [HrController], providers: [HrService] })
export class HrModule {}
