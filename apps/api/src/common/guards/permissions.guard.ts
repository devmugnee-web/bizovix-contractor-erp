import { ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { CanActivate } from "@nestjs/common/interfaces";
import { Reflector } from "@nestjs/core";
import type { AuthUser, Permission } from "@bizovix/types";
import { PERMISSIONS_KEY } from "../decorators/require-permissions.decorator";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: AuthUser | undefined = request.user;
    if (!user) {
      throw new ForbiddenException("Not authenticated");
    }

    const hasAll = required.every((permission) => user.permissions.includes(permission));
    if (!hasAll) {
      throw new ForbiddenException("You do not have permission to perform this action");
    }

    return true;
  }
}
