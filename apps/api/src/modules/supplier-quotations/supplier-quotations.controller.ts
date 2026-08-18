import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { SupplierQuotationsService } from "./supplier-quotations.service";
import { SaveSupplierQuotationDto } from "./dto/save-supplier-quotation.dto";
import { QuerySupplierQuotationDto } from "./dto/query-supplier-quotation.dto";

@Controller("supplier-quotations")
export class SupplierQuotationsController {
  constructor(private readonly supplierQuotationsService: SupplierQuotationsService) {}

  @Get()
  @RequirePermissions("procurement.read")
  findAll(@Query() query: QuerySupplierQuotationDto, @CurrentUser() user: AuthUser) {
    return this.supplierQuotationsService.findAll(user.organizationId, query);
  }

  @Get(":id")
  @RequirePermissions("procurement.read")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.supplierQuotationsService.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions("quotation.create")
  @ResponseMessage("Supplier Quotation recorded successfully")
  create(@Body() dto: SaveSupplierQuotationDto, @CurrentUser() user: AuthUser) {
    return this.supplierQuotationsService.create(user.organizationId, user.id, dto);
  }

  @Post(":id/revise")
  @RequirePermissions("quotation.update")
  @ResponseMessage("Supplier Quotation revised successfully")
  revise(@Param("id") id: string, @Body() dto: SaveSupplierQuotationDto, @CurrentUser() user: AuthUser) {
    return this.supplierQuotationsService.revise(user.organizationId, user.id, id, dto);
  }

  @Post(":id/withdraw")
  @RequirePermissions("quotation.update")
  @ResponseMessage("Supplier Quotation withdrawn successfully")
  withdraw(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.supplierQuotationsService.withdraw(user.organizationId, user.id, id);
  }
}
