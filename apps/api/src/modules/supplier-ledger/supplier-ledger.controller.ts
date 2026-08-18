import { Controller, Get, Query } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { SupplierLedgerService } from "./supplier-ledger.service";
import { QuerySupplierLedgerDto } from "./dto/query-supplier-ledger.dto";
import { QueryApAgingDto } from "./dto/query-ap-aging.dto";

@Controller("supplier-ledger")
export class SupplierLedgerController {
  constructor(private readonly supplierLedgerService: SupplierLedgerService) {}

  @Get()
  @RequirePermissions("supplier_ledger.read")
  ledger(@Query() query: QuerySupplierLedgerDto, @CurrentUser() user: AuthUser) {
    return this.supplierLedgerService.ledger(user.organizationId, query);
  }

  @Get("aging")
  @RequirePermissions("supplier_ledger.read")
  aging(@Query() query: QueryApAgingDto, @CurrentUser() user: AuthUser) {
    return this.supplierLedgerService.aging(user.organizationId, query);
  }

  @Get("reconciliation")
  @RequirePermissions("supplier_ledger.read")
  reconciliation(@CurrentUser() user: AuthUser) {
    return this.supplierLedgerService.reconciliation(user.organizationId);
  }
}
