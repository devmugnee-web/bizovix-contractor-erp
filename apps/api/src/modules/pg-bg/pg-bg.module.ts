import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { PrismaModule } from "../prisma/prisma.module";
import { PgBgController } from "./pg-bg.controller";
import { PgBgService } from "./pg-bg.service";

@Module({ imports: [PrismaModule, AuditLogModule], controllers: [PgBgController], providers: [PgBgService] })
export class PgBgModule {}
