import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { SubscriptionStatus } from "../../generated/prisma/index.js";

import { PrismaService } from "../../prisma/prisma.service.js";
import { REQUIRE_ACTIVE_SUBSCRIPTION_KEY } from "../decorators/require-active-subscription.decorator.js";
import type { AuthenticatedRequest } from "../interfaces/request-context.interface.js";

const activeStatuses: SubscriptionStatus[] = [
  SubscriptionStatus.FREE_ACTIVE,
  SubscriptionStatus.FREE_EXPIRING,
  SubscriptionStatus.PAID_ACTIVE,
  SubscriptionStatus.PAYMENT_DUE,
];

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiresActiveSubscription = this.reflector.getAllAndOverride<boolean>(REQUIRE_ACTIVE_SUBSCRIPTION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiresActiveSubscription) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const currentUser = request.user;
    if (!currentUser?.workspaceId) {
      return false;
    }

    const subscription = await this.prisma.subscription.findFirst({
      where: {
        tenantId: currentUser.tenantId,
        companyId: currentUser.companyId,
        workspaceId: currentUser.workspaceId,
        status: {
          in: activeStatuses,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return Boolean(subscription);
  }
}
