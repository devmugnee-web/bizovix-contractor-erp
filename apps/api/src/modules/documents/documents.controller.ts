import { Body, Controller, Get, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { CreateDocumentDto } from "./dto/create-document.dto";
import { UpdateDocumentDto } from "./dto/update-document.dto";
import { QueryDocumentDto } from "./dto/query-document.dto";
import { DocumentsService, type UploadedDocumentFile } from "./documents.service";

const uploadOptions = { limits: { fileSize: 20 * 1024 * 1024 } };

@Controller("documents")
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  @RequirePermissions("documents.read")
  findAll(@Query() query: QueryDocumentDto, @CurrentUser() user: AuthUser) {
    return this.documentsService.findAll(user.organizationId, query);
  }

  @Get("categories")
  @RequirePermissions("documents.read")
  categories(@CurrentUser() user: AuthUser) {
    return this.documentsService.categories(user.organizationId);
  }

  @Get(":id")
  @RequirePermissions("documents.read")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.documentsService.findOne(user.organizationId, id);
  }

  @Get(":id/download")
  @RequirePermissions("documents.download")
  async download(
    @Param("id") id: string,
    @Query("version") version: string | undefined,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const { buffer, fileName, fileType } = await this.documentsService.getFileForDownload(
      user.organizationId,
      id,
      version ? Number(version) : undefined,
    );
    res.setHeader("Content-Type", fileType);
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.send(buffer);
  }

  @Post()
  @RequirePermissions("documents.upload")
  @UseInterceptors(FileInterceptor("file", uploadOptions))
  @ResponseMessage("Document uploaded successfully")
  create(
    @Body() dto: CreateDocumentDto,
    @UploadedFile() file: UploadedDocumentFile | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.documentsService.create(user.organizationId, user.id, user.name, dto, file);
  }

  @Post(":id/versions")
  @RequirePermissions("documents.upload")
  @UseInterceptors(FileInterceptor("file", uploadOptions))
  @ResponseMessage("New document version uploaded successfully")
  addVersion(
    @Param("id") id: string,
    @Body("changeNote") changeNote: string | undefined,
    @UploadedFile() file: UploadedDocumentFile | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.documentsService.addVersion(user.organizationId, user.id, user.name, id, file, changeNote);
  }

  @Patch(":id")
  @RequirePermissions("documents.update")
  @ResponseMessage("Document updated successfully")
  update(@Param("id") id: string, @Body() dto: UpdateDocumentDto, @CurrentUser() user: AuthUser) {
    return this.documentsService.update(user.organizationId, user.id, id, dto);
  }

  @Patch(":id/archive")
  @RequirePermissions("documents.archive")
  @ResponseMessage("Document archived successfully")
  archive(@Param("id") id: string, @Body("reason") reason: string | undefined, @CurrentUser() user: AuthUser) {
    return this.documentsService.archive(user.organizationId, user.id, user.name, id, reason);
  }

  @Patch(":id/restore")
  @RequirePermissions("documents.archive")
  @ResponseMessage("Document restored successfully")
  restore(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.documentsService.restore(user.organizationId, user.id, id);
  }
}
