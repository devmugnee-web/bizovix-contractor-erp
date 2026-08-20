import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Public } from "../../common/decorators/public.decorator";
import { VendorAdminAuthGuard } from "./common/vendor-admin-auth.guard";
import { CurrentVendorAdmin } from "./common/current-vendor-admin.decorator";
import type { VendorAdminAuthUser } from "./common/vendor-admin-jwt.strategy";
import { VendorLicensesService } from "./vendor-licenses.service";
import { IssueVendorLicenseDto } from "./dto/issue-license.dto";
import { UpdateVendorLicenseDto } from "./dto/update-license.dto";
import { QueryVendorLicensesDto } from "./dto/query-licenses.dto";
import { ExtendVendorLicenseDto } from "./dto/extend-license.dto";
import { SuspendVendorLicenseDto } from "./dto/suspend-license.dto";
import { RevokeVendorLicenseDto } from "./dto/revoke-license.dto";
import { ConvertTrialDto } from "./dto/convert-trial.dto";

@Public()
@UseGuards(VendorAdminAuthGuard)
@Controller("vendor-admin/licenses")
export class VendorLicensesController {
  constructor(private readonly service: VendorLicensesService) {}

  @Get()
  list(@Query() query: QueryVendorLicensesDto) {
    return this.service.list(query);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.service.get(id);
  }

  @Post()
  issue(@Body() dto: IssueVendorLicenseDto, @CurrentVendorAdmin() admin: VendorAdminAuthUser) {
    return this.service.issue(dto, admin.id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateVendorLicenseDto, @CurrentVendorAdmin() admin: VendorAdminAuthUser) {
    return this.service.update(id, dto, admin.id);
  }

  @Post(":id/extend")
  extend(@Param("id") id: string, @Body() dto: ExtendVendorLicenseDto, @CurrentVendorAdmin() admin: VendorAdminAuthUser) {
    return this.service.extend(id, dto, admin.id);
  }

  @Post(":id/suspend")
  suspend(@Param("id") id: string, @Body() dto: SuspendVendorLicenseDto, @CurrentVendorAdmin() admin: VendorAdminAuthUser) {
    return this.service.suspend(id, dto.reason, admin.id);
  }

  @Post(":id/reactivate")
  reactivate(@Param("id") id: string, @CurrentVendorAdmin() admin: VendorAdminAuthUser) {
    return this.service.reactivate(id, admin.id);
  }

  @Post(":id/revoke")
  revoke(@Param("id") id: string, @Body() dto: RevokeVendorLicenseDto, @CurrentVendorAdmin() admin: VendorAdminAuthUser) {
    return this.service.revoke(id, dto.reason, admin.id);
  }

  @Post(":id/convert-trial")
  convertTrial(@Param("id") id: string, @Body() dto: ConvertTrialDto, @CurrentVendorAdmin() admin: VendorAdminAuthUser) {
    return this.service.convertTrial(id, dto, admin.id);
  }

  @Get(":id/devices")
  listDevices(@Param("id") id: string) {
    return this.service.listDevices(id);
  }

  @Post(":id/devices/:deviceId/revoke")
  revokeDevice(@Param("id") id: string, @Param("deviceId") deviceId: string, @CurrentVendorAdmin() admin: VendorAdminAuthUser) {
    return this.service.revokeDevice(id, deviceId, admin.id);
  }
}
