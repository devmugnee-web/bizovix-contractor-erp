import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { PartiesService } from "./parties.service";
import { CreatePartyDto } from "./dto/create-party.dto";
import { UpdatePartyDto } from "./dto/update-party.dto";
import { QueryPartyDto } from "./dto/query-party.dto";
import { ChangePartyStatusDto } from "./dto/change-party-status.dto";
import { SavePartyContactDto } from "./dto/save-party-contact.dto";

@Controller("parties")
export class PartiesController {
  constructor(private readonly partiesService: PartiesService) {}

  @Get()
  @RequirePermissions("vendor.read")
  findAll(@Query() query: QueryPartyDto, @CurrentUser() user: AuthUser) {
    return this.partiesService.findAll(user.organizationId, query);
  }

  @Get("stats")
  @RequirePermissions("vendor.read")
  stats(@Query("roles") roles: string | undefined, @CurrentUser() user: AuthUser) {
    return this.partiesService.stats(user.organizationId, roles);
  }

  @Get(":id")
  @RequirePermissions("vendor.read")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.partiesService.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions("vendor.create")
  @ResponseMessage("Party created successfully")
  create(@Body() dto: CreatePartyDto, @CurrentUser() user: AuthUser) {
    return this.partiesService.create(user.organizationId, user.id, dto);
  }

  @Patch(":id")
  @RequirePermissions("vendor.update")
  @ResponseMessage("Party updated successfully")
  update(@Param("id") id: string, @Body() dto: UpdatePartyDto, @CurrentUser() user: AuthUser) {
    return this.partiesService.update(user.organizationId, user.id, id, dto);
  }

  @Post(":id/status")
  @RequirePermissions("vendor.archive")
  @ResponseMessage("Party status updated successfully")
  changeStatus(@Param("id") id: string, @Body() dto: ChangePartyStatusDto, @CurrentUser() user: AuthUser) {
    return this.partiesService.changeStatus(user.organizationId, user.id, id, dto);
  }

  @Post(":id/contacts")
  @RequirePermissions("vendor.update")
  @ResponseMessage("Contact added successfully")
  addContact(@Param("id") id: string, @Body() dto: SavePartyContactDto, @CurrentUser() user: AuthUser) {
    return this.partiesService.addContact(user.organizationId, id, dto);
  }

  @Patch(":id/contacts/:contactId")
  @RequirePermissions("vendor.update")
  @ResponseMessage("Contact updated successfully")
  updateContact(@Param("id") id: string, @Param("contactId") contactId: string, @Body() dto: SavePartyContactDto, @CurrentUser() user: AuthUser) {
    return this.partiesService.updateContact(user.organizationId, id, contactId, dto);
  }

  @Delete(":id/contacts/:contactId")
  @RequirePermissions("vendor.update")
  @ResponseMessage("Contact removed successfully")
  removeContact(@Param("id") id: string, @Param("contactId") contactId: string, @CurrentUser() user: AuthUser) {
    return this.partiesService.removeContact(user.organizationId, id, contactId);
  }
}
