import { Body, Controller, Get, Param, Put } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { UpdateNumberSequenceDto } from "./dto/numbering.dto";
import { NumberingService } from "./numbering.service";

@Controller("settings/numbering")
export class NumberingController {
  constructor(private readonly service: NumberingService) {}

  @Get() @RequirePermissions("settings.read") list(@CurrentUser() u: AuthUser) {
    return this.service.list(u.organizationId);
  }

  @Get(":moduleKey/preview") @RequirePermissions("settings.read") preview(
    @Param("moduleKey") moduleKey: string,
    @CurrentUser() u: AuthUser,
  ) {
    return this.service.preview(u.organizationId, moduleKey).then((value) => ({ preview: value }));
  }

  @Put(":moduleKey")
  @RequirePermissions("settings.manage")
  @ResponseMessage("Numbering settings updated successfully")
  update(
    @Param("moduleKey") moduleKey: string,
    @Body() dto: UpdateNumberSequenceDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.service.update(u.organizationId, u.id, moduleKey, dto);
  }
}
