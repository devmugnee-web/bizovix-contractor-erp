import { Inject, Injectable } from "@nestjs/common";

import type { AuthenticatedRequestUser } from "../interfaces/request-context.interface.js";
import { PrismaService } from "../../prisma/prisma.service.js";

export type PermissionScope = "full" | "own" | "none";

/**
 * PermissionGuard can only answer "does this user have permission key X" —
 * it has no way to express "yes, but only for records they created" or to
 * hand that distinction back to the controller/service. Fine-grained
 * resources (vouchers, parties, items) need exactly that second case, so
 * this service duplicates the guard's grant lookup and adds the "own vs
 * full vs none" resolution those endpoints check for themselves.
 */
@Injectable()
export class PermissionsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getGrantedKeys(currentUser: AuthenticatedRequestUser): Promise<Set<string>> {
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
              include: { permission: true },
            },
          },
        },
      },
    });

    return new Set(
      assignments.flatMap((assignment) =>
        assignment.role.permissions.filter((link) => link.allowed).map((link) => link.permission.key),
      ),
    );
  }

  /** "full" = every record, "own" = only records this user created, "none" = no access. */
  resolveScope(granted: Set<string>, resource: string, action: "view" | "edit" | "share" | "delete"): PermissionScope {
    if (granted.has(`${resource}.${action}`)) {
      return "full";
    }
    if (granted.has(`${resource}.${action}.own`)) {
      return "own";
    }
    return "none";
  }
}
