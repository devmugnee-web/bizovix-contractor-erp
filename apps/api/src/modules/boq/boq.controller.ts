import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { BoqService } from "./boq.service";
import { CreateBoqItemDto } from "./dto/create-boq-item.dto";
import { UpdateBoqItemDto } from "./dto/update-boq-item.dto";

@Controller("cms/works/:workId")
export class BoqController {
  constructor(private readonly service: BoqService) {}

  @Get("boq")
  @RequirePermissions("boq.read")
  list(@Param("workId") workId: string, @CurrentUser() user: AuthUser) {
    return this.service.list(user.organizationId, workId);
  }

  @Get("boq-summary")
  @RequirePermissions("boq.read")
  summary(@Param("workId") workId: string, @CurrentUser() user: AuthUser) {
    return this.service.summary(user.organizationId, workId);
  }

  @Post("boq")
  @RequirePermissions("boq.create")
  @ResponseMessage("BOQ item added successfully")
  create(@Param("workId") workId: string, @Body() dto: CreateBoqItemDto, @CurrentUser() user: AuthUser) {
    return this.service.create(user.organizationId, user.id, workId, dto);
  }

  @Patch("boq/:itemId")
  @RequirePermissions("boq.update")
  @ResponseMessage("BOQ item updated successfully")
  update(
    @Param("workId") workId: string,
    @Param("itemId") itemId: string,
    @Body() dto: UpdateBoqItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(user.organizationId, user.id, workId, itemId, dto);
  }

  @Delete("boq/:itemId")
  @RequirePermissions("boq.update")
  @ResponseMessage("BOQ item removed successfully")
  remove(@Param("workId") workId: string, @Param("itemId") itemId: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(user.organizationId, user.id, workId, itemId);
  }
}
