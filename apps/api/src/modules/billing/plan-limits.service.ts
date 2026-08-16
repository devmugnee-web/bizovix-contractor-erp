import { ForbiddenException, Injectable } from "@nestjs/common";
import { BillingService } from "./billing.service";

interface LimitCheck {
  allowed: boolean;
  message?: string;
}

/** Centralized plan-limit enforcement so limit checks live in one place instead
 * of being scattered across feature modules. Feature services call the
 * `assert*` methods before creating a record that counts against a plan limit. */
@Injectable()
export class PlanLimitsService {
  constructor(private readonly billing: BillingService) {}

  async canAddUser(org: string): Promise<LimitCheck> {
    const usage = await this.billing.getUsage(org);
    if (usage.users.limit == null) return { allowed: true };
    if (usage.users.used >= usage.users.limit)
      return { allowed: false, message: "You have reached the user limit for your current plan." };
    return { allowed: true };
  }

  async canCreateProject(org: string): Promise<LimitCheck> {
    const usage = await this.billing.getUsage(org);
    if (usage.projects.limit == null) return { allowed: true };
    if (usage.projects.used >= usage.projects.limit)
      return { allowed: false, message: "You have reached the project limit for your current plan." };
    return { allowed: true };
  }

  async canUploadFile(org: string, sizeBytes: number): Promise<LimitCheck> {
    const usage = await this.billing.getUsage(org);
    if (usage.storage.limitMb == null) return { allowed: true };
    const projectedMb = usage.storage.usedMb + sizeBytes / (1024 * 1024);
    if (projectedMb > usage.storage.limitMb)
      return { allowed: false, message: "You have reached the storage limit for your current plan." };
    return { allowed: true };
  }

  async hasFeature(org: string, featureKey: string): Promise<boolean> {
    const sub = await this.billing.getSubscription(org);
    return sub.plan?.features?.includes(featureKey) ?? false;
  }

  async assertCanAddUser(org: string) {
    const check = await this.canAddUser(org);
    if (!check.allowed) throw new ForbiddenException(check.message);
  }

  async assertCanCreateProject(org: string) {
    const check = await this.canCreateProject(org);
    if (!check.allowed) throw new ForbiddenException(check.message);
  }

  async assertCanUploadFile(org: string, sizeBytes: number) {
    const check = await this.canUploadFile(org, sizeBytes);
    if (!check.allowed) throw new ForbiddenException(check.message);
  }
}
