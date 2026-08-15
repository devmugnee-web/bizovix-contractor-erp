import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ProjectExpensesController } from "./project-expenses.controller";
import { ProjectExpensesService } from "./project-expenses.service";
import { CashBankModule } from "../cash-bank/cash-bank.module";

@Module({ imports: [PrismaModule, AuditLogModule, CashBankModule], controllers: [ProjectExpensesController], providers: [ProjectExpensesService] })
export class ProjectExpensesModule {}
