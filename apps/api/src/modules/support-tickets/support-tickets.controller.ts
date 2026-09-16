import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Public } from "../../common/decorators/public.decorator";
import { CurrentVendorAdmin } from "../vendor-licensing/common/current-vendor-admin.decorator";
import { VendorAdminAuthGuard } from "../vendor-licensing/common/vendor-admin-auth.guard";
import type { VendorAdminAuthUser } from "../vendor-licensing/common/vendor-admin-jwt.strategy";
import {
  CreateSupportTicketDto,
  QuerySupportTicketDto,
  ReplySupportTicketDto,
  UpdateSupportTicketStatusDto,
} from "./dto/support-ticket.dto";
import {
  SUPPORT_ALLOWED_MIME_TYPES,
  SUPPORT_MAX_FILES,
  SUPPORT_MAX_FILE_SIZE,
  type UploadedSupportFile,
} from "./support-ticket-files";
import { SupportTicketsService } from "./support-tickets.service";

const uploadOptions = {
  limits: { files: SUPPORT_MAX_FILES, fileSize: SUPPORT_MAX_FILE_SIZE },
  fileFilter: (_request: unknown, file: { mimetype: string }, callback: (error: Error | null, acceptFile: boolean) => void) => {
    const allowed = SUPPORT_ALLOWED_MIME_TYPES.has(file.mimetype);
    callback(allowed ? null : new BadRequestException("Only PNG, JPG or PDF files are allowed"), allowed);
  },
};

function sendAttachment(res: Response, file: { fileName: string; mimeType: string; data: Uint8Array }) {
  const encoded = encodeURIComponent(file.fileName);
  res.setHeader("Content-Type", file.mimeType);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", `attachment; filename="support-attachment"; filename*=UTF-8''${encoded}`);
  res.send(Buffer.from(file.data));
}

@Controller("support-tickets")
export class SupportTicketsController {
  constructor(private readonly service: SupportTicketsService) {}

  @Get()
  list(@Query() query: QuerySupportTicketDto, @CurrentUser() user: AuthUser) {
    return this.service.listMine(user.organizationId, user.id, query);
  }

  @Get(":id")
  get(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.getMine(user.organizationId, user.id, id);
  }

  @Post()
  @UseInterceptors(FilesInterceptor("files", SUPPORT_MAX_FILES, uploadOptions))
  create(@Body() dto: CreateSupportTicketDto, @UploadedFiles() files: UploadedSupportFile[] | undefined, @CurrentUser() user: AuthUser) {
    return this.service.create(user.organizationId, user.id, dto, files ?? []);
  }

  @Post(":id/replies")
  @UseInterceptors(FilesInterceptor("files", SUPPORT_MAX_FILES, uploadOptions))
  reply(@Param("id") id: string, @Body() dto: ReplySupportTicketDto, @UploadedFiles() files: UploadedSupportFile[] | undefined, @CurrentUser() user: AuthUser) {
    return this.service.replyMine(user.organizationId, user.id, id, dto, files ?? []);
  }

  @Patch(":id/status")
  status(@Param("id") id: string, @Body() dto: UpdateSupportTicketStatusDto, @CurrentUser() user: AuthUser) {
    return this.service.setStatusMine(user.organizationId, user.id, id, dto.status);
  }

  @Get(":id/attachments/:attachmentId")
  async attachment(@Param("id") id: string, @Param("attachmentId") attachmentId: string, @CurrentUser() user: AuthUser, @Res() res: Response) {
    const file = await this.service.attachmentMine(user.organizationId, user.id, id, attachmentId);
    sendAttachment(res, file);
  }
}

@Public()
@UseGuards(VendorAdminAuthGuard)
@Controller("vendor-admin/support-tickets")
export class VendorSupportTicketsController {
  constructor(private readonly service: SupportTicketsService) {}

  @Get()
  list(@Query() query: QuerySupportTicketDto) {
    return this.service.listForSupport(query);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.service.getForSupport(id);
  }

  @Post(":id/replies")
  @UseInterceptors(FilesInterceptor("files", SUPPORT_MAX_FILES, uploadOptions))
  reply(@Param("id") id: string, @Body() dto: ReplySupportTicketDto, @UploadedFiles() files: UploadedSupportFile[] | undefined, @CurrentVendorAdmin() admin: VendorAdminAuthUser) {
    return this.service.replyForSupport(admin.id, id, dto, files ?? []);
  }

  @Patch(":id/status")
  status(@Param("id") id: string, @Body() dto: UpdateSupportTicketStatusDto) {
    return this.service.setStatusForSupport(id, dto.status);
  }

  @Get(":id/attachments/:attachmentId")
  async attachment(@Param("id") id: string, @Param("attachmentId") attachmentId: string, @Res() res: Response) {
    const file = await this.service.attachmentForSupport(id, attachmentId);
    sendAttachment(res, file);
  }
}
