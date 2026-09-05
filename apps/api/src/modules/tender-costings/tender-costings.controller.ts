import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import {
  QueryTenderCostingDto,
  SaveTenderCostingDto,
  SetTenderCostingBudgetDto,
} from "./dto/tender-costing.dto";
import { TenderCostingsService } from "./tender-costings.service";
import {
  extractTenderCostingPdfs,
  MAX_TENDER_COSTING_PDF_BYTES,
  MAX_TENDER_COSTING_PDF_FILES,
  type UploadedTenderCostingPdf,
} from "./tender-costing-pdf-extraction";

@Controller("tender-costings")
export class TenderCostingsController {
  constructor(private readonly service: TenderCostingsService) {}

  @Get()
  @RequirePermissions("tender.costing.read")
  findAll(@Query() query: QueryTenderCostingDto, @CurrentUser() user: AuthUser) {
    return this.service.findAll(user.organizationId, query);
  }

  @Get("stats")
  @RequirePermissions("tender.costing.read")
  stats(@CurrentUser() user: AuthUser) {
    return this.service.stats(user.organizationId);
  }

  @Get("item-price-history")
  @RequirePermissions("tender.costing.read")
  itemPriceHistory(@CurrentUser() user: AuthUser) {
    return this.service.itemPriceHistory(user.organizationId);
  }

  @Post("extract-pdfs")
  @RequirePermissions("tender.costing.update")
  @UseInterceptors(
    FilesInterceptor("files", MAX_TENDER_COSTING_PDF_FILES, {
      limits: { fileSize: MAX_TENDER_COSTING_PDF_BYTES },
      fileFilter: (_request, file, callback) => {
        const allowed = ["application/pdf", "application/octet-stream"].includes(file.mimetype);
        callback(allowed ? null : new BadRequestException("Only PDF files are allowed"), allowed);
      },
    }),
  )
  @ResponseMessage("BOQ PDF rows extracted successfully")
  extractPdfs(@UploadedFiles() files: UploadedTenderCostingPdf[] | undefined) {
    return extractTenderCostingPdfs(files);
  }

  @Get(":id")
  @RequirePermissions("tender.costing.read")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.findOne(user.organizationId, id);
  }

  @Patch(":id/budget")
  @RequirePermissions("tender.costing.update")
  @ResponseMessage("Tender costing budget saved successfully")
  setBudget(
    @Param("id") id: string,
    @Body() dto: SetTenderCostingBudgetDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.setBudget(user.organizationId, user.id, id, dto);
  }

  @Put(":id")
  @RequirePermissions("tender.costing.update")
  @ResponseMessage("Tender costing saved successfully")
  save(
    @Param("id") id: string,
    @Body() dto: SaveTenderCostingDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.save(user.organizationId, user.id, id, dto);
  }
}
