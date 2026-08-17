import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { ProjectBudgetsService } from "./project-budgets.service";
import { CreateProjectBudgetDto } from "./dto/create-project-budget.dto";

@Controller("cms/works/:workId")
export class ProjectBudgetsController {
  constructor(private readonly service: ProjectBudgetsService) {}

  @Get("budgets")
  @RequirePermissions("project_budget.read")
  list(@Param("workId") workId: string, @CurrentUser() user: AuthUser) {
    return this.service.list(user.organizationId, workId);
  }

  @Get("budget-summary")
  @RequirePermissions("project_budget.read")
  summary(@Param("workId") workId: string, @CurrentUser() user: AuthUser) {
    return this.service.summary(user.organizationId, workId);
  }

  @Get("budget-vs-actual")
  @RequirePermissions("project_budget.read")
  budgetVsActual(@Param("workId") workId: string, @CurrentUser() user: AuthUser) {
    return this.service.budgetVsActual(user.organizationId, workId);
  }

  @Post("budgets")
  @RequirePermissions("project_budget.create")
  @ResponseMessage("Budget draft saved successfully")
  saveDraft(@Param("workId") workId: string, @Body() dto: CreateProjectBudgetDto, @CurrentUser() user: AuthUser) {
    return this.service.saveDraft(user.organizationId, user.id, workId, dto);
  }

  @Post("budgets/:budgetId/approve")
  @RequirePermissions("project_budget.approve")
  @ResponseMessage("Budget approved successfully")
  approve(@Param("workId") workId: string, @Param("budgetId") budgetId: string, @CurrentUser() user: AuthUser) {
    return this.service.approve(user.organizationId, user.id, workId, budgetId);
  }
}
