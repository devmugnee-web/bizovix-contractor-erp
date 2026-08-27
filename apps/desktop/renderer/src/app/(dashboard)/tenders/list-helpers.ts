// Source / Priority / Next Follow Up have no backend field yet on TenderRecord
// (see packages/types/src/tender.ts). Values here are derived deterministically
// from the tender id so they stay stable across re-renders and pagination
// instead of re-randomizing on every render, and reuse the same mock
// vocabulary already established on the Tender Management dashboard
// (tender-management/mock-data.ts) for consistency across the two pages.

import type { StatusBadgeTone } from "@bizovix/ui";
import { TEAM_MEMBERS, type Priority } from "@/app/(dashboard)/tender-management/mock-data";

export type { Priority };

const SOURCES = ["e-GP Portal", "Email", "Direct Contact", "Newspaper"] as const;
export type TenderSource = (typeof SOURCES)[number];
export const SOURCE_OPTIONS = SOURCES.map((s) => ({ label: s, value: s }));

const PRIORITIES: Priority[] = ["High", "Medium", "Low"];
export const PRIORITY_OPTIONS = PRIORITIES.map((p) => ({ label: p, value: p }));

export const PRIORITY_TONE: Record<Priority, StatusBadgeTone> = {
  High: "danger",
  Medium: "warning",
  Low: "neutral",
};

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function tenderSource(tenderId: string): TenderSource {
  return SOURCES[hashString(tenderId) % SOURCES.length]!;
}

export function tenderPriority(tenderId: string): Priority {
  return PRIORITIES[hashString(`${tenderId}-priority`) % PRIORITIES.length]!;
}

export function tenderNextFollowUp(tender: {
  id: string;
  openingDate: string | null;
  submissionDeadline: string | null;
  createdAt: string;
}): string | null {
  const base = tender.openingDate ?? tender.submissionDeadline ?? tender.createdAt;
  if (!base) return null;
  const days = 3 + (hashString(`${tender.id}-followup`) % 12);
  const date = new Date(base);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export interface TenderAvatar {
  initial: string;
  color: string;
  name: string;
}

const AVATAR_PALETTE = ["#2563EB", "#F97316", "#64748B", "#DB2777", "#DC2626", "#059669", "#7C3AED", "#0891B2"];

export function avatarForAssignee(name: string | null | undefined): TenderAvatar {
  const label = name?.trim() || "Unassigned";
  const known = TEAM_MEMBERS.find((member) => member.name === label);
  if (known) return { initial: known.initial, color: known.color, name: known.name };
  const initial =
    label
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join("") || "?";
  const color = AVATAR_PALETTE[hashString(label) % AVATAR_PALETTE.length]!;
  return { initial, color, name: label };
}
