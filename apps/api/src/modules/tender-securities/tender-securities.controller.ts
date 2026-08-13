import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { CreateTenderSecurityDto } from "./dto/create-tender-security.dto";
import { MarkTenderSecurityNotRequiredDto } from "./dto/mark-not-required.dto";
import { QueryPendingTenderSecurityDto } from "./dto/query-pending-tender-security.dto";
import { TenderSecuritiesService } from "./tender-securities.service";

@Controller("tender-securities")
export class TenderSecuritiesController {
  constructor(private readonly tenderSecuritiesService: TenderSecuritiesService) {}

  @Get("pending")
  @RequirePermissions("tender_security.read")
  pending(@Query() query: QueryPendingTenderSecurityDto, @CurrentUser() user: AuthUser) {
    return this.tenderSecuritiesService.pending(user.organizationId, query);
  }

  @Post()
  @RequirePermissions("tender_security.create")
  @ResponseMessage("Tender security created successfully")
  create(@Body() dto: CreateTenderSecurityDto, @CurrentUser() user: AuthUser) {
    return this.tenderSecuritiesService.create(user.organizationId, user.id, dto);
  }

  @Post("mark-not-required")
  @RequirePermissions("tender_security.mark_not_required")
  @ResponseMessage("Tender security marked as not required")
  markNotRequired(@Body() dto: MarkTenderSecurityNotRequiredDto, @CurrentUser() user: AuthUser) {
    return this.tenderSecuritiesService.markNotRequired(user.organizationId, user.id, dto.documentPurchaseIds);
  }
}
