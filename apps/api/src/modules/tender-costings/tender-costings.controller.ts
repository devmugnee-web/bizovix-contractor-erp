import { Body, Controller, Get, Param, Patch, Put, Query } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import {
  QueryTenderCostingDto,
  SaveTenderCostingDto,
  SetTenderCostingBudgetDto,
} from "./dto/tender-costing.dto";
import { TenderCostingsService } from "./tender-costings.service";

@Controller("tender-costings")
export class TenderCostingsController {
  constructor(private readonly service: TenderCostingsService) {}

  @Get()
  @RequirePermissions("tender.costing.read")
  findAll(@Query() query: QueryTenderCostingDto, @CurrentUser() user: AuthUser) {
    return this.service.findAll(user.organizationId, query);
  }

  @Get("stats")
  @RequirePermissions("tender.costing.read")
  stats(@CurrentUser() user: AuthUser) {
    return this.service.stats(user.organizationId);
  }

  @Get(":id")
  @RequirePermissions("tender.costing.read")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.findOne(user.organizationId, id);
  }

  @Patch(":id/budget")
  @RequirePermissions("tender.costing.update")
  @ResponseMessage("Tender costing budget saved successfully")
  setBudget(
    @Param("id") id: string,
    @Body() dto: SetTenderCostingBudgetDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.setBudget(user.organizationId, user.id, id, dto);
  }

  @Put(":id")
  @RequirePermissions("tender.costing.update")
  @ResponseMessage("Tender costing saved successfully")
  save(
    @Param("id") id: string,
    @Body() dto: SaveTenderCostingDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.save(user.organizationId, user.id, id, dto);
  }
}
