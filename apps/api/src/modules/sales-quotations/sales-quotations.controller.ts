import { Body, Controller, Get, Param, Patch, Post, Put, Query } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import {
  CreateSalesQuotationDto,
  CreateSalesQuotationFollowUpDto,
  QuerySalesQuotationDto,
  RecordSalesQuotationResultDto,
  SaveSalesQuotationCostingDto,
  UpdateSalesQuotationDto,
  VersionedSalesQuotationActionDto,
} from "./dto/sales-quotation.dto";
import { SalesQuotationsService } from "./sales-quotations.service";

@Controller("sales-quotations")
export class SalesQuotationsController {
  constructor(private readonly service: SalesQuotationsService) {}

  @Get()
  @RequirePermissions("sales_quotation.read")
  findAll(@Query() query: QuerySalesQuotationDto, @CurrentUser() user: AuthUser) {
    return this.service.findAll(user.organizationId, query);
  }
  @Get("summary")
  @RequirePermissions("sales_quotation.read")
  summary(@Query() query: QuerySalesQuotationDto, @CurrentUser() user: AuthUser) {
    return this.service.summary(user.organizationId, query);
  }
  @Get("recent")
  @RequirePermissions("sales_quotation.read")
  recent(@Query() query: QuerySalesQuotationDto, @CurrentUser() user: AuthUser) {
    return this.service.recent(user.organizationId, query);
  }
  @Get("costing-summary")
  @RequirePermissions("sales_quotation.read")
  costingSummary(@Query() query: QuerySalesQuotationDto, @CurrentUser() user: AuthUser) {
    return this.service.costingSummary(user.organizationId, query);
  }
  @Get("recent-decisions")
  @RequirePermissions("sales_quotation.read")
  recentDecisions(@Query() query: QuerySalesQuotationDto, @CurrentUser() user: AuthUser) {
    return this.service.recentDecisions(user.organizationId, query);
  }
  @Get("options")
  @RequirePermissions("sales_quotation.read")
  options(@CurrentUser() user: AuthUser) {
    return this.service.options(user.organizationId);
  }
  @Get("export")
  @RequirePermissions("sales_quotation.export")
  exportRows(@Query() query: QuerySalesQuotationDto, @CurrentUser() user: AuthUser) {
    return this.service.export(user.organizationId, user.id, query);
  }
  @Get(":id")
  @RequirePermissions("sales_quotation.read")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.findOne(user.organizationId, id);
  }
  @Post()
  @RequirePermissions("sales_quotation.create")
  @ResponseMessage("Sales quotation created successfully")
  create(@Body() dto: CreateSalesQuotationDto, @CurrentUser() user: AuthUser) {
    return this.service.create(user.organizationId, user.id, dto);
  }
  @Patch(":id")
  @RequirePermissions("sales_quotation.update")
  @ResponseMessage("Sales quotation updated successfully")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateSalesQuotationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(user.organizationId, user.id, id, dto);
  }
  @Put(":id/costing")
  @RequirePermissions("sales_quotation.update")
  @ResponseMessage("Quotation costing saved successfully")
  costing(
    @Param("id") id: string,
    @Body() dto: SaveSalesQuotationCostingDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.saveCosting(user.organizationId, user.id, id, dto);
  }
  @Post(":id/send")
  @RequirePermissions("sales_quotation.send")
  @ResponseMessage("Sales quotation sent successfully")
  send(
    @Param("id") id: string,
    @Body() dto: VersionedSalesQuotationActionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.send(user.organizationId, user.id, id, dto);
  }
  @Post(":id/result")
  @RequirePermissions("sales_quotation.result")
  @ResponseMessage("Quotation result recorded successfully")
  result(
    @Param("id") id: string,
    @Body() dto: RecordSalesQuotationResultDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.result(user.organizationId, user.id, id, dto);
  }
  @Get(":id/follow-ups")
  @RequirePermissions("sales_quotation.read")
  followUps(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.followUps(user.organizationId, id);
  }
  @Post(":id/follow-ups")
  @RequirePermissions("sales_quotation.follow_up")
  @ResponseMessage("Follow-up recorded successfully")
  addFollowUp(
    @Param("id") id: string,
    @Body() dto: CreateSalesQuotationFollowUpDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.addFollowUp(user.organizationId, user.id, id, dto);
  }
}
