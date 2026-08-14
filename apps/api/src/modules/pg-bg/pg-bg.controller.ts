import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { QueryOrganizationContactsDto, QueryPgBgDto } from "./dto/query-pg-bg.dto";
import { AcceptNoaDto, FinalizePgBgDto, SavePgBgWorkflowDto } from "./dto/save-pg-bg-workflow.dto";
import { PgBgService } from "./pg-bg.service";

@Controller("pg-bg")
export class PgBgController {
  constructor(private readonly pgBgService: PgBgService) {}

  @Get("eligible-tenders") @RequirePermissions("pg_bg.read")
  eligible(@Query() query: QueryPgBgDto, @CurrentUser() user: AuthUser) { return this.pgBgService.eligibleTenders(user.organizationId, query); }

  @Get("work-categories") @RequirePermissions("pg_bg.read")
  categories(@CurrentUser() user: AuthUser) { return this.pgBgService.workCategories(user.organizationId); }

  @Get("organization-contacts") @RequirePermissions("pg_bg.read")
  contacts(@Query() query: QueryOrganizationContactsDto, @CurrentUser() user: AuthUser) { return this.pgBgService.organizationContacts(user.organizationId, query.organizationMasterId); }

  @Get("workflows/by-document/:documentPurchaseId") @RequirePermissions("pg_bg.read")
  byDocument(@Param("documentPurchaseId") id: string, @CurrentUser() user: AuthUser) { return this.pgBgService.findByDocumentPurchase(user.organizationId, id); }

  @Get("workflows/:id") @RequirePermissions("pg_bg.read")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthUser) { return this.pgBgService.findOne(user.organizationId, id); }

  @Post("workflows") @RequirePermissions("pg_bg.save_draft") @ResponseMessage("PG/BG workflow draft saved")
  save(@Body() dto: SavePgBgWorkflowDto, @CurrentUser() user: AuthUser) { return this.pgBgService.saveDraft(user.organizationId, user.id, dto); }

  @Post("workflows/:id/save-draft") @RequirePermissions("pg_bg.save_draft") @ResponseMessage("PG/BG workflow draft saved")
  saveExisting(@Param("id") _id: string, @Body() dto: SavePgBgWorkflowDto, @CurrentUser() user: AuthUser) { return this.pgBgService.saveDraft(user.organizationId, user.id, dto); }

  @Post("workflows/:id/accept-noa") @RequirePermissions("pg_bg.accept_noa") @ResponseMessage("NOA decision saved")
  accept(@Param("id") id: string, @Body() dto: AcceptNoaDto, @CurrentUser() user: AuthUser) { return this.pgBgService.acceptNoa(user.organizationId, user.id, id, dto); }

  @Post("workflows/:id/finalize") @RequirePermissions("pg_bg.create") @ResponseMessage("PG/BG created successfully")
  finalize(@Param("id") id: string, @Body() dto: FinalizePgBgDto, @CurrentUser() user: AuthUser) { return this.pgBgService.finalize(user.organizationId, user.id, id, dto); }
}
