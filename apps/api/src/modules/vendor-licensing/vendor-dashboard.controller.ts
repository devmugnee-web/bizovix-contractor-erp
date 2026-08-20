import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { Public } from "../../common/decorators/public.decorator";
import { VendorAdminAuthGuard } from "./common/vendor-admin-auth.guard";
import { VendorDashboardService } from "./vendor-dashboard.service";

@Public()
@UseGuards(VendorAdminAuthGuard)
@Controller("vendor-admin/dashboard")
export class VendorDashboardController {
  constructor(private readonly service: VendorDashboardService) {}

  @Get("summary")
  summary() {
    return this.service.summary();
  }

  @Get("activity")
  activity(@Query("limit") limit?: string) {
    return this.service.activity(limit ? Number(limit) : undefined);
  }

  @Get("companies")
  companies() {
    return this.service.companies();
  }

  @Get("packages")
  packages() {
    return this.service.packages();
  }

  @Get("downloads")
  downloads() {
    return this.service.downloads();
  }
}
