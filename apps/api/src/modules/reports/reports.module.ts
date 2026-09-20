import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";
import { CashBankModule } from "../cash-bank/cash-bank.module";
@Module({imports:[AuditLogModule, CashBankModule],controllers:[ReportsController],providers:[ReportsService]})
export class ReportsModule{}
