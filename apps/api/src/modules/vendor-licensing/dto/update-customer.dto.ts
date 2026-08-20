import { PartialType } from "@nestjs/mapped-types";
import { CreateVendorCustomerDto } from "./create-customer.dto";

export class UpdateVendorCustomerDto extends PartialType(CreateVendorCustomerDto) {}
