import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { Public } from "../../common/decorators/public.decorator";
import { VendorAdminAuthGuard } from "./common/vendor-admin-auth.guard";
import { VendorPackagesService } from "./vendor-packages.service";
import { CreateVendorPackageDto } from "./dto/create-package.dto";
import { UpdateVendorPackageDto } from "./dto/update-package.dto";

@Public()
@UseGuards(VendorAdminAuthGuard)
@Controller("vendor-admin/packages")
export class VendorPackagesController {
  constructor(private readonly service: VendorPackagesService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.service.get(id);
  }

  @Post()
  create(@Body() dto: CreateVendorPackageDto) {
    return this.service.create(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateVendorPackageDto) {
    return this.service.update(id, dto);
  }
}
