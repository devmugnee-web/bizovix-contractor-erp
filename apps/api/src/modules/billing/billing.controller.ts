import { Body, Controller, Get, Post } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { BillingService } from "./billing.service";
import { CancelSubscriptionDto, UpgradePlanDto } from "./dto/billing.dto";

@Controller("billing")
export class BillingController {
  constructor(private readonly service: BillingService) {}

  @Get("subscription") @RequirePermissions("billing.view") subscription(@CurrentUser() u: AuthUser) {
    return this.service.getSubscription(u.organizationId);
  }

  @Get("plans") @RequirePermissions("billing.view") plans(@CurrentUser() u: AuthUser) {
    return this.service.listPlans(u.organizationId);
  }

  @Get("usage") @RequirePermissions("billing.view") usage(@CurrentUser() u: AuthUser) {
    return this.service.getUsage(u.organizationId);
  }

  @Post("upgrade")
  @RequirePermissions("billing.manage")
  @ResponseMessage("Plan change submitted successfully")
  upgrade(@Body() dto: UpgradePlanDto, @CurrentUser() u: AuthUser) {
    return this.service.upgradePlan(u.organizationId, u.id, dto);
  }

  @Post("cancel")
  @RequirePermissions("billing.manage")
  @ResponseMessage("Your subscription will remain active until the end of the current billing period")
  cancel(@Body() dto: CancelSubscriptionDto, @CurrentUser() u: AuthUser) {
    return this.service.cancelSubscription(u.organizationId, u.id, dto);
  }

  @Post("resume")
  @RequirePermissions("billing.manage")
  @ResponseMessage("Subscription cancellation reversed")
  resume(@CurrentUser() u: AuthUser) {
    return this.service.resumeSubscription(u.organizationId, u.id);
  }
}
