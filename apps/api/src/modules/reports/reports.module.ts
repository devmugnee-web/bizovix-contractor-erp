import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";
@Module({imports:[AuditLogModule],controllers:[ReportsController],providers:[ReportsService]})
export class ReportsModule{}
