import type { Prisma } from "@bizovix/database";

export const tenderPaSelect = {
  id: true,
  paName: true,
  paDesignation: true,
  paPhone: true,
  paAddress: true,
} as const;

export function tenderPaContact(tender: {
  id: string; paName: string | null; paDesignation: string | null;
  paPhone: string | null; paAddress: string | null;
} | null | undefined) {
  if (!tender || ![tender.paName, tender.paDesignation, tender.paPhone, tender.paAddress].some(Boolean)) return null;
  return {
    id: tender.id, name: tender.paName ?? "", designation: tender.paDesignation ?? "",
    mobile: tender.paPhone ?? "", address: tender.paAddress ?? "", email: "",
  };
}

export function readPaSnapshot(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (!["id", "name", "designation", "mobile", "address"].every((key) => typeof value[key] === "string")) return null;
  return {
    id: String(value.id), name: String(value.name), designation: String(value.designation),
    mobile: String(value.mobile), address: String(value.address),
    email: typeof value.email === "string" ? value.email : null,
  };
}
