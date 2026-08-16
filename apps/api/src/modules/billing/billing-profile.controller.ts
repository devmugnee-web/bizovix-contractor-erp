import { Body, Controller, Get, Put } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { BillingProfileService } from "./billing-profile.service";
import { UpdateBillingProfileDto } from "./dto/billing-profile.dto";

@Controller("billing/profile")
export class BillingProfileController {
  constructor(private readonly service: BillingProfileService) {}

  @Get() @RequirePermissions("billing.view") get(@CurrentUser() u: AuthUser) {
    return this.service.get(u.organizationId);
  }

  @Put()
  @RequirePermissions("billing.manage")
  @ResponseMessage("Billing information updated successfully")
  update(@Body() dto: UpdateBillingProfileDto, @CurrentUser() u: AuthUser) {
    return this.service.update(u.organizationId, u.id, dto);
  }
}
