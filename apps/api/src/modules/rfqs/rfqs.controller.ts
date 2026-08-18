import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { RfqsService } from "./rfqs.service";
import { SaveRfqDto } from "./dto/save-rfq.dto";
import { QueryRfqDto } from "./dto/query-rfq.dto";

@Controller("rfqs")
export class RfqsController {
  constructor(private readonly rfqsService: RfqsService) {}

  @Get()
  @RequirePermissions("procurement.read")
  findAll(@Query() query: QueryRfqDto, @CurrentUser() user: AuthUser) {
    return this.rfqsService.findAll(user.organizationId, query);
  }

  @Get("stats")
  @RequirePermissions("procurement.read")
  stats(@CurrentUser() user: AuthUser) {
    return this.rfqsService.stats(user.organizationId);
  }

  @Get(":id")
  @RequirePermissions("procurement.read")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.rfqsService.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions("rfq.create")
  @ResponseMessage("RFQ created successfully")
  create(@Body() dto: SaveRfqDto, @CurrentUser() user: AuthUser) {
    return this.rfqsService.create(user.organizationId, user.id, dto);
  }

  @Patch(":id")
  @RequirePermissions("rfq.update")
  @ResponseMessage("RFQ updated successfully")
  update(@Param("id") id: string, @Body() dto: SaveRfqDto, @CurrentUser() user: AuthUser) {
    return this.rfqsService.update(user.organizationId, user.id, id, dto);
  }

  @Post(":id/issue")
  @RequirePermissions("rfq.issue")
  @ResponseMessage("RFQ issued successfully")
  issue(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.rfqsService.issue(user.organizationId, user.id, id);
  }

  @Post(":id/close")
  @RequirePermissions("rfq.update")
  @ResponseMessage("RFQ closed successfully")
  close(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.rfqsService.close(user.organizationId, user.id, id);
  }

  @Post(":id/cancel")
  @RequirePermissions("rfq.update")
  @ResponseMessage("RFQ cancelled successfully")
  cancel(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.rfqsService.cancel(user.organizationId, user.id, id);
  }
}
