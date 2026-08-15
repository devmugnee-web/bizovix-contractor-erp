import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFiles, UseInterceptors } from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { QueryGeneralExpenseDto } from "./dto/query-general-expense.dto";
import { SaveGeneralExpenseDto } from "./dto/save-general-expense.dto";
import { UpdateGeneralExpenseDto } from "./dto/update-general-expense.dto";
import { GeneralExpensesService } from "./general-expenses.service";

type UploadedExpenseFile = { originalname: string; mimetype: string; size: number; buffer: Buffer };
const allowedMimeTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);

@Controller("general-expenses")
export class GeneralExpensesController {
  constructor(private readonly service: GeneralExpensesService) {}

  @Get() @RequirePermissions("project_expense.read")
  findAll(@Query() query: QueryGeneralExpenseDto, @CurrentUser() user: AuthUser) { return this.service.findAll(user.organizationId, query); }

  @Get("export") @RequirePermissions("project_expense.export")
  exportCsv(@Query() query: QueryGeneralExpenseDto, @CurrentUser() user: AuthUser) { return this.service.exportCsv(user.organizationId, user.id, query); }

  @Get(":id") @RequirePermissions("project_expense.read")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthUser) { return this.service.findOne(user.organizationId, id); }

  @Post() @RequirePermissions("project_expense.create") @ResponseMessage("General expense saved successfully")
  create(@Body() dto: SaveGeneralExpenseDto, @CurrentUser() user: AuthUser) { return this.service.create(user.organizationId, user.id, dto); }

  @Post(":id/attachments")
  @RequirePermissions("project_expense.create")
  @UseInterceptors(FilesInterceptor("files", 10, {
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_request, file, callback) => callback(allowedMimeTypes.has(file.mimetype) ? null : new Error("Only PDF, JPG and PNG files are allowed"), allowedMimeTypes.has(file.mimetype)),
  }))
  @ResponseMessage("Attachments uploaded successfully")
  addAttachments(@Param("id") id: string, @UploadedFiles() files: UploadedExpenseFile[], @CurrentUser() user: AuthUser) {
    return this.service.addAttachments(user.organizationId, user.id, id, files ?? []);
  }

  @Patch(":id") @RequirePermissions("project_expense.update") @ResponseMessage("General expense updated successfully")
  update(@Param("id") id: string, @Body() dto: UpdateGeneralExpenseDto, @CurrentUser() user: AuthUser) { return this.service.update(user.organizationId, user.id, id, dto); }

  @Delete(":id") @RequirePermissions("project_expense.delete") @ResponseMessage("General expense deleted successfully")
  remove(@Param("id") id: string, @CurrentUser() user: AuthUser) { return this.service.remove(user.organizationId, user.id, id); }
}
