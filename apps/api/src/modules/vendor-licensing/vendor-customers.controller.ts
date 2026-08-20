import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Public } from "../../common/decorators/public.decorator";
import { VendorAdminAuthGuard } from "./common/vendor-admin-auth.guard";
import { VendorCustomersService } from "./vendor-customers.service";
import { CreateVendorCustomerDto } from "./dto/create-customer.dto";
import { UpdateVendorCustomerDto } from "./dto/update-customer.dto";
import { QueryVendorCustomersDto } from "./dto/query-customers.dto";

@Public()
@UseGuards(VendorAdminAuthGuard)
@Controller("vendor-admin/customers")
export class VendorCustomersController {
  constructor(private readonly service: VendorCustomersService) {}

  @Get()
  list(@Query() query: QueryVendorCustomersDto) {
    return this.service.list(query);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.service.get(id);
  }

  @Post()
  create(@Body() dto: CreateVendorCustomerDto) {
    return this.service.create(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateVendorCustomerDto) {
    return this.service.update(id, dto);
  }
}
