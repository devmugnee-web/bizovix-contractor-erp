import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { CashBankService } from "./cash-bank.service";
import { CreateBankAccountDto, CreateCashTransactionDto, CreateChequeDto, CreatePettyExpenseDto, CreateReconciliationDto, CreateTransferDto, QueryLedgerDto, UpdateChequeStatusDto } from "./dto/cash-bank.dto";

@Controller("cash-bank")
export class CashBankController {
  constructor(private readonly service: CashBankService) {}
  @Get("summary") @RequirePermissions("cash_bank.read") summary(@CurrentUser() u: AuthUser) { return this.service.summary(u.organizationId); }
  @Get("accounts") @RequirePermissions("bank_account.read") accounts(@CurrentUser() u: AuthUser) { return this.service.accounts(u.organizationId); }
  @Post("accounts") @RequirePermissions("bank_account.create") @ResponseMessage("Bank account saved successfully") createAccount(@Body() dto: CreateBankAccountDto, @CurrentUser() u: AuthUser) { return this.service.createBankAccount(u.organizationId, u.id, dto); }
  @Patch("accounts/:id") @RequirePermissions("bank_account.update") updateAccount(@Param("id") id: string, @Body() dto: Partial<CreateBankAccountDto>, @CurrentUser() u: AuthUser) { return this.service.updateBankAccount(u.organizationId, u.id, id, dto); }
  @Get("main-cash") @RequirePermissions("cash_bank.read") mainCash(@Query() q: QueryLedgerDto, @CurrentUser() u: AuthUser) { return this.service.cashTransactions(u.organizationId, "Main Cash", q); }
  @Post("main-cash") @RequirePermissions("cash_bank.create") @ResponseMessage("Cash transaction saved successfully") addMainCash(@Body() dto: CreateCashTransactionDto, @CurrentUser() u: AuthUser) { return this.service.createMainCash(u.organizationId, u.id, dto); }
  @Get("petty-cash") @RequirePermissions("cash_bank.read") pettyCash(@Query() q: QueryLedgerDto, @CurrentUser() u: AuthUser) { return this.service.cashTransactions(u.organizationId, "Petty Cash", q); }
  @Post("petty-cash/expenses") @RequirePermissions("cash_bank.create") addPetty(@Body() dto: CreatePettyExpenseDto, @CurrentUser() u: AuthUser) { return this.service.createPettyExpense(u.organizationId, u.id, dto); }
  @Post("petty-cash/replenishments") @RequirePermissions("cash_bank.create") replenish(@Body() dto: Omit<CreateTransferDto, "toAccountId">, @CurrentUser() u: AuthUser) { return this.service.replenish(u.organizationId, u.id, dto); }
  @Get("transfers") @RequirePermissions("bank_transfer.read") transfers(@Query() q: QueryLedgerDto, @CurrentUser() u: AuthUser) { return this.service.transfers(u.organizationId, q); }
  @Post("transfers") @RequirePermissions("bank_transfer.create") @ResponseMessage("Transfer completed successfully") transfer(@Body() dto: CreateTransferDto, @CurrentUser() u: AuthUser) { return this.service.transfer(u.organizationId, u.id, dto); }
  @Get("transactions") @RequirePermissions("financial_transaction.read") ledger(@Query() q: QueryLedgerDto, @CurrentUser() u: AuthUser) { return this.service.ledger(u.organizationId, q); }
  @Get("reconciliations") @RequirePermissions("bank_reconciliation.read") reconciliations(@CurrentUser() u: AuthUser) { return this.service.reconciliations(u.organizationId); }
  @Post("reconciliations") @RequirePermissions("bank_reconciliation.manage") reconcile(@Body() dto: CreateReconciliationDto, @CurrentUser() u: AuthUser) { return this.service.reconcile(u.organizationId, u.id, dto); }
  @Get("cheques") @RequirePermissions("cheque.read") cheques(@CurrentUser() u: AuthUser) { return this.service.cheques(u.organizationId); }
  @Post("cheques") @RequirePermissions("cheque.create") createCheque(@Body() dto: CreateChequeDto, @CurrentUser() u: AuthUser) { return this.service.createCheque(u.organizationId, u.id, dto); }
  @Patch("cheques/:id/status") @RequirePermissions("cheque.update") chequeStatus(@Param("id") id: string, @Body() dto: UpdateChequeStatusDto, @CurrentUser() u: AuthUser) { return this.service.chequeStatus(u.organizationId, u.id, id, dto); }
}
