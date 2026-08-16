import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { CreateRoleDto, SetRolePermissionsDto, UpdateRoleDto } from "./dto/role.dto";
import { RolesService } from "./roles.service";

@Controller("settings/roles")
export class RolesController {
  constructor(private readonly service: RolesService) {}

  @Get() @RequirePermissions("role.manage") list(@CurrentUser() u: AuthUser) {
    return this.service.list(u.organizationId);
  }

  @Get("permissions-catalog") @RequirePermissions("role.manage") catalog() {
    return this.service.permissionsCatalog();
  }

  @Get(":id") @RequirePermissions("role.manage") one(@Param("id") id: string, @CurrentUser() u: AuthUser) {
    return this.service.one(u.organizationId, id);
  }

  @Post()
  @RequirePermissions("role.manage")
  @ResponseMessage("Role created successfully")
  create(@Body() dto: CreateRoleDto, @CurrentUser() u: AuthUser) {
    return this.service.create(u.organizationId, u.id, dto);
  }

  @Patch(":id")
  @RequirePermissions("role.manage")
  @ResponseMessage("Role updated successfully")
  update(@Param("id") id: string, @Body() dto: UpdateRoleDto, @CurrentUser() u: AuthUser) {
    return this.service.update(u.organizationId, u.id, id, dto);
  }

  @Put(":id/permissions")
  @RequirePermissions("role.manage")
  @ResponseMessage("Role permissions updated successfully")
  setPermissions(@Param("id") id: string, @Body() dto: SetRolePermissionsDto, @CurrentUser() u: AuthUser) {
    return this.service.setPermissions(u.organizationId, u.id, id, dto);
  }

  @Delete(":id")
  @RequirePermissions("role.manage")
  @ResponseMessage("Role deleted successfully")
  remove(@Param("id") id: string, @CurrentUser() u: AuthUser) {
    return this.service.remove(u.organizationId, u.id, id);
  }
}
