import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { PrismaService } from "../../prisma/prisma.service.js";
import { REQUIRED_FEATURES_KEY } from "../decorators/require-feature.decorator.js";
import type { AuthenticatedRequest } from "../interfaces/request-context.interface.js";

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeatures = this.reflector.getAllAndOverride<string[]>(REQUIRED_FEATURES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredFeatures?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const currentUser = request.user;
    if (!currentUser?.workspaceId) {
      return false;
    }

    const entitlements = await this.prisma.entitlement.findMany({
      where: {
        tenantId: currentUser.tenantId,
        companyId: currentUser.companyId,
        workspaceId: currentUser.workspaceId,
        featureKey: {
          in: requiredFeatures,
        },
        enabled: true,
      },
    });

    const grantedFeatures = new Set(entitlements.map((entitlement) => entitlement.featureKey));
    return requiredFeatures.every((feature) => grantedFeatures.has(feature));
  }
}
