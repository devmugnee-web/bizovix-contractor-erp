import { Controller, Get } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import type { BankAccount } from "@bizovix/database";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { BankAccountsService } from "./bank-accounts.service";

@Controller("bank-accounts")
export class BankAccountsController {
  constructor(private readonly bankAccountsService: BankAccountsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser): Promise<BankAccount[]> {
    return this.bankAccountsService.findAll(user.organizationId);
  }
}
