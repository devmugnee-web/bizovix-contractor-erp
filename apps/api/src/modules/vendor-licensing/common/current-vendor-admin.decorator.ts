import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { VendorAdminAuthUser } from "./vendor-admin-jwt.strategy";

export const CurrentVendorAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): VendorAdminAuthUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
