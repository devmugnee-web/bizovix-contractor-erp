import { Module } from "@nestjs/common";
import { AccountingModule } from "../accounting/accounting.module";
import { SupplierLedgerController } from "./supplier-ledger.controller";
import { SupplierLedgerService } from "./supplier-ledger.service";

@Module({
  imports: [AccountingModule],
  controllers: [SupplierLedgerController],
  providers: [SupplierLedgerService],
  exports: [SupplierLedgerService],
})
export class SupplierLedgerModule {}
