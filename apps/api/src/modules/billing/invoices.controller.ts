import { Body, Controller, Get, Param, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { InvoicesService } from "./invoices.service";
import { QueryInvoiceDto, RecordPaymentDto, VerifyPaymentDto } from "./dto/invoice.dto";

@Controller("billing/invoices")
export class InvoicesController {
  constructor(private readonly service: InvoicesService) {}

  @Get() @RequirePermissions("billing.invoice.view") list(@Query() q: QueryInvoiceDto, @CurrentUser() u: AuthUser) {
    return this.service.list(u.organizationId, q);
  }

  @Get(":id") @RequirePermissions("billing.invoice.view") one(@Param("id") id: string, @CurrentUser() u: AuthUser) {
    return this.service.one(u.organizationId, id);
  }

  @Get(":id/pdf")
  @RequirePermissions("billing.invoice.view")
  async pdf(@Param("id") id: string, @CurrentUser() u: AuthUser, @Res() res: Response) {
    const buffer = await this.service.generatePdfBuffer(u.organizationId, id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="invoice-${id}.pdf"`);
    res.send(buffer);
  }

  @Post(":id/payments")
  @RequirePermissions("billing.manage")
  @ResponseMessage("Payment recorded successfully")
  recordPayment(@Param("id") id: string, @Body() dto: RecordPaymentDto, @CurrentUser() u: AuthUser) {
    return this.service.recordPayment(u.organizationId, u.id, id, dto);
  }

  @Post(":id/payments/:paymentId/verify")
  @RequirePermissions("billing.manage")
  @ResponseMessage("Payment verification updated")
  verifyPayment(
    @Param("id") id: string,
    @Param("paymentId") paymentId: string,
    @Body() dto: VerifyPaymentDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.service.verifyPayment(u.organizationId, u.id, id, paymentId, dto);
  }
}
