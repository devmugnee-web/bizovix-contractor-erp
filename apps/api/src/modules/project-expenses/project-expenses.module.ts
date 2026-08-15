import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ProjectExpensesController } from "./project-expenses.controller";
import { ProjectExpensesService } from "./project-expenses.service";
import { CashBankModule } from "../cash-bank/cash-bank.module";
import { AccountingModule } from "../accounting/accounting.module";

@Module({ imports: [PrismaModule, AuditLogModule, CashBankModule, AccountingModule], controllers: [ProjectExpensesController], providers: [ProjectExpensesService] })
export class ProjectExpensesModule {}
