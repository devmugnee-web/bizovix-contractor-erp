import { BadRequestException, Body, Controller, Get, Param, Put, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { UpdateCompanyProfileDto } from "./dto/company-profile.dto";
import { CompanyAssetKind, CompanyProfileService } from "./company-profile.service";

type UploadedAssetFile = { originalname: string; mimetype: string; size: number; buffer: Buffer };
const ASSET_KINDS: CompanyAssetKind[] = ["logo", "signature", "seal"];

function assertAssetKind(kind: string): asserts kind is CompanyAssetKind {
  if (!ASSET_KINDS.includes(kind as CompanyAssetKind)) throw new BadRequestException("Unknown company asset type");
}

@Controller("settings/company")
export class CompanyProfileController {
  constructor(private readonly service: CompanyProfileService) {}

  @Get() @RequirePermissions("settings.read") get(@CurrentUser() u: AuthUser) {
    return this.service.get(u.organizationId);
  }

  @Put()
  @RequirePermissions("settings.manage")
  @ResponseMessage("Company profile updated successfully")
  update(@Body() dto: UpdateCompanyProfileDto, @CurrentUser() u: AuthUser) {
    return this.service.update(u.organizationId, u.id, dto);
  }

  @Get(":kind")
  @RequirePermissions("settings.read")
  async asset(@Param("kind") kind: string, @CurrentUser() u: AuthUser, @Res() res: Response) {
    assertAssetKind(kind);
    const { data, mimeType } = await this.service.getAsset(u.organizationId, kind);
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Cache-Control", "private, max-age=300");
    res.send(data);
  }

  @Put(":kind")
  @RequirePermissions("settings.manage")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 2 * 1024 * 1024 } }))
  @ResponseMessage("File uploaded successfully")
  async uploadAsset(
    @Param("kind") kind: string,
    @UploadedFile() file: UploadedAssetFile,
    @CurrentUser() u: AuthUser,
  ) {
    assertAssetKind(kind);
    return this.service.uploadAsset(u.organizationId, u.id, kind, file);
  }
}
