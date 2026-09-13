import { Module } from "@nestjs/common";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";
import { AuditLogModule } from "../audit-logs/audit-log.module";

@Module({
  imports: [AuditLogModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
