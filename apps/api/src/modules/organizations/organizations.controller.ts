import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import type { OrganizationMaster } from "@bizovix/database";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { CreateOrganizationMasterDto } from "./dto/create-organization-master.dto";
import { SearchOrganizationsDto } from "./dto/search-organizations.dto";
import { QueryOrganizationMasterDto } from "./dto/query-organization-master.dto";
import { OrganizationsService } from "./organizations.service";

@Controller("organizations")
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  search(@Query() query: SearchOrganizationsDto, @CurrentUser() user: AuthUser): Promise<OrganizationMaster[]> {
    return this.organizationsService.search(user.organizationId, query.search);
  }

  /** Real paginated list for the Masters hub's "Organizations / Clients" card — the plain
   * GET above stays a typeahead so existing tender/document-purchase pickers keep working. */
  @Get("all")
  @RequirePermissions("masters.read")
  findAll(@Query() query: QueryOrganizationMasterDto, @CurrentUser() user: AuthUser) {
    return this.organizationsService.findAll(user.organizationId, query);
  }

  @Post()
  @ResponseMessage("Organization added successfully")
  create(@Body() dto: CreateOrganizationMasterDto, @CurrentUser() user: AuthUser): Promise<OrganizationMaster> {
    return this.organizationsService.create(user.organizationId, dto);
  }
}
