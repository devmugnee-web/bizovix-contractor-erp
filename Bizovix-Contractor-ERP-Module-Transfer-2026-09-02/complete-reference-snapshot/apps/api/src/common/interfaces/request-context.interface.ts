import type { User } from "../../generated/prisma/index.js";
import type { Request } from "express";

export interface AuthenticatedRequestUser {
  id: string;
  email: string;
  name: string;
  initials: string;
  tenantId: string;
  organizationId: string;
  companyId: string;
  workspaceId: string | null;
  sessionId: string;
}

export interface AuthenticatedRequest extends Request {
  requestId?: string;
  user?: AuthenticatedRequestUser;
}

export function toUserProfile(user: Pick<User, "id" | "name" | "email" | "initials">, role: string) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role,
    initials: user.initials,
  };
}
