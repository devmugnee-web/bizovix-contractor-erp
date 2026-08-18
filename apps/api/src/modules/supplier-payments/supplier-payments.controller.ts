import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { SupplierPaymentsService } from "./supplier-payments.service";
import { SaveSupplierPaymentDto } from "./dto/save-supplier-payment.dto";
import { QuerySupplierPaymentDto } from "./dto/query-supplier-payment.dto";
import { CancelSupplierPaymentDto } from "./dto/cancel-supplier-payment.dto";

@Controller("supplier-payments")
export class SupplierPaymentsController {
  constructor(private readonly supplierPaymentsService: SupplierPaymentsService) {}

  @Get()
  @RequirePermissions("supplier_payment.read")
  findAll(@Query() query: QuerySupplierPaymentDto, @CurrentUser() user: AuthUser) {
    return this.supplierPaymentsService.findAll(user.organizationId, query);
  }

  @Get("stats")
  @RequirePermissions("supplier_payment.read")
  stats(@CurrentUser() user: AuthUser) {
    return this.supplierPaymentsService.stats(user.organizationId);
  }

  @Get(":id")
  @RequirePermissions("supplier_payment.read")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.supplierPaymentsService.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions("supplier_payment.create")
  @ResponseMessage("Supplier Payment recorded successfully")
  create(@Body() dto: SaveSupplierPaymentDto, @CurrentUser() user: AuthUser) {
    return this.supplierPaymentsService.create(user.organizationId, user.id, dto);
  }

  @Post(":id/cancel")
  @RequirePermissions("supplier_payment.cancel")
  @ResponseMessage("Supplier Payment cancelled and reversed")
  cancel(@Param("id") id: string, @Body() dto: CancelSupplierPaymentDto, @CurrentUser() user: AuthUser) {
    return this.supplierPaymentsService.cancel(user.organizationId, user.id, id, dto);
  }
}
