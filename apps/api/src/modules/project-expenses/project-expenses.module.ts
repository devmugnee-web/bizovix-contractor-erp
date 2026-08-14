import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ProjectExpensesController } from "./project-expenses.controller";
import { ProjectExpensesService } from "./project-expenses.service";

@Module({ imports: [PrismaModule, AuditLogModule], controllers: [ProjectExpensesController], providers: [ProjectExpensesService] })
export class ProjectExpensesModule {}
