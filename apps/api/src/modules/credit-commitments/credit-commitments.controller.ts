import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { CreditCommitmentsService } from "./credit-commitments.service";
import { CreateCreditCommitmentDto } from "./dto/create-credit-commitment.dto";
import { QueryCreditCommitmentDto } from "./dto/query-credit-commitment.dto";

@Controller("credit-commitments")
export class CreditCommitmentsController {
  constructor(private readonly creditCommitmentsService: CreditCommitmentsService) {}

  @Get("pending")
  @RequirePermissions("credit_commitment.read")
  pending(@Query() query: QueryCreditCommitmentDto, @CurrentUser() user: AuthUser) {
    return this.creditCommitmentsService.pending(user.organizationId, query);
  }

  @Get()
  @RequirePermissions("credit_commitment.read")
  findAll(@Query() query: QueryCreditCommitmentDto, @CurrentUser() user: AuthUser) {
    return this.creditCommitmentsService.findAll(user.organizationId, query);
  }

  @Get(":id")
  @RequirePermissions("credit_commitment.read")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.creditCommitmentsService.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions("credit_commitment.create")
  @ResponseMessage("Credit commitment charge saved successfully")
  create(@Body() dto: CreateCreditCommitmentDto, @CurrentUser() user: AuthUser) {
    return this.creditCommitmentsService.create(user.organizationId, user.id, dto);
  }
}
