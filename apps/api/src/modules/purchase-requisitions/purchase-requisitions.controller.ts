import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { PurchaseRequisitionsService } from "./purchase-requisitions.service";
import { SavePurchaseRequisitionDto } from "./dto/save-purchase-requisition.dto";
import { QueryPurchaseRequisitionDto } from "./dto/query-purchase-requisition.dto";
import { RejectPurchaseRequisitionDto } from "./dto/reject-purchase-requisition.dto";

@Controller("purchase-requisitions")
export class PurchaseRequisitionsController {
  constructor(private readonly purchaseRequisitionsService: PurchaseRequisitionsService) {}

  @Get()
  @RequirePermissions("procurement.read")
  findAll(@Query() query: QueryPurchaseRequisitionDto, @CurrentUser() user: AuthUser) {
    return this.purchaseRequisitionsService.findAll(user.organizationId, query);
  }

  @Get("stats")
  @RequirePermissions("procurement.read")
  stats(@CurrentUser() user: AuthUser) {
    return this.purchaseRequisitionsService.stats(user.organizationId);
  }

  @Get(":id")
  @RequirePermissions("procurement.read")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.purchaseRequisitionsService.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions("pr.create")
  @ResponseMessage("Purchase Requisition created successfully")
  create(@Body() dto: SavePurchaseRequisitionDto, @CurrentUser() user: AuthUser) {
    return this.purchaseRequisitionsService.create(user.organizationId, user.id, dto);
  }

  @Patch(":id")
  @RequirePermissions("pr.update")
  @ResponseMessage("Purchase Requisition updated successfully")
  update(@Param("id") id: string, @Body() dto: SavePurchaseRequisitionDto, @CurrentUser() user: AuthUser) {
    return this.purchaseRequisitionsService.update(user.organizationId, user.id, id, dto);
  }

  @Post(":id/submit")
  @RequirePermissions("pr.submit")
  @ResponseMessage("Purchase Requisition submitted successfully")
  submit(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.purchaseRequisitionsService.submit(user.organizationId, user.id, id);
  }

  @Post(":id/approve")
  @RequirePermissions("pr.approve")
  @ResponseMessage("Purchase Requisition approved successfully")
  approve(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.purchaseRequisitionsService.approve(user.organizationId, user.id, id);
  }

  @Post(":id/reject")
  @RequirePermissions("pr.approve")
  @ResponseMessage("Purchase Requisition rejected successfully")
  reject(@Param("id") id: string, @Body() dto: RejectPurchaseRequisitionDto, @CurrentUser() user: AuthUser) {
    return this.purchaseRequisitionsService.reject(user.organizationId, user.id, id, dto);
  }

  @Post(":id/cancel")
  @RequirePermissions("pr.update")
  @ResponseMessage("Purchase Requisition cancelled successfully")
  cancel(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.purchaseRequisitionsService.cancel(user.organizationId, user.id, id);
  }
}
