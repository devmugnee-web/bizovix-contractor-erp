"use client";

export type BusinessWorkspaceTemplateCode = "TRADING" | "TENDER" | "RENTAL" | "SERVICE";

export interface BusinessWorkspaceTemplate {
  code: BusinessWorkspaceTemplateCode;
  businessType: string;
  businessCategory: string;
  industry: string;
  workspaceName: string;
  workspaceSlug: string;
  summary: string;
  checkoutHint: string;
}

function normalizeLookup(value: string) {
  return value.trim().toLowerCase();
}

export const businessWorkspaceTemplates: BusinessWorkspaceTemplate[] = [
  {
    code: "TRADING",
    businessType: "Trading",
    businessCategory: "Retail & Distribution",
    industry: "Trading",
    workspaceName: "Trading Division",
    workspaceSlug: "trading-division",
    summary: "Ready for purchase, sales, stock, receivable, payable, and daily accounting flow.",
    checkoutHint: "Best for stores, distributors, wholesalers, and retail operations.",
  },
  {
    code: "TENDER",
    businessType: "Tender",
    businessCategory: "Tender & Government Supply",
    industry: "Tender and Government Supply",
    workspaceName: "Tender Division",
    workspaceSlug: "tender-division",
    summary: "Prepared for quotation-heavy, tender-driven, and supply contract operations.",
    checkoutHint: "Best for contractors, suppliers, and government procurement businesses.",
  },
  {
    code: "RENTAL",
    businessType: "Rental",
    businessCategory: "Equipment Rental",
    industry: "Equipment Rental",
    workspaceName: "Rental Division",
    workspaceSlug: "rental-division",
    summary: "Keeps rental activity, asset usage, and service-linked revenue in a separate workspace.",
    checkoutHint: "Best for machine, vehicle, and equipment rental businesses.",
  },
  {
    code: "SERVICE",
    businessType: "Service",
    businessCategory: "Service Operations",
    industry: "Service Company",
    workspaceName: "Service Division",
    workspaceSlug: "service-division",
    summary: "Organized for service delivery, billing, collections, and service-side reporting.",
    checkoutHint: "Best for agencies, workshops, maintenance teams, and service providers.",
  },
];

export const businessTypeOptions = businessWorkspaceTemplates.map((template) => template.businessType);

export const businessCategoryOptions = Array.from(
  new Set(businessWorkspaceTemplates.map((template) => template.businessCategory)),
);

export function getBusinessWorkspaceTemplate(code: BusinessWorkspaceTemplateCode) {
  return businessWorkspaceTemplates.find((template) => template.code === code) ?? null;
}

export function findBusinessWorkspaceTemplateByIndustry(industry: string) {
  const lookup = normalizeLookup(industry);
  return businessWorkspaceTemplates.find((template) => normalizeLookup(template.industry) === lookup) ?? null;
}

export function findBusinessWorkspaceTemplateByBusinessType(businessType: string) {
  const lookup = normalizeLookup(businessType);
  return businessWorkspaceTemplates.find((template) => normalizeLookup(template.businessType) === lookup) ?? null;
}
