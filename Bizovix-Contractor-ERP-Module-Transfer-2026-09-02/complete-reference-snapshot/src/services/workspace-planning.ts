"use client";

import { getBusinessWorkspaceTemplate, type BusinessWorkspaceTemplateCode, findBusinessWorkspaceTemplateByIndustry } from "@/config/business-workspaces";
import { formatDate } from "@/lib/format";
import { readDataset, writeDataset } from "@/services/browser-dataset";
import { readCompanyProfile, writeCompanyProfile } from "@/services/company-profile";
import type { DataMode, Workspace } from "@/types/domain";

export interface WorkspacePlanningSelection {
  workspaceId: string | null;
  templateCode: BusinessWorkspaceTemplateCode | null;
}

const STORAGE_PREFIX = "bizovix:workspace-planning";

function getStorageKey(mode: DataMode) {
  return `${STORAGE_PREFIX}:${mode}`;
}

function buildWorkspacePeriods() {
  const now = new Date();
  const openStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const openEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const fiscalYearStartMonth = 6;
  const fiscalStartYear = now.getMonth() >= fiscalYearStartMonth ? now.getFullYear() : now.getFullYear() - 1;
  const fiscalStart = new Date(fiscalStartYear, fiscalYearStartMonth, 1);
  const fiscalEnd = new Date(fiscalStartYear + 1, fiscalYearStartMonth, 0);

  return {
    openPeriod: `${formatDate(openStart)} - ${formatDate(openEnd)}`,
    financialYear: `${formatDate(fiscalStart)} - ${formatDate(fiscalEnd)}`,
  };
}

function buildWorkspaceId(templateCode: BusinessWorkspaceTemplateCode) {
  return `ws-${templateCode.toLowerCase()}-${Date.now()}`;
}

function normalizeSelection(raw: unknown): WorkspacePlanningSelection {
  const parsed = (raw ?? {}) as Partial<WorkspacePlanningSelection>;

  return {
    workspaceId: typeof parsed.workspaceId === "string" && parsed.workspaceId ? parsed.workspaceId : null,
    templateCode: parsed.templateCode ?? null,
  };
}

export function readWorkspacePlanningSelection(mode: DataMode) {
  if (typeof window === "undefined") {
    return { workspaceId: null, templateCode: null };
  }

  const raw = window.localStorage.getItem(getStorageKey(mode));
  if (!raw) {
    return { workspaceId: null, templateCode: null };
  }

  try {
    return normalizeSelection(JSON.parse(raw));
  } catch {
    return { workspaceId: null, templateCode: null };
  }
}

export function writeWorkspacePlanningSelection(mode: DataMode, selection: WorkspacePlanningSelection) {
  if (typeof window === "undefined") {
    return selection;
  }

  const normalized = normalizeSelection(selection);
  window.localStorage.setItem(getStorageKey(mode), JSON.stringify(normalized));
  return normalized;
}

export function findTemplateWorkspace(workspaces: Workspace[], templateCode: BusinessWorkspaceTemplateCode) {
  const template = getBusinessWorkspaceTemplate(templateCode);
  if (!template) {
    return null;
  }

  return (
    workspaces.find((workspace) => workspace.slug === template.workspaceSlug) ??
    workspaces.find((workspace) => workspace.name === template.workspaceName) ??
    workspaces.find((workspace) => workspace.industry === template.industry) ??
    null
  );
}

export async function ensureWorkspaceForBusinessType(mode: DataMode, templateCode: BusinessWorkspaceTemplateCode) {
  if (mode === "api") {
    throw new Error("Plans page workspace provisioning for live API mode is not wired yet");
  }

  const template = getBusinessWorkspaceTemplate(templateCode);
  if (!template) {
    throw new Error("Selected business workspace template is not available");
  }

  const dataset = readDataset(mode);
  const existingWorkspace = findTemplateWorkspace(dataset.workspaces, templateCode);
  if (existingWorkspace) {
    writeWorkspacePlanningSelection(mode, {
      workspaceId: existingWorkspace.id,
      templateCode,
    });
    return {
      workspace: existingWorkspace,
      created: false,
    };
  }

  const periods = buildWorkspacePeriods();
  const workspace: Workspace = {
    id: buildWorkspaceId(templateCode),
    slug: template.workspaceSlug,
    name: template.workspaceName,
    industry: template.industry,
    openPeriod: periods.openPeriod,
    financialYear: periods.financialYear,
  };

  dataset.workspaces = [...dataset.workspaces, workspace];
  writeDataset(mode, dataset);

  const profile = readCompanyProfile(mode, workspace.id);
  writeCompanyProfile(mode, workspace.id, {
    ...profile,
    businessType: template.businessType,
    businessCategory: template.businessCategory,
  });

  writeWorkspacePlanningSelection(mode, {
    workspaceId: workspace.id,
    templateCode,
  });

  return {
    workspace,
    created: true,
  };
}

export function inferWorkspaceTemplateCode(workspaces: Workspace[], workspaceId: string | null | undefined) {
  if (!workspaceId) {
    return null;
  }

  const workspace = workspaces.find((entry) => entry.id === workspaceId);
  if (!workspace) {
    return null;
  }

  return findBusinessWorkspaceTemplateByIndustry(workspace.industry)?.code ?? null;
}

