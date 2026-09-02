import { createParamDecorator } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";

import type { AuthenticatedRequestUser } from "../interfaces/request-context.interface.js";

export const CurrentUser = createParamDecorator((data: keyof AuthenticatedRequestUser | undefined, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<{ user?: AuthenticatedRequestUser }>();
  const user = request.user;
  return data && user ? user[data] : user;
});
