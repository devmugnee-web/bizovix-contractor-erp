import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { CreateUserDto, QueryUserDto, ResetPasswordDto, SetUserStatusDto, UpdateUserDto } from "./dto/user.dto";
import { UsersService } from "./users.service";

@Controller("settings/users")
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get() @RequirePermissions("user.manage") list(@Query() q: QueryUserDto, @CurrentUser() u: AuthUser) {
    return this.service.list(u.organizationId, q);
  }

  @Get(":id") @RequirePermissions("user.manage") one(@Param("id") id: string, @CurrentUser() u: AuthUser) {
    return this.service.one(u.organizationId, id);
  }

  @Post()
  @RequirePermissions("user.manage")
  @ResponseMessage("User created successfully")
  create(@Body() dto: CreateUserDto, @CurrentUser() u: AuthUser) {
    return this.service.create(u.organizationId, u.id, dto);
  }

  @Patch(":id")
  @RequirePermissions("user.manage")
  @ResponseMessage("User updated successfully")
  update(@Param("id") id: string, @Body() dto: UpdateUserDto, @CurrentUser() u: AuthUser) {
    return this.service.update(u.organizationId, u.id, id, dto);
  }

  @Patch(":id/status")
  @RequirePermissions("user.manage")
  @ResponseMessage("User status updated successfully")
  setStatus(@Param("id") id: string, @Body() dto: SetUserStatusDto, @CurrentUser() u: AuthUser) {
    return this.service.setStatus(u.organizationId, u.id, id, dto.isActive);
  }

  @Post(":id/reset-password")
  @RequirePermissions("user.manage")
  @ResponseMessage("Password reset successfully")
  resetPassword(@Param("id") id: string, @Body() dto: ResetPasswordDto, @CurrentUser() u: AuthUser) {
    return this.service.resetPassword(u.organizationId, u.id, id, dto);
  }
}
