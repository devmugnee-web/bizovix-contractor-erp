import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { PrismaService } from "../../prisma/prisma.service.js";
import { REQUIRED_PERMISSIONS_KEY } from "../decorators/require-permission.decorator.js";
import type { AuthenticatedRequest } from "../interfaces/request-context.interface.js";

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const currentUser = request.user;
    if (!currentUser) {
      return false;
    }

    const assignments = await this.prisma.userRole.findMany({
      where: {
        userId: currentUser.id,
        tenantId: currentUser.tenantId,
        OR: [{ workspaceId: currentUser.workspaceId }, { workspaceId: null }],
      },
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });

    const grantedPermissions = new Set(
      assignments.flatMap((assignment) =>
        assignment.role.permissions.filter((permissionLink) => permissionLink.allowed).map((permissionLink) => permissionLink.permission.key),
      ),
    );

    return requiredPermissions.every((permission) => grantedPermissions.has(permission));
  }
}
