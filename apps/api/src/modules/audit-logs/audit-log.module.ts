import { Module } from "@nestjs/common";
import { AuditLogService } from "./audit-log.service";
import { ActivityLogsController } from "./activity-logs.controller";
import { ActivityLogsService } from "./activity-logs.service";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [ActivityLogsController],
  providers: [AuditLogService, ActivityLogsService],
  exports: [AuditLogService],
})
export class AuditLogModule {}
