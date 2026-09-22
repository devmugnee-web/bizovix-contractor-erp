import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { AccountingModule } from "../accounting/accounting.module";
import { CashBankModule } from "../cash-bank/cash-bank.module";
import { DocumentPurchasesController } from "./document-purchases.controller";
import { DocumentPurchasesService } from "./document-purchases.service";

@Module({
  imports: [AuditLogModule, AccountingModule, CashBankModule],
  controllers: [DocumentPurchasesController],
  providers: [DocumentPurchasesService],
})
export class DocumentPurchasesModule {}
