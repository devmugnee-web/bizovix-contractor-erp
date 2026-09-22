import { createPrivateKey, sign } from "crypto";
import { ServiceUnavailableException } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";

/** Shared wire rule: recursively sorted object keys, array order preserved. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

export function createDesktopOfflineGrant(user: AuthUser, deviceId: string, now = new Date()) {
  const pem = process.env.DESKTOP_SYNC_PRIVATE_KEY_PEM;
  const issuer = process.env.DESKTOP_SYNC_ISSUER;
  const hours = Number(process.env.DESKTOP_SYNC_OFFLINE_HOURS ?? "24");
  if (!pem || !issuer || !Number.isInteger(hours) || hours < 1 || hours > 168) {
    throw new ServiceUnavailableException("Desktop offline signing is not configured");
  }
  let key: ReturnType<typeof createPrivateKey>;
  try {
    key = createPrivateKey(pem.replace(/\\n/g, "\n"));
    if (key.asymmetricKeyType !== "ed25519") throw new Error("Unsupported signing key");
  } catch {
    throw new ServiceUnavailableException("Desktop offline signing key is invalid");
  }
  // Organization typeahead/create are available to every authenticated member;
  // the separate paginated Masters view requires masters.read.
  const capabilities: string[] = ["organizationMaster.read", "organizationMaster.create"];
  if (user.permissions.includes("masters.read")) {
    capabilities.push("organizationMaster.list");
    if (user.permissions.includes("vendor.create")) capabilities.push("masterCategory.create");
    if (user.permissions.includes("vendor.update")) capabilities.push("masterCategory.update");
    capabilities.push("uom.read", "paymentTerm.read");
    if (user.permissions.includes("uom.manage")) capabilities.push("uom.create", "uom.update");
    if (user.permissions.includes("payment_terms.manage")) capabilities.push("paymentTerm.create", "paymentTerm.update");
  }
  const payload = {
    formatVersion: 1 as const, issuer, audience: "bizovix-desktop" as const,
    deviceId, organizationId: user.organizationId, userId: user.id,
    user, permissions: [...user.permissions], capabilities,
    issuedAt: now.toISOString(), expiresAt: new Date(now.getTime() + hours * 3_600_000).toISOString(),
  };
  return { payload, signature: sign(null, Buffer.from(canonicalJson(payload), "utf8"), key).toString("base64url") };
}
