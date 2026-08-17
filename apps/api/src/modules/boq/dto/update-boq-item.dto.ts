import { PartialType } from "@nestjs/mapped-types";
import { CreateBoqItemDto } from "./create-boq-item.dto";

export class UpdateBoqItemDto extends PartialType(CreateBoqItemDto) {}
