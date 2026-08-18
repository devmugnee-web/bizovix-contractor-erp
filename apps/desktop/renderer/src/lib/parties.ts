import type { StatusBadgeTone } from "@bizovix/ui";
import type { PartyRole, PartyStatus } from "@bizovix/types";

export const PARTY_STATUS_META: Record<PartyStatus, { label: string; tone: StatusBadgeTone }> = {
  ACTIVE: { label: "Active", tone: "success" },
  INACTIVE: { label: "Inactive", tone: "neutral" },
  SUSPENDED: { label: "Suspended", tone: "warning" },
  BLACKLISTED: { label: "Blacklisted", tone: "danger" },
  ARCHIVED: { label: "Archived", tone: "neutral" },
};

export const PARTY_STATUS_OPTIONS: { label: string; value: PartyStatus }[] = (Object.keys(PARTY_STATUS_META) as PartyStatus[]).map((value) => ({
  value,
  label: PARTY_STATUS_META[value].label,
}));

export const PARTY_ROLE_META: Record<PartyRole, string> = {
  CLIENT: "Client",
  VENDOR: "Vendor",
  SUPPLIER: "Supplier",
  SUBCONTRACTOR: "Subcontractor",
  SERVICE_PROVIDER: "Service Provider",
  OTHER: "Other",
};

/** Client isn't offered here — that role belongs to OrganizationMaster (the tender/contract
 * issuing side), not this payee-side Party master. */
export const PAYEE_PARTY_ROLE_OPTIONS: { label: string; value: PartyRole }[] = (
  ["VENDOR", "SUPPLIER", "SUBCONTRACTOR", "SERVICE_PROVIDER", "OTHER"] as PartyRole[]
).map((value) => ({ value, label: PARTY_ROLE_META[value] }));

export function partyRolesLabel(roles: PartyRole[]): string {
  return roles.map((role) => PARTY_ROLE_META[role]).join(", ") || "—";
}

export const CONTACT_ROLE_OPTIONS = ["Primary", "Accounts", "Sales", "Technical"];
