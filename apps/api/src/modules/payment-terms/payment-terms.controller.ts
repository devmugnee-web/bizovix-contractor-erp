import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { PaymentTermsService } from "./payment-terms.service";
import { SavePaymentTermDto } from "./dto/save-payment-term.dto";

@Controller("payment-terms")
export class PaymentTermsController {
  constructor(private readonly paymentTermsService: PaymentTermsService) {}

  @Get()
  @RequirePermissions("masters.read")
  findAll(@CurrentUser() user: AuthUser) {
    return this.paymentTermsService.findAll(user.organizationId);
  }

  @Post()
  @RequirePermissions("payment_terms.manage")
  @ResponseMessage("Payment Term created successfully")
  create(@Body() dto: SavePaymentTermDto, @CurrentUser() user: AuthUser) {
    return this.paymentTermsService.create(user.organizationId, user.id, dto);
  }

  @Patch(":id")
  @RequirePermissions("payment_terms.manage")
  @ResponseMessage("Payment Term updated successfully")
  update(@Param("id") id: string, @Body() dto: SavePaymentTermDto, @CurrentUser() user: AuthUser) {
    return this.paymentTermsService.update(user.organizationId, user.id, id, dto);
  }
}
