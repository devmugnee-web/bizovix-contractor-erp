import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { PrismaModule } from "../prisma/prisma.module";
import { TenderSecuritiesController } from "./tender-securities.controller";
import { TenderSecuritiesService } from "./tender-securities.service";

@Module({
  imports: [PrismaModule, AuditLogModule],
  controllers: [TenderSecuritiesController],
  providers: [TenderSecuritiesService],
})
export class TenderSecuritiesModule {}
