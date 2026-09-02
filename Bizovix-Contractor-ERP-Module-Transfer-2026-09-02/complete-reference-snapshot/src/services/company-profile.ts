"use client";

import { appConfig } from "@/config/app";
import { findBusinessWorkspaceTemplateByIndustry } from "@/config/business-workspaces";
import { readDataset } from "@/services/browser-dataset";
import type { DataMode } from "@/types/domain";

export interface CompanyProfileSnapshot {
  companyName: string;
  phoneNumber: string;
  emailAddress: string;
  businessType: string;
  businessCategory: string;
  businessAddress: string;
  pincode: string;
  booksBeginningDate: string;
  logoDataUrl: string | null;
  invoicePadDataUrl: string | null;
  signatureDataUrl: string | null;
}

const STORAGE_PREFIX = "bizovix:company-profile";
export const COMPANY_PROFILE_UPDATED_EVENT = "bizovix:company-profile-updated";

export const defaultCompanyProfile: CompanyProfileSnapshot = {
  companyName: appConfig.companyName,
  phoneNumber: "+880 1700 000000",
  emailAddress: "hello@bizovix.com",
  businessType: "Retail",
  businessCategory: "Retail & Distribution",
  businessAddress: "12 Lake View Road, Dhaka 1212",
  pincode: "1212",
  booksBeginningDate: "2026-07-15",
  logoDataUrl: null,
  invoicePadDataUrl: null,
  signatureDataUrl: null,
};

function getStorageKey(mode: DataMode, workspaceId: string) {
  return `${STORAGE_PREFIX}:${mode}:${workspaceId}`;
}

function getWorkspaceScopedDefaults(mode: DataMode, workspaceId: string) {
  if (typeof window === "undefined" || mode === "api") {
    return defaultCompanyProfile;
  }

  const workspace = readDataset(mode).workspaces.find((entry) => entry.id === workspaceId);
  const template = workspace ? findBusinessWorkspaceTemplateByIndustry(workspace.industry) : null;

  if (!template) {
    return defaultCompanyProfile;
  }

  return {
    ...defaultCompanyProfile,
    businessType: template.businessType,
    businessCategory: template.businessCategory,
  };
}

function normalizeCompanyProfile(raw: unknown, defaults: CompanyProfileSnapshot): CompanyProfileSnapshot {
  const parsed = (raw ?? {}) as Partial<CompanyProfileSnapshot>;

  return {
    companyName: parsed.companyName ?? defaults.companyName,
    phoneNumber: parsed.phoneNumber ?? defaults.phoneNumber,
    emailAddress: parsed.emailAddress ?? defaults.emailAddress,
    businessType: parsed.businessType ?? defaults.businessType,
    businessCategory: parsed.businessCategory ?? defaults.businessCategory,
    businessAddress: parsed.businessAddress ?? defaults.businessAddress,
    pincode: parsed.pincode ?? defaults.pincode,
    booksBeginningDate: parsed.booksBeginningDate ?? defaults.booksBeginningDate,
    logoDataUrl: parsed.logoDataUrl ?? defaults.logoDataUrl,
    invoicePadDataUrl: parsed.invoicePadDataUrl ?? defaults.invoicePadDataUrl,
    signatureDataUrl: parsed.signatureDataUrl ?? defaults.signatureDataUrl,
  };
}

export function readCompanyProfile(mode: DataMode, workspaceId: string) {
  const scopedDefaults = getWorkspaceScopedDefaults(mode, workspaceId);

  if (typeof window === "undefined") {
    return scopedDefaults;
  }

  const storageKey = getStorageKey(mode, workspaceId);
  const raw = window.localStorage.getItem(storageKey);

  if (!raw) {
    window.localStorage.setItem(storageKey, JSON.stringify(scopedDefaults));
    return scopedDefaults;
  }

  try {
    const normalized = normalizeCompanyProfile(JSON.parse(raw), scopedDefaults);
    window.localStorage.setItem(storageKey, JSON.stringify(normalized));
    return normalized;
  } catch {
    window.localStorage.setItem(storageKey, JSON.stringify(scopedDefaults));
    return scopedDefaults;
  }
}

export function writeCompanyProfile(mode: DataMode, workspaceId: string, snapshot: CompanyProfileSnapshot) {
  if (typeof window === "undefined") {
    return snapshot;
  }

  const normalized = normalizeCompanyProfile(snapshot, getWorkspaceScopedDefaults(mode, workspaceId));
  window.localStorage.setItem(getStorageKey(mode, workspaceId), JSON.stringify(normalized));
  window.dispatchEvent(
    new CustomEvent(COMPANY_PROFILE_UPDATED_EVENT, {
      detail: { mode, workspaceId, profile: normalized },
    }),
  );
  return normalized;
}

