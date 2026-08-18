import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { ComparativeStatementsService } from "./comparative-statements.service";
import { SaveComparativeStatementDto } from "./dto/save-comparative-statement.dto";
import { SelectSupplierDto } from "./dto/select-supplier.dto";

@Controller("comparative-statements")
export class ComparativeStatementsController {
  constructor(private readonly comparativeStatementsService: ComparativeStatementsService) {}

  @Get()
  @RequirePermissions("procurement.read")
  findAll(@CurrentUser() user: AuthUser) {
    return this.comparativeStatementsService.findAll(user.organizationId);
  }

  @Get("stats")
  @RequirePermissions("procurement.read")
  stats(@CurrentUser() user: AuthUser) {
    return this.comparativeStatementsService.stats(user.organizationId);
  }

  @Get(":id")
  @RequirePermissions("procurement.read")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.comparativeStatementsService.findOne(user.organizationId, id);
  }

  @Get(":id/item-comparison")
  @RequirePermissions("procurement.read")
  itemComparison(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.comparativeStatementsService.itemComparison(user.organizationId, id);
  }

  @Post()
  @RequirePermissions("cs.create")
  @ResponseMessage("Comparative Statement created successfully")
  create(@Body() dto: SaveComparativeStatementDto, @CurrentUser() user: AuthUser) {
    return this.comparativeStatementsService.create(user.organizationId, user.id, dto);
  }

  @Patch(":id")
  @RequirePermissions("cs.evaluate")
  @ResponseMessage("Comparative Statement updated successfully")
  update(@Param("id") id: string, @Body() dto: SaveComparativeStatementDto, @CurrentUser() user: AuthUser) {
    return this.comparativeStatementsService.update(user.organizationId, user.id, id, dto);
  }

  @Post(":id/select-supplier")
  @RequirePermissions("cs.evaluate")
  @ResponseMessage("Supplier selected successfully")
  selectSupplier(@Param("id") id: string, @Body() dto: SelectSupplierDto, @CurrentUser() user: AuthUser) {
    return this.comparativeStatementsService.selectSupplier(user.organizationId, user.id, id, dto);
  }

  @Post(":id/approve")
  @RequirePermissions("cs.approve")
  @ResponseMessage("Comparative Statement approved successfully")
  approve(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.comparativeStatementsService.approve(user.organizationId, user.id, id);
  }

  @Post(":id/cancel")
  @RequirePermissions("cs.evaluate")
  @ResponseMessage("Comparative Statement cancelled successfully")
  cancel(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.comparativeStatementsService.cancel(user.organizationId, user.id, id);
  }
}
