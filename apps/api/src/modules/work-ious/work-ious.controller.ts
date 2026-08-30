import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import type { AuthUser } from "@bizovix/types";
import type { Response } from "express";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import {
  CancelWorkIouDto,
  CreateWorkIouDto,
  QueryWorkIouDto,
  UpdateWorkIouDto,
  VersionedWorkIouActionDto,
} from "./dto/work-iou.dto";
import {
  WORK_IOU_ALLOWED_MIME_TYPES,
  WORK_IOU_MAX_FILES,
  WORK_IOU_MAX_FILE_SIZE,
  type UploadedWorkIouFile,
} from "./work-iou-files";
import { WorkIousService } from "./work-ious.service";

@Controller("work-ious")
export class WorkIousController {
  constructor(private readonly service: WorkIousService) {}

  @Get()
  @RequirePermissions("work_iou.read")
  findAll(@Query() query: QueryWorkIouDto, @CurrentUser() user: AuthUser) {
    return this.service.findAll(user.organizationId, query);
  }

  @Get("options")
  @RequirePermissions("work_iou.read")
  options(@CurrentUser() user: AuthUser) {
    return this.service.options(user.organizationId);
  }

  @Get(":id/attachments/:attachmentId/download")
  @RequirePermissions("work_iou.attachment")
  async downloadAttachment(
    @Param("id") id: string,
    @Param("attachmentId") attachmentId: string,
    @CurrentUser() user: AuthUser,
    @Res() response: Response,
  ) {
    const file = await this.service.attachmentForDownload(
      user.organizationId,
      id,
      attachmentId,
    );
    response.setHeader("Content-Type", file.mimeType);
    response.setHeader("Content-Length", String(file.fileSize));
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(file.fileName)}"`,
    );
    response.send(file.buffer);
  }

  @Get(":id")
  @RequirePermissions("work_iou.read")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions("work_iou.create")
  @ResponseMessage("Work IOU draft saved successfully")
  create(@Body() dto: CreateWorkIouDto, @CurrentUser() user: AuthUser) {
    return this.service.create(user.organizationId, user.id, dto);
  }

  @Patch(":id")
  @RequirePermissions("work_iou.update")
  @ResponseMessage("Work IOU draft updated successfully")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateWorkIouDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(user.organizationId, user.id, id, dto);
  }

  @Post(":id/submit")
  @RequirePermissions("work_iou.submit")
  @ResponseMessage("Work IOU submitted successfully")
  submit(
    @Param("id") id: string,
    @Body() dto: VersionedWorkIouActionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.submit(user.organizationId, user.id, id, dto);
  }

  @Post(":id/cancel")
  @RequirePermissions("work_iou.cancel")
  @ResponseMessage("Work IOU cancelled successfully")
  cancel(
    @Param("id") id: string,
    @Body() dto: CancelWorkIouDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.cancel(user.organizationId, user.id, id, dto);
  }

  @Post(":id/attachments")
  @RequirePermissions("work_iou.attachment")
  @UseInterceptors(
    FilesInterceptor("files", WORK_IOU_MAX_FILES, {
      limits: { fileSize: WORK_IOU_MAX_FILE_SIZE },
      fileFilter: (_request, file, callback) => {
        const allowed = WORK_IOU_ALLOWED_MIME_TYPES.has(file.mimetype);
        callback(
          allowed
            ? null
            : new BadRequestException("Only PDF, JPG, PNG, DOC and DOCX files are allowed"),
          allowed,
        );
      },
    }),
  )
  @ResponseMessage("Work IOU attachments uploaded successfully")
  addAttachments(
    @Param("id") id: string,
    @Body() dto: VersionedWorkIouActionDto,
    @UploadedFiles() files: UploadedWorkIouFile[] | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.addAttachments(user.organizationId, user.id, id, dto, files ?? []);
  }

  @Delete(":id/attachments/:attachmentId")
  @RequirePermissions("work_iou.attachment")
  @ResponseMessage("Work IOU attachment deleted successfully")
  removeAttachment(
    @Param("id") id: string,
    @Param("attachmentId") attachmentId: string,
    @Body() dto: VersionedWorkIouActionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.removeAttachment(
      user.organizationId,
      user.id,
      id,
      attachmentId,
      dto,
    );
  }
}

