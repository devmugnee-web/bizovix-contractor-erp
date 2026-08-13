import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { CreateDocumentPurchaseDto } from "./dto/create-document-purchase.dto";
import { UpdateDocumentPurchaseDto } from "./dto/update-document-purchase.dto";
import { QueryDocumentPurchaseDto } from "./dto/query-document-purchase.dto";
import { DocumentPurchasesService } from "./document-purchases.service";

@Controller("document-purchases")
export class DocumentPurchasesController {
  constructor(private readonly documentPurchasesService: DocumentPurchasesService) {}

  @Get()
  @RequirePermissions("document_purchase.read")
  findAll(@Query() query: QueryDocumentPurchaseDto, @CurrentUser() user: AuthUser) {
    return this.documentPurchasesService.findAll(user.organizationId, query);
  }

  @Get("stats")
  @RequirePermissions("document_purchase.read")
  stats(@CurrentUser() user: AuthUser) {
    return this.documentPurchasesService.stats(user.organizationId);
  }

  @Get(":id")
  @RequirePermissions("document_purchase.read")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.documentPurchasesService.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions("document_purchase.create")
  @ResponseMessage("Document purchase created successfully")
  create(@Body() dto: CreateDocumentPurchaseDto, @CurrentUser() user: AuthUser) {
    return this.documentPurchasesService.create(user.organizationId, user.id, dto);
  }

  @Patch(":id")
  @RequirePermissions("document_purchase.update")
  @ResponseMessage("Document purchase updated successfully")
  update(@Param("id") id: string, @Body() dto: UpdateDocumentPurchaseDto, @CurrentUser() user: AuthUser) {
    return this.documentPurchasesService.update(user.organizationId, user.id, id, dto);
  }

  @Delete(":id")
  @RequirePermissions("document_purchase.delete")
  @ResponseMessage("Document purchase deleted successfully")
  remove(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.documentPurchasesService.remove(user.organizationId, user.id, id);
  }
}
