import { Controller,Get,Param,Query } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { QueryReportDto } from "./dto/query-report.dto";
import { ReportsService } from "./reports.service";
@Controller("reports")
export class ReportsController{
 constructor(private readonly service:ReportsService){}
 @Get("summary") @RequirePermissions("report.view") summary(@CurrentUser()u:AuthUser){return this.service.summary(u.organizationId)}
 @Get("options") @RequirePermissions("report.view") options(@CurrentUser()u:AuthUser){return this.service.options(u.organizationId)}
 @Get(":category/:report/export") @RequirePermissions("report.export") export(@Param("category")c:string,@Param("report")r:string,@Query()q:QueryReportDto,@CurrentUser()u:AuthUser){return this.service.export(u.organizationId,u.id,c,r,q)}
 @Get(":category/:report") @RequirePermissions("report.view") run(@Param("category")c:string,@Param("report")r:string,@Query()q:QueryReportDto,@CurrentUser()u:AuthUser){return this.service.run(u.organizationId,c,r,q)}
}
