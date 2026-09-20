import { Injectable } from "@nestjs/common";
import { CashBankService } from "../cash-bank/cash-bank.service";

@Injectable()
export class BankAccountsService {
  constructor(private readonly cashBank: CashBankService) {}

  findAll(organizationId: string) {
    return this.cashBank.accounts(organizationId);
  }
}
