import { PartialType } from "@nestjs/mapped-types";
import { CreateDeductionConfigDto } from "./create-deduction-config.dto";

export class UpdateDeductionConfigDto extends PartialType(CreateDeductionConfigDto) {}
