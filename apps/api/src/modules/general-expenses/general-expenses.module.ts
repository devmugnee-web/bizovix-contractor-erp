import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { PrismaModule } from "../prisma/prisma.module";
import { GeneralExpensesController } from "./general-expenses.controller";
import { GeneralExpensesService } from "./general-expenses.service";
import { CashBankModule } from "../cash-bank/cash-bank.module";
import { AccountingModule } from "../accounting/accounting.module";

@Module({ imports: [PrismaModule, AuditLogModule, CashBankModule, AccountingModule], controllers: [GeneralExpensesController], providers: [GeneralExpensesService] })
export class GeneralExpensesModule {}
