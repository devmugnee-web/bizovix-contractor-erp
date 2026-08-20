import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { QueryReceiptDto } from "./dto/query-receipt.dto";
import { SaveReceiptDto } from "./dto/save-receipt.dto";
import { UpdateReceiptDto } from "./dto/update-receipt.dto";
import { ReceiptsService } from "./receipts.service";

@Controller("receipts")
export class ReceiptsController {
  constructor(private readonly service: ReceiptsService) {}
  @Get() @RequirePermissions("receipt.read") findAll(@Query() query: QueryReceiptDto, @CurrentUser() user: AuthUser) { return this.service.findAll(user.organizationId, query); }
  @Get("summary") @RequirePermissions("receipt.read") summary(@CurrentUser() user: AuthUser) { return this.service.summary(user.organizationId); }
  @Get("eligible-bills/:workId") @RequirePermissions("receipt.read") getEligibleBills(@Param("workId") workId: string, @CurrentUser() user: AuthUser) { return this.service.getEligibleBills(user.organizationId, workId); }
  @Get(":id") @RequirePermissions("receipt.read") findOne(@Param("id") id: string, @CurrentUser() user: AuthUser) { return this.service.findOne(user.organizationId, id); }
  @Get(":id/voucher") @RequirePermissions("receipt.read") voucher(@Param("id") id: string, @CurrentUser() user: AuthUser) { return this.service.findOne(user.organizationId, id); }
  @Post() @RequirePermissions("receipt.create") @ResponseMessage("Receipt saved successfully") create(@Body() dto: SaveReceiptDto, @CurrentUser() user: AuthUser) { return this.service.create(user.organizationId, user.id, dto); }
  @Patch(":id") @RequirePermissions("receipt.create") @ResponseMessage("Receipt updated successfully") update(@Param("id") id: string, @Body() dto: UpdateReceiptDto, @CurrentUser() user: AuthUser) { return this.service.update(user.organizationId, user.id, id, dto); }
  @Delete(":id") @RequirePermissions("receipt.create") @ResponseMessage("Receipt cancelled successfully") cancel(@Param("id") id: string, @CurrentUser() user: AuthUser) { return this.service.cancel(user.organizationId, user.id, id); }
}
