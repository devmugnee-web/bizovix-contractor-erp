import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { PrismaModule } from "../prisma/prisma.module";
import { CmsWorksController } from "./cms-works.controller";
import { CmsWorksService } from "./cms-works.service";

@Module({ imports: [PrismaModule, AuditLogModule], controllers: [CmsWorksController], providers: [CmsWorksService] })
export class CmsWorksModule {}
