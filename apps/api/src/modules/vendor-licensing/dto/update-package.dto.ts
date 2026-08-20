import { PartialType } from "@nestjs/mapped-types";
import { CreateVendorPackageDto } from "./create-package.dto";

export class UpdateVendorPackageDto extends PartialType(CreateVendorPackageDto) {}
