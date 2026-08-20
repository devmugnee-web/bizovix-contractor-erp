import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { Public } from "../../common/decorators/public.decorator";
import { VendorAdminAuthGuard } from "./common/vendor-admin-auth.guard";
import { VendorDevicesService } from "./vendor-devices.service";
import { QueryVendorDevicesDto } from "./dto/query-devices.dto";

/**
 * Cross-license device listing for an "All Devices" dashboard screen. For devices scoped to one
 * license, use GET /vendor-admin/licenses/:id/devices instead.
 */
@Public()
@UseGuards(VendorAdminAuthGuard)
@Controller("vendor-admin/devices")
export class VendorDevicesController {
  constructor(private readonly service: VendorDevicesService) {}

  @Get()
  list(@Query() query: QueryVendorDevicesDto) {
    return this.service.list(query);
  }
}
