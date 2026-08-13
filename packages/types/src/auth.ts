import type { Permission } from "./permissions";

export interface AuthUser {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  roleName: string;
  permissions: Permission[];
}

export interface JwtPayload {
  sub: string;
  organizationId: string;
  email: string;
  roleId: string;
  type: "access" | "refresh";
  jti: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface LoginResult {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}
