import { Body, Controller, Get, Put } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { UpdateDocumentSettingDto } from "./dto/document-settings.dto";
import { DocumentSettingsService } from "./document-settings.service";

@Controller("settings/documents")
export class DocumentSettingsController {
  constructor(private readonly service: DocumentSettingsService) {}

  @Get() @RequirePermissions("settings.read") get(@CurrentUser() u: AuthUser) {
    return this.service.get(u.organizationId);
  }

  @Put()
  @RequirePermissions("settings.manage")
  @ResponseMessage("Document settings updated successfully")
  update(@Body() dto: UpdateDocumentSettingDto, @CurrentUser() u: AuthUser) {
    return this.service.update(u.organizationId, u.id, dto);
  }
}
