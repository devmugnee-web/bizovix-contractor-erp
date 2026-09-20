import { Module } from "@nestjs/common";
import { BankAccountsController } from "./bank-accounts.controller";
import { BankAccountsService } from "./bank-accounts.service";
import { CashBankModule } from "../cash-bank/cash-bank.module";

@Module({
  imports: [CashBankModule],
  controllers: [BankAccountsController],
  providers: [BankAccountsService],
  exports: [BankAccountsService],
})
export class BankAccountsModule {}
