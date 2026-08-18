import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { SupplierBillsService } from "./supplier-bills.service";
import { SaveSupplierBillDto } from "./dto/save-supplier-bill.dto";
import { QuerySupplierBillDto } from "./dto/query-supplier-bill.dto";
import { RejectSupplierBillDto } from "./dto/reject-supplier-bill.dto";

@Controller("supplier-bills")
export class SupplierBillsController {
  constructor(private readonly supplierBillsService: SupplierBillsService) {}

  @Get()
  @RequirePermissions("supplier_bill.read")
  findAll(@Query() query: QuerySupplierBillDto, @CurrentUser() user: AuthUser) {
    return this.supplierBillsService.findAll(user.organizationId, query);
  }

  @Get("stats")
  @RequirePermissions("supplier_bill.read")
  stats(@CurrentUser() user: AuthUser) {
    return this.supplierBillsService.stats(user.organizationId);
  }

  @Get("billable-lines/:purchaseOrderId")
  @RequirePermissions("supplier_bill.read")
  billableLines(@Param("purchaseOrderId") purchaseOrderId: string, @CurrentUser() user: AuthUser) {
    return this.supplierBillsService.billableLines(user.organizationId, purchaseOrderId);
  }

  @Get(":id")
  @RequirePermissions("supplier_bill.read")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.supplierBillsService.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions("supplier_bill.create")
  @ResponseMessage("Supplier Bill created successfully")
  create(@Body() dto: SaveSupplierBillDto, @CurrentUser() user: AuthUser) {
    return this.supplierBillsService.create(user.organizationId, user.id, dto);
  }

  @Patch(":id")
  @RequirePermissions("supplier_bill.update")
  @ResponseMessage("Supplier Bill updated successfully")
  update(@Param("id") id: string, @Body() dto: SaveSupplierBillDto, @CurrentUser() user: AuthUser) {
    return this.supplierBillsService.update(user.organizationId, user.id, id, dto);
  }

  @Post(":id/submit")
  @RequirePermissions("supplier_bill.submit")
  @ResponseMessage("Supplier Bill submitted for approval")
  submit(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.supplierBillsService.submit(user.organizationId, user.id, id);
  }

  @Post(":id/approve")
  @RequirePermissions("supplier_bill.approve")
  @ResponseMessage("Supplier Bill approved successfully")
  approve(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.supplierBillsService.approve(user.organizationId, user.id, id);
  }

  @Post(":id/reject")
  @RequirePermissions("supplier_bill.approve")
  @ResponseMessage("Supplier Bill rejected")
  reject(@Param("id") id: string, @Body() dto: RejectSupplierBillDto, @CurrentUser() user: AuthUser) {
    return this.supplierBillsService.reject(user.organizationId, user.id, id, dto);
  }

  @Post(":id/cancel")
  @RequirePermissions("supplier_bill.cancel")
  @ResponseMessage("Supplier Bill cancelled")
  cancel(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.supplierBillsService.cancel(user.organizationId, user.id, id);
  }
}
