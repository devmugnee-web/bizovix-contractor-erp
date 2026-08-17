import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { CreateTenderDto } from "./dto/create-tender.dto";
import { UpdateTenderDto } from "./dto/update-tender.dto";
import { QueryTenderDto } from "./dto/query-tender.dto";
import { SubmitTenderDto } from "./dto/submit-tender.dto";
import { RecordTenderOpeningDto } from "./dto/record-tender-opening.dto";
import { TendersService } from "./tenders.service";

@Controller("tenders")
export class TendersController {
  constructor(private readonly tendersService: TendersService) {}

  @Get()
  @RequirePermissions("tender.read")
  findAll(@Query() query: QueryTenderDto, @CurrentUser() user: AuthUser) {
    return this.tendersService.findAll(user.organizationId, query);
  }

  @Get("stats")
  @RequirePermissions("tender.read")
  stats(@CurrentUser() user: AuthUser) {
    return this.tendersService.stats(user.organizationId);
  }

  @Get("categories")
  @RequirePermissions("tender.read")
  categories(@CurrentUser() user: AuthUser) {
    return this.tendersService.categories(user.organizationId);
  }

  @Get(":id")
  @RequirePermissions("tender.read")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.tendersService.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions("tender.create")
  @ResponseMessage("Tender created successfully")
  create(@Body() dto: CreateTenderDto, @CurrentUser() user: AuthUser) {
    return this.tendersService.create(user.organizationId, user.id, dto);
  }

  @Patch(":id")
  @RequirePermissions("tender.update")
  @ResponseMessage("Tender updated successfully")
  update(@Param("id") id: string, @Body() dto: UpdateTenderDto, @CurrentUser() user: AuthUser) {
    return this.tendersService.update(user.organizationId, user.id, id, dto);
  }

  @Post(":id/submit")
  @RequirePermissions("tender.submit")
  @ResponseMessage("Tender submission recorded successfully")
  submit(@Param("id") id: string, @Body() dto: SubmitTenderDto, @CurrentUser() user: AuthUser) {
    return this.tendersService.submit(user.organizationId, user.id, id, dto);
  }

  @Post(":id/opening")
  @RequirePermissions("tender.result.manage")
  @ResponseMessage("Tender opening result recorded successfully")
  recordOpening(@Param("id") id: string, @Body() dto: RecordTenderOpeningDto, @CurrentUser() user: AuthUser) {
    return this.tendersService.recordOpening(user.organizationId, user.id, id, dto);
  }
}
