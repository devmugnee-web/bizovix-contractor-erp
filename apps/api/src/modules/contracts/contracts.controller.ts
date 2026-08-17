import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { ContractsService } from "./contracts.service";
import { CreateContractDto } from "./dto/create-contract.dto";
import { UpdateContractDto } from "./dto/update-contract.dto";
import { QueryContractDto } from "./dto/query-contract.dto";

@Controller("contracts")
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Get()
  @RequirePermissions("contract.read")
  findAll(@Query() query: QueryContractDto, @CurrentUser() user: AuthUser) {
    return this.contractsService.findAll(user.organizationId, query);
  }

  @Get("stats")
  @RequirePermissions("contract.read")
  stats(@CurrentUser() user: AuthUser) {
    return this.contractsService.stats(user.organizationId);
  }

  @Get("categories")
  @RequirePermissions("contract.read")
  categories(@CurrentUser() user: AuthUser) {
    return this.contractsService.categories(user.organizationId);
  }

  @Get(":id")
  @RequirePermissions("contract.read")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.contractsService.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions("contract.create")
  @ResponseMessage("Contract created successfully")
  create(@Body() dto: CreateContractDto, @CurrentUser() user: AuthUser) {
    return this.contractsService.create(user.organizationId, user.id, dto);
  }

  @Patch(":id")
  @RequirePermissions("contract.update")
  @ResponseMessage("Contract updated successfully")
  update(@Param("id") id: string, @Body() dto: UpdateContractDto, @CurrentUser() user: AuthUser) {
    return this.contractsService.update(user.organizationId, user.id, id, dto);
  }

  @Post(":id/activate")
  @RequirePermissions("contract.activate")
  @ResponseMessage("Contract activated successfully")
  activate(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.contractsService.activate(user.organizationId, user.id, id);
  }
}
