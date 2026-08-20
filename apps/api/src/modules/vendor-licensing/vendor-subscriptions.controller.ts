import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { Public } from "../../common/decorators/public.decorator";
import { VendorAdminAuthGuard } from "./common/vendor-admin-auth.guard";
import { CurrentVendorAdmin } from "./common/current-vendor-admin.decorator";
import type { VendorAdminAuthUser } from "./common/vendor-admin-jwt.strategy";
import { VendorSubscriptionsService } from "./vendor-subscriptions.service";
import { QueryVendorSubscriptionsDto } from "./dto/query-subscriptions.dto";
import { RenewSubscriptionDto } from "./dto/renew-subscription.dto";
import { SuspendSubscriptionDto } from "./dto/suspend-subscription.dto";
import { CancelSubscriptionDto } from "./dto/cancel-subscription.dto";

/**
 * A subscription is created implicitly by POST /vendor-admin/licenses when the package's type is
 * SUBSCRIPTION (see VendorLicensesService.issue) — there is no separate create endpoint here, to
 * avoid two divergent code paths for "grant this customer access".
 */
@Public()
@UseGuards(VendorAdminAuthGuard)
@Controller("vendor-admin/subscriptions")
export class VendorSubscriptionsController {
  constructor(private readonly service: VendorSubscriptionsService) {}

  @Get()
  list(@Query() query: QueryVendorSubscriptionsDto) {
    return this.service.list(query);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.service.get(id);
  }

  @Post(":id/renew")
  renew(@Param("id") id: string, @Body() dto: RenewSubscriptionDto, @CurrentVendorAdmin() admin: VendorAdminAuthUser) {
    return this.service.renew(id, dto, admin.id);
  }

  @Post(":id/suspend")
  suspend(@Param("id") id: string, @Body() dto: SuspendSubscriptionDto, @CurrentVendorAdmin() admin: VendorAdminAuthUser) {
    return this.service.suspend(id, dto.reason, admin.id);
  }

  @Post(":id/activate")
  activate(@Param("id") id: string, @CurrentVendorAdmin() admin: VendorAdminAuthUser) {
    return this.service.activate(id, admin.id);
  }

  @Post(":id/cancel")
  cancel(@Param("id") id: string, @Body() dto: CancelSubscriptionDto, @CurrentVendorAdmin() admin: VendorAdminAuthUser) {
    return this.service.cancel(id, dto.reason, admin.id);
  }
}
