import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ReceiptsController } from "./receipts.controller";
import { ReceiptsService } from "./receipts.service";
import { CashBankModule } from "../cash-bank/cash-bank.module";
import { AccountingModule } from "../accounting/accounting.module";
@Module({ imports: [PrismaModule, AuditLogModule, CashBankModule, AccountingModule], controllers: [ReceiptsController], providers: [ReceiptsService] })
export class ReceiptsModule {}
