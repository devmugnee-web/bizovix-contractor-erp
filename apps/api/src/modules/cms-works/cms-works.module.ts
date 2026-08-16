import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { PrismaModule } from "../prisma/prisma.module";
import { BillingModule } from "../billing/billing.module";
import { CmsWorksController } from "./cms-works.controller";
import { CmsWorksService } from "./cms-works.service";

@Module({ imports: [PrismaModule, AuditLogModule, BillingModule], controllers: [CmsWorksController], providers: [CmsWorksService] })
export class CmsWorksModule {}
