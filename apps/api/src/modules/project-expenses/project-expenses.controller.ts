import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { QueryProjectExpenseDto } from "./dto/query-project-expense.dto";
import { SaveProjectExpenseDto } from "./dto/save-project-expense.dto";
import { CreateProjectExpensesBatchDto } from "./dto/create-project-expenses-batch.dto";
import { UpdateProjectExpenseDto } from "./dto/update-project-expense.dto";
import { SaveExpenseHeadDto } from "./dto/save-expense-head.dto";
import { ProjectExpensesService } from "./project-expenses.service";

@Controller("project-expenses")
export class ProjectExpensesController {
  constructor(private readonly service: ProjectExpensesService) {}

  @Get() @RequirePermissions("project_expense.read")
  findAll(@Query() query: QueryProjectExpenseDto, @CurrentUser() user: AuthUser) { return this.service.findAll(user.organizationId, query); }

  @Get("expense-heads") @RequirePermissions("project_expense.read")
  heads(@CurrentUser() user: AuthUser) { return this.service.heads(user.organizationId); }

  @Get("expense-heads/manage") @RequirePermissions("project_expense.read")
  manageHeads(@CurrentUser() user: AuthUser) { return this.service.manageHeads(user.organizationId); }

  @Post("expense-heads") @RequirePermissions("project_expense.create")
  createHead(@Body() dto: SaveExpenseHeadDto, @CurrentUser() user: AuthUser) { return this.service.createHead(user.organizationId, user.id, dto); }

  @Patch("expense-heads/:headId") @RequirePermissions("project_expense.update")
  updateHead(@Param("headId") headId: string, @Body() dto: SaveExpenseHeadDto, @CurrentUser() user: AuthUser) { return this.service.updateHead(user.organizationId, user.id, headId, dto); }

  @Get("people") @RequirePermissions("project_expense.read")
  people(@CurrentUser() user: AuthUser) { return this.service.people(user.organizationId); }

  @Get("export") @RequirePermissions("project_expense.export")
  exportCsv(@Query() query: QueryProjectExpenseDto, @CurrentUser() user: AuthUser) { return this.service.exportCsv(user.organizationId, user.id, query); }

  @Post("batch") @RequirePermissions("project_expense.create") @ResponseMessage("Project expenses saved successfully")
  createBatch(@Body() dto: CreateProjectExpensesBatchDto, @CurrentUser() user: AuthUser) { return this.service.createBatch(user.organizationId, user.id, dto); }

  @Get(":id") @RequirePermissions("project_expense.read")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthUser) { return this.service.findOne(user.organizationId, id); }

  @Post() @RequirePermissions("project_expense.create") @ResponseMessage("Project expense saved successfully")
  create(@Body() dto: SaveProjectExpenseDto, @CurrentUser() user: AuthUser) { return this.service.create(user.organizationId, user.id, dto); }

  @Patch(":id") @RequirePermissions("project_expense.update") @ResponseMessage("Project expense updated successfully")
  update(@Param("id") id: string, @Body() dto: UpdateProjectExpenseDto, @CurrentUser() user: AuthUser) { return this.service.update(user.organizationId, user.id, id, dto); }

  @Delete(":id") @RequirePermissions("project_expense.delete") @ResponseMessage("Project expense deleted successfully")
  remove(@Param("id") id: string, @CurrentUser() user: AuthUser) { return this.service.remove(user.organizationId, user.id, id); }
}
