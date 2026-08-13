import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import type { OrganizationMaster } from "@bizovix/database";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { CreateOrganizationMasterDto } from "./dto/create-organization-master.dto";
import { SearchOrganizationsDto } from "./dto/search-organizations.dto";
import { OrganizationsService } from "./organizations.service";

@Controller("organizations")
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  search(@Query() query: SearchOrganizationsDto, @CurrentUser() user: AuthUser): Promise<OrganizationMaster[]> {
    return this.organizationsService.search(user.organizationId, query.search);
  }

  @Post()
  @ResponseMessage("Organization added successfully")
  create(@Body() dto: CreateOrganizationMasterDto, @CurrentUser() user: AuthUser): Promise<OrganizationMaster> {
    return this.organizationsService.create(user.organizationId, dto);
  }
}
