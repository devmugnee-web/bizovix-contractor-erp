"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  CircleCheck,
  Copy,
  Minus,
  MoreVertical,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { ErrorPanel } from "@/components/shared/error-panel";
import { LoadingPanel } from "@/components/shared/loading-panel";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  businessWorkspaceTemplates,
  getBusinessWorkspaceTemplate,
  type BusinessWorkspaceTemplateCode,
} from "@/config/business-workspaces";
import { useSubscriptionQuery } from "@/hooks/use-app-query";
import { useSessionContext } from "@/hooks/use-session-context";
import { formatCurrency } from "@/lib/format";
import { roundMoney, sumMoney } from "@/lib/money";
import { getWorkspaceSubscriptionSnapshot } from "@/lib/workspace-subscription";
import { cn } from "@/lib/utils";
import { readDataset } from "@/services/browser-dataset";
import { purchaseSubscription } from "@/services/subscription.service";
import {
  ensureWorkspaceForBusinessType,
  inferWorkspaceTemplateCode,
  readWorkspacePlanningSelection,
  writeWorkspacePlanningSelection,
} from "@/services/workspace-planning";
import { listWorkspaces, selectWorkspace } from "@/services/workspace.service";
import { useSessionStore } from "@/stores/session-store";
import type { SubscriptionPlanSummary } from "@/types/domain";

type BillingTerm = "yearly" | "three-year";
type DeviceType = "desktop" | "mobile" | "desktop-mobile";
type VisibleOffer = {
  alias: "Gold" | "Platinum";
  plan: SubscriptionPlanSummary;
  accent: "gold" | "platinum";
  tagline: string;
  monthlyPrice: number;
};

type PurchaseDraft = {
  planCode: string;
  desktopQuantity: number;
  desktopBillingTerm: BillingTerm;
  mobileQuantity: number;
  mobileBillingTerm: BillingTerm;
  note: string;
};

type FeatureMatrixRow = {
  label: string;
  gold: boolean | string;
  platinum: boolean | string;
};

const FEATURE_ROWS: FeatureMatrixRow[] = [
  // { label: "Bizovix POS Billing", gold: false, platinum: true },
  { label: "Manage godowns & Transfer stock", gold: false, platinum: true },
  { label: "Loyalty Points", gold: false, platinum: true },
  { label: "Custom Label Printing", gold: false, platinum: true },
  { label: "Marketing Tools", gold: false, platinum: true },
  { label: "Create your own online store", gold: true, platinum: true },
  { label: "Send Bulk WhatsApp Messages", gold: false, platinum: true },
  { label: "Manufacturing Transactions", gold: false, platinum: true },
  { label: "Create multiple companies", gold: "5 companies", platinum: "Unlimited" },
  { label: "Barcode label batch export", gold: true, platinum: true },
  { label: "Advanced party credit control", gold: true, platinum: true },
  { label: "Production bill of materials", gold: false, platinum: true },
  { label: "Role-wise approval routing", gold: false, platinum: true },
  { label: "Branch-wise performance view", gold: true, platinum: true },
  { label: "Cashflow forecasting", gold: true, platinum: true },
  { label: "Budget vs actual analysis", gold: false, platinum: true },
  { label: "Dedicated onboarding assistance", gold: false, platinum: true },
  { label: "Multi-workspace sync", gold: true, platinum: true },
  { label: "Document audit timeline", gold: true, platinum: true },
  { label: "Priority support", gold: false, platinum: true },
  { label: "API connectors", gold: false, platinum: true },
  { label: "Demo workspace cloning", gold: false, platinum: true },
  { label: "Advanced reconciliation", gold: true, platinum: true },
  { label: "Inventory reorder suggestions", gold: true, platinum: true },
  { label: "Dedicated success manager", gold: false, platinum: true },
];

const VISIBLE_FEATURE_COUNT = 12;
const BILLING_TERM_OPTIONS: Array<{ value: BillingTerm; label: string; months: number; discountMultiplier: number }> = [
  { value: "yearly", label: "1 Year", months: 12, discountMultiplier: 1 },
  { value: "three-year", label: "3 Years", months: 36, discountMultiplier: 1 },
];

const PLAN_MONTHLY_PRICES: Record<VisibleOffer["alias"], number> = {
  Gold: 1000,
  Platinum: 1200,
};
const MOBILE_APP_MONTHLY_ADDON = 350;

function parseCurrencyAmount(label: string) {
  const digits = label.replace(/[^\d.]/g, "");
  return digits ? Number(digits) : 0;
}

function formatMoney(value: number) {
  return formatCurrency(value);
}

function formatMonthlyMoney(value: number) {
  return formatCurrency(value);
}

function includesMobileApp(deviceType: DeviceType) {
  return deviceType === "mobile" || deviceType === "desktop-mobile";
}

function getOfferMonthlyPrice(offer: Pick<VisibleOffer, "monthlyPrice">, deviceType: DeviceType) {
  return offer.monthlyPrice + (includesMobileApp(deviceType) ? MOBILE_APP_MONTHLY_ADDON : 0);
}

function getBillingTermLabel(billingTerm: BillingTerm) {
  return BILLING_TERM_OPTIONS.find((option) => option.value === billingTerm)?.label ?? billingTerm;
}

function buildOffers(plans: SubscriptionPlanSummary[]): VisibleOffer[] {
  const goldPlan = plans.find((plan) => plan.code === "BUSINESS_MONTHLY") ?? plans[0];
  const platinumPlan = plans.find((plan) => plan.code === "PROFESSIONAL_MONTHLY") ?? plans.at(-1) ?? plans[0];

  return [
    {
      alias: "Gold",
      plan: goldPlan,
      accent: "gold",
      tagline: "Balanced controls for stores ready to move beyond basic accounting.",
      monthlyPrice: PLAN_MONTHLY_PRICES.Gold,
    },
    {
      alias: "Platinum",
      plan: platinumPlan,
      accent: "platinum",
      tagline: "Most complete pack for teams running multiple counters, branches, and approvals.",
      monthlyPrice: PLAN_MONTHLY_PRICES.Platinum,
    },
  ];
}

function getDisplayPrice(monthlyBase: number, billingTerm: BillingTerm) {
  const billingOption = BILLING_TERM_OPTIONS.find((option) => option.value === billingTerm) ?? BILLING_TERM_OPTIONS[0];
  const oldPrice = roundMoney(monthlyBase * billingOption.months);
  const discountedPrice = roundMoney(oldPrice * billingOption.discountMultiplier);
  const monthlyEquivalent = roundMoney(discountedPrice / billingOption.months);

  return {
    oldPriceLabel: oldPrice > discountedPrice ? formatMoney(oldPrice) : null,
    discountedPriceLabel: formatMoney(discountedPrice),
    monthlyEquivalentLabel: formatMoney(monthlyEquivalent),
  };
}

function renderFeatureValue(value: boolean | string) {
  const included = typeof value === "string" || Boolean(value);

  if (typeof value === "string") {
    return (
      <div className="flex flex-col items-center gap-1 text-center">
        <Check className="h-4 w-4 shrink-0 text-[#11b36b]" />
        <span className="text-xs font-medium leading-5 text-[#5f708a]">{value}</span>
      </div>
    );
  }

  return included ? <Check className="h-4 w-4 shrink-0 text-[#11b36b]" /> : <X className="h-4 w-4 shrink-0 text-[#ff7a8a]" />;
}

export function SubscriptionScreen() {
  const queryClient = useQueryClient();
  const { mode, session } = useSessionContext();
  const setWorkspace = useSessionStore((state) => state.setWorkspace);
  const [fallbackRevision, setFallbackRevision] = useState(0);
  const [appliedWorkspacePlanning, setAppliedWorkspacePlanning] = useState(() => readWorkspacePlanningSelection(mode));

  const [deviceType, setDeviceType] = useState<DeviceType>("desktop");
  const [billingTerm, setBillingTerm] = useState<BillingTerm>("yearly");
  const [compareOpen, setCompareOpen] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(appliedWorkspacePlanning.workspaceId);
  const [selectedTemplateCode, setSelectedTemplateCode] = useState<BusinessWorkspaceTemplateCode | null>(
    appliedWorkspacePlanning.templateCode,
  );
  const [draft, setDraft] = useState<PurchaseDraft>({
    planCode: "BUSINESS_MONTHLY",
    desktopQuantity: 1,
    desktopBillingTerm: "yearly",
    mobileQuantity: 0,
    mobileBillingTerm: "yearly",
    note: "",
  });
  const subscriptionWorkspaceId = session?.workspaceId ?? appliedWorkspacePlanning.workspaceId ?? null;
  const query = useSubscriptionQuery(mode, subscriptionWorkspaceId);

  const fallbackSnapshot = useMemo(
    () => getWorkspaceSubscriptionSnapshot(readDataset("mock"), subscriptionWorkspaceId),
    [fallbackRevision, subscriptionWorkspaceId],
  );
  const snapshot = query.data ?? fallbackSnapshot;
  const usingFallback = Boolean(query.error) && !query.data;
  const requestMode = usingFallback ? "mock" : mode;
  const workspacesQuery = useQuery({
    queryKey: [mode, "pricing-workspaces", fallbackRevision],
    queryFn: () => listWorkspaces(requestMode),
  });

  const workspaces = workspacesQuery.data ?? [];

  useEffect(() => {
    const planning = readWorkspacePlanningSelection(mode);
    setAppliedWorkspacePlanning(planning);
    setSelectedWorkspaceId(planning.workspaceId);
    setSelectedTemplateCode(planning.templateCode);
  }, [mode]);

  useEffect(() => {
    if (!workspaces.length) {
      return;
    }

    setSelectedWorkspaceId((current) => {
      if (current && workspaces.some((workspace) => workspace.id === current)) {
        return current;
      }

      if (appliedWorkspacePlanning.workspaceId && workspaces.some((workspace) => workspace.id === appliedWorkspacePlanning.workspaceId)) {
        return appliedWorkspacePlanning.workspaceId;
      }

      if (session?.workspaceId && workspaces.some((workspace) => workspace.id === session.workspaceId)) {
        return session.workspaceId;
      }

      return workspaces[0]?.id ?? null;
    });

    setSelectedTemplateCode((current) => {
      if (current) {
        return current;
      }

      if (appliedWorkspacePlanning.templateCode) {
        return appliedWorkspacePlanning.templateCode;
      }

      const inferredCode = inferWorkspaceTemplateCode(workspaces, session?.workspaceId ?? workspaces[0]?.id);
      return inferredCode ?? businessWorkspaceTemplates[0]?.code ?? null;
    });
  }, [appliedWorkspacePlanning.templateCode, appliedWorkspacePlanning.workspaceId, session?.workspaceId, workspaces]);

  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null,
    [selectedWorkspaceId, workspaces],
  );
  const activeWorkspaceId = session?.workspaceId ?? appliedWorkspacePlanning.workspaceId ?? null;
  const appliedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null,
    [activeWorkspaceId, workspaces],
  );
  const selectedTemplate = selectedTemplateCode ? getBusinessWorkspaceTemplate(selectedTemplateCode) : null;
  const activeTemplateCode =
    inferWorkspaceTemplateCode(workspaces, activeWorkspaceId) ?? appliedWorkspacePlanning.templateCode ?? null;
  const appliedTemplate = activeTemplateCode ? getBusinessWorkspaceTemplate(activeTemplateCode) : null;
  const checkoutWorkspace = selectedWorkspace ?? appliedWorkspace ?? null;
  const checkoutTemplate = selectedTemplate ?? appliedTemplate ?? null;
  const selectedWorkspaceLabel = checkoutWorkspace?.name ?? selectedTemplate?.workspaceName ?? "Select business workspace";
  const willCreateWorkspaceOnCheckout = Boolean(checkoutTemplate && !checkoutWorkspace);

  function applyWorkspacePlanning(workspaceId: string | null, templateCode: BusinessWorkspaceTemplateCode | null) {
    const nextPlanning = {
      workspaceId,
      templateCode,
    };

    setAppliedWorkspacePlanning(nextPlanning);
    setSelectedWorkspaceId(workspaceId);
    setSelectedTemplateCode(templateCode);
    writeWorkspacePlanningSelection(mode, nextPlanning);
  }

  async function ensureWorkspaceTargetReady(options?: { announce?: boolean }) {
    if (!selectedTemplate) {
      throw new Error("Select a business type first");
    }

    try {
      setWorkspaceBusy(true);

      if (selectedWorkspaceId) {
        await selectWorkspace(requestMode, selectedWorkspaceId);
        setWorkspace(mode, selectedWorkspaceId);
        applyWorkspacePlanning(selectedWorkspaceId, selectedTemplate.code);
        const chosenWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId);
        if (options?.announce) {
          toast.success(`${chosenWorkspace?.name ?? "Selected workspace"} ready for plan purchase`);
        }
        return chosenWorkspace ?? null;
      }

      const result = await ensureWorkspaceForBusinessType(requestMode, selectedTemplate.code);
      setWorkspace(mode, result.workspace.id);
      applyWorkspacePlanning(result.workspace.id, selectedTemplate.code);

      if (usingFallback) {
        setFallbackRevision((current) => current + 1);
      } else {
        await queryClient.invalidateQueries({ queryKey: [mode, "pricing-workspaces"] });
      }
      if (options?.announce ?? true) {
        toast.success(`${result.workspace.name} workspace created for plan purchase`);
      }
      return result.workspace;
    } catch (error) {
      throw error instanceof Error ? error : new Error("The selected business workspace could not be prepared");
    } finally {
      setWorkspaceBusy(false);
    }
  }

  async function openPurchaseDialog(planCode: string, minimumQuantity = 1) {
    try {
      await ensureWorkspaceTargetReady({ announce: willCreateWorkspaceOnCheckout });
      setDraft({
        planCode,
        desktopQuantity: deviceType === "mobile" ? 0 : Math.max(minimumQuantity, 1),
        desktopBillingTerm: billingTerm,
        mobileQuantity: includesMobileApp(deviceType) ? Math.max(minimumQuantity, 1) : 0,
        mobileBillingTerm: billingTerm,
        note: "",
      });
      setPurchaseOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Target workspace could not be prepared");
    }
  }

  const checkoutMutation = useMutation({
    mutationFn: (payload: PurchaseDraft) =>
      purchaseSubscription(requestMode, {
        planCode: payload.planCode,
        desktopQuantity: payload.desktopQuantity,
        desktopBillingTerm: payload.desktopBillingTerm,
        mobileQuantity: payload.mobileQuantity,
        mobileBillingTerm: payload.mobileBillingTerm,
        workspaceId: checkoutWorkspace?.id ?? "",
        workspaceName: checkoutWorkspace?.name ?? selectedWorkspaceLabel,
        businessType: checkoutTemplate?.businessType ?? "Business",
        businessCategory: checkoutTemplate?.businessCategory ?? "General",
        note: payload.note,
      }),
    onSuccess: async (_, payload) => {
      if (usingFallback) {
        setFallbackRevision((current) => current + 1);
      } else {
        await queryClient.invalidateQueries({ queryKey: [mode, "subscription"] });
      }
      setPurchaseOpen(false);
      const totalDevices = payload.desktopQuantity + payload.mobileQuantity;
      toast.success(
        `${totalDevices} ${totalDevices > 1 ? "devices" : "device"} activated for ${checkoutWorkspace?.name ?? "the selected workspace"}`,
      );
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Plan checkout could not be completed");
    },
  });

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const handleClose = () => setMenuOpen(false);
    window.addEventListener("click", handleClose);
    return () => window.removeEventListener("click", handleClose);
  }, [menuOpen]);

  const offers = useMemo(
    () => buildOffers(snapshot.plans.filter((plan) => plan.code === "BUSINESS_MONTHLY" || plan.code === "PROFESSIONAL_MONTHLY")),
    [snapshot],
  );
  const currentOffer = offers.find((offer) => offer.plan.code === draft.planCode) ?? offers[0];

  const purchaseSummary = useMemo(() => {
    if (!currentOffer) {
      return null;
    }

    const desktopPricing = getDisplayPrice(currentOffer.monthlyPrice, draft.desktopBillingTerm);
    const mobilePricing = getDisplayPrice(MOBILE_APP_MONTHLY_ADDON, draft.mobileBillingTerm);
    const desktopTotal = roundMoney(parseCurrencyAmount(desktopPricing.discountedPriceLabel) * draft.desktopQuantity);
    const mobileTotal = roundMoney(parseCurrencyAmount(mobilePricing.discountedPriceLabel) * draft.mobileQuantity);

    return {
      desktopMonthlyPriceLabel: formatMonthlyMoney(currentOffer.monthlyPrice),
      desktopTermPriceLabel: desktopPricing.discountedPriceLabel,
      desktopTotalLabel: formatMoney(desktopTotal),
      mobileMonthlyPriceLabel: formatMonthlyMoney(MOBILE_APP_MONTHLY_ADDON),
      mobileTermPriceLabel: mobilePricing.discountedPriceLabel,
      mobileTotalLabel: formatMoney(mobileTotal),
      totalLabel: formatMoney(sumMoney([desktopTotal, mobileTotal])),
    };
  }, [currentOffer, draft.desktopBillingTerm, draft.desktopQuantity, draft.mobileBillingTerm, draft.mobileQuantity]);

  if (query.isLoading || workspacesQuery.isLoading) {
    return <LoadingPanel lines={6} />;
  }

  if (!snapshot || workspacesQuery.error) {
    return (
      <ErrorPanel
        title="Plans & Pricing unavailable"
        description="The pricing catalog or workspace setup could not be loaded from the current data mode."
        onRetry={() => {
          void query.refetch();
          void workspacesQuery.refetch();
        }}
      />
    );
  }

  const hiddenFeatureCount = Math.max(0, FEATURE_ROWS.length - VISIBLE_FEATURE_COUNT);

  return (
    <>
      <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[18px] border border-[#d6e0ec] bg-white">
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[#d6e0ec] px-4 py-3">
          <h1 className="text-[1.65rem] font-semibold tracking-[-0.03em] text-[#223555]">Plans & Pricing</h1>
          <div className="relative flex items-center gap-3">
            <button
              type="button"
              className="inline-flex h-11 items-center rounded-full bg-[#f97316] px-6 text-[15px] font-semibold text-white transition hover:bg-[#ea580c]"
              onClick={() => {
                const defaultPlan = offers.find((offer) => offer.alias === "Platinum") ?? offers[0];
                if (!defaultPlan) {
                  return;
                }
                void openPurchaseDialog(defaultPlan.plan.code, 2);
              }}
            >
              Buy Multiple Licenses
            </button>
            <div className="h-8 w-px bg-[#d7e2ef]" />
            <div className="relative">
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#5d718c] transition hover:bg-[#f4f8fc]"
                onClick={(event) => {
                  event.stopPropagation();
                  setMenuOpen((current) => !current);
                }}
                aria-label="More pricing actions"
              >
                <MoreVertical className="h-5 w-5" />
              </button>
              {menuOpen ? (
                <div className="absolute right-0 top-12 z-20 min-w-[220px] rounded-2xl border border-[#d8e3ef] bg-white p-2 shadow-[0_18px_34px_rgba(15,23,42,0.12)]">
                  {[
                    {
                      label: "Refresh pricing",
                      action: () => {
                        void query.refetch();
                        toast.success("Pricing catalog refreshed");
                      },
                    },
                    {
                      label: "Copy current plan",
                      action: async () => {
                        await navigator.clipboard.writeText(snapshot.currentPlan.name);
                        toast.success("Current plan copied");
                      },
                    },
                    {
                      label: "Compare all features",
                      action: () => setCompareOpen(true),
                    },
                    {
                      label: "Contact sales",
                      action: () => toast.success("Sales callback request staged for this workspace"),
                    },
                  ].map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[#24364f] transition hover:bg-[#f7fbff]"
                      onClick={() => {
                        setMenuOpen(false);
                        void item.action();
                      }}
                    >
                      <Sparkles className="h-4 w-4 text-[#6993cf]" />
                      {item.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 bg-[radial-gradient(circle_at_top,#ffffff_0%,#ffffff_56%,#fdfefe_100%)] px-5 py-5 sm:px-8 lg:px-10">
          <div className="mx-auto flex h-full min-h-0 w-full max-w-[920px] flex-col">
            {usingFallback ? (
              <div className="mb-4 shrink-0 rounded-[16px] border border-[#ffe0a8] bg-[#fffaf1] px-4 py-3 text-sm text-[#8a5a1f]">
                Live pricing API is unavailable right now. Showing fallback pricing catalog so the full page and checkout flow still works.
              </div>
            ) : null}

            <div className="mb-5 flex shrink-0 flex-wrap items-center justify-center gap-3">
              <div className="relative">
                <select
                  value={deviceType}
                  onChange={(event) => setDeviceType(event.target.value as DeviceType)}
                  className="h-9 cursor-pointer appearance-none rounded-full bg-[#e7f2ff] px-5 pr-12 text-[15px] font-medium text-[#2b4060] outline-none"
                >
                  <option value="desktop">Desktop</option>
                  <option value="mobile">Mobile</option>
                  <option value="desktop-mobile">Desktop + Mobile</option>
                </select>
                <span className="pointer-events-none absolute inset-y-0 right-0 flex w-11 items-center justify-center text-[#6f83a2]">
                  <ChevronDown className="h-4 w-4" />
                </span>
              </div>
              <div className="relative">
                <select
                  value={billingTerm}
                  onChange={(event) => setBillingTerm(event.target.value as BillingTerm)}
                  className="h-9 cursor-pointer appearance-none rounded-full bg-[#e7f2ff] px-5 pr-12 text-[15px] font-medium text-[#2b4060] outline-none"
                >
                  {BILLING_TERM_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute inset-y-0 right-0 flex w-11 items-center justify-center text-[#6f83a2]">
                  <ChevronDown className="h-4 w-4" />
                </span>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 items-stretch gap-5 lg:grid-cols-2">
              {offers.map((offer) => {
                const offerMonthlyPrice = getOfferMonthlyPrice(offer, deviceType);
                const pricing = getDisplayPrice(offerMonthlyPrice, billingTerm);
                const accent =
                  offer.accent === "gold"
                    ? {
                        icon: "#f6aa23",
                        border: "#d4dde8",
                        button: "bg-[#f97316] text-white hover:bg-[#ea580c]",
                        shell: "bg-white",
                        header: "bg-white",
                      }
                    : {
                        icon: "#9d86f6",
                        border: "#ff9960",
                        button: "bg-[#f97316] text-white hover:bg-[#ea580c]",
                        shell: "bg-white",
                        header: "bg-[#f1eeff]",
                      };

                const visibleFeatures = FEATURE_ROWS.slice(0, VISIBLE_FEATURE_COUNT);
                const currentRequested = Boolean(selectedWorkspaceId && snapshot.upgradeRequest?.requestedPlanCode === offer.plan.code);
                const currentPlan = Boolean(selectedWorkspaceId && (snapshot.currentPlan.code === offer.plan.code || offer.plan.isCurrent));

                return (
                  <article
                    key={offer.alias}
                    className={cn(
                      "relative flex h-full min-h-0 flex-col overflow-hidden rounded-[16px] border shadow-[0_4px_0_rgba(15,23,42,0.02)]",
                      offer.accent === "platinum" ? "border-[3px]" : "border-[2px]",
                    )}
                    style={{ borderColor: accent.border }}
                  >
                    {offer.accent === "platinum" ? (
                      <div className="absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-full bg-[#ff6f74] px-4 py-1 text-xs font-semibold text-[#FFFFFF] shadow-[0_10px_18px_rgba(255,111,116,0.24)]">
                        Most Popular
                      </div>
                    ) : null}

                    <div className={cn("shrink-0 border-b border-[#dce5ef] px-5 py-4", offer.accent === "platinum" ? "pt-11" : "", accent.header)}>
                      <div className="flex items-center gap-3">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full text-white" style={{ backgroundColor: accent.icon }}>
                          <CircleCheck className="h-4 w-4" />
                        </span>
                        <h2 className="text-[1rem] font-semibold text-[#24365a]">{offer.alias}</h2>
                      </div>

                      <div className="mt-7 flex flex-wrap items-end gap-x-3 gap-y-1">
                        {pricing.oldPriceLabel ? (
                          <span className="text-[1.05rem] font-semibold text-[#8f9bb2] line-through">{pricing.oldPriceLabel}</span>
                        ) : null}
                        <span className="text-[1.8rem] font-semibold tracking-[-0.03em] text-[#2f3f63]">
                          {formatMonthlyMoney(offerMonthlyPrice)}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[0.95rem] font-medium text-[#32455f]">per month</div>
                      <div className="mt-1 text-xs font-medium text-[#6c7a93]">
                        {pricing.discountedPriceLabel} for {getBillingTermLabel(billingTerm)}
                      </div>
                      <p className="mt-2 max-w-[36ch] text-sm leading-5 text-[#62748f]">{offer.tagline}</p>

                      {!currentPlan ? (
                        <button
                          type="button"
                          className={cn("mt-4 inline-flex h-9 w-full items-center justify-center rounded-full text-[15px] font-semibold transition", accent.button)}
                          onClick={() => void openPurchaseDialog(offer.plan.code)}
                        >
                          {workspaceBusy ? "Preparing Workspace..." : `Buy ${offer.alias} Now`}
                        </button>
                      ) : null}
                      {currentRequested ? <div className="mt-3 text-sm font-medium text-[#f56740]">Upgrade request already submitted for this plan</div> : null}
                    </div>

                    <div className={cn("min-h-0 flex-1 px-5 py-3", accent.shell)}>
                      <div className="space-y-2">
                        {visibleFeatures.map((feature) => {
                          const value = offer.alias === "Gold" ? feature.gold : feature.platinum;
                          const included = typeof value === "string" || Boolean(value);
                          return (
                            <div key={feature.label} className="grid grid-cols-[16px_minmax(0,1fr)] items-start gap-3 text-[14px] text-[#344762]">
                              <span className="mt-0.5">
                                {included ? (
                                  <Check className="h-4 w-4 shrink-0 text-[#11b36b]" />
                                ) : (
                                  <X className="h-4 w-4 shrink-0 text-[#ff7a8a]" />
                                )}
                              </span>
                              <div className="min-w-0">
                                <div className="break-words leading-5">{feature.label}</div>
                                {typeof value === "string" ? (
                                  <div className="mt-0.5 text-[13px] font-medium text-[#6f7f97]">{value}</div>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <button
                        type="button"
                        className="mt-4 inline-flex items-center gap-2 text-[0.95rem] font-semibold text-[#2f3f63]"
                        onClick={() => setCompareOpen(true)}
                      >
                        + {hiddenFeatureCount} More Features
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="mt-4 flex shrink-0 justify-center">
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#fff1e8] px-8 text-[15px] font-semibold text-[#c45a11] transition hover:bg-[#ffe4d1]"
                onClick={() => setCompareOpen(true)}
              >
                <Sparkles className="h-4 w-4" />
                Compare Packages
              </button>
            </div>
          </div>
        </div>
      </section>

      <Dialog open={purchaseOpen} onOpenChange={setPurchaseOpen}>
        <DialogContent className="w-[min(94vw,760px)] p-0">
          <div className="border-b border-[#e2e8f0] px-6 py-5">
            <DialogTitle className="text-[1.3rem] font-semibold text-[#203250]">Plan Checkout</DialogTitle>
            <DialogDescription className="mt-1 text-sm text-[#60708a]">
              Finalize plan, licenses, and device preference. Completing checkout activates the selected SaaS plan for this workspace.
            </DialogDescription>
          </div>

          <div className="grid gap-6 px-6 py-6 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-5">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-[#304460]">Plan</span>
                <select
                  value={draft.planCode}
                  onChange={(event) => setDraft((current) => ({ ...current, planCode: event.target.value }))}
                  className="h-11 rounded-[12px] border border-[#d8e1ee] bg-white px-4 text-sm text-[#24365a] outline-none"
                >
                  {offers.map((offer) => (
                    <option key={offer.plan.code} value={offer.plan.code}>
                      {offer.alias}
                    </option>
                  ))}
                </select>
              </label>

              {(["desktop", "mobile"] as const).map((device) => {
                const isDesktop = device === "desktop";
                const quantityKey = isDesktop ? "desktopQuantity" : "mobileQuantity";
                const termKey = isDesktop ? "desktopBillingTerm" : "mobileBillingTerm";
                const quantity = draft[quantityKey];
                return (
                  <div key={device} className="rounded-[16px] border border-[#d8e1ee] bg-[#f8fbff] p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-[#24365a]">{isDesktop ? "Computer / Desktop" : "Mobile"}</div>
                        <div className="mt-0.5 text-xs text-[#73849d]">Select device count and usage duration</div>
                      </div>
                      <div className="inline-flex items-center rounded-full border border-[#d8e1ee] bg-white p-1">
                        <button
                          type="button"
                          aria-label={`Remove one ${device}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#405673] transition hover:bg-[#eef3f9]"
                          onClick={() => setDraft((current) => ({ ...current, [quantityKey]: Math.max(0, current[quantityKey] - 1) }))}
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <div className="min-w-[42px] text-center text-base font-semibold text-[#203250]">{quantity}</div>
                        <button
                          type="button"
                          aria-label={`Add one ${device}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#405673] transition hover:bg-[#eef3f9]"
                          onClick={() => setDraft((current) => ({ ...current, [quantityKey]: Math.min(99, current[quantityKey] + 1) }))}
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <label className="grid gap-1.5">
                      <span className="text-xs font-semibold text-[#60708a]">Usage duration</span>
                      <select
                        value={draft[termKey]}
                        disabled={quantity === 0}
                        onChange={(event) => setDraft((current) => ({ ...current, [termKey]: event.target.value as BillingTerm }))}
                        className="h-10 rounded-[10px] border border-[#d8e1ee] bg-white px-3 text-sm text-[#24365a] outline-none disabled:bg-[#eef2f7] disabled:text-[#9aa8ba]"
                      >
                        {BILLING_TERM_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                );
              })}

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-[#304460]">Internal Note</span>
                <textarea
                  value={draft.note}
                  onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
                  className="min-h-[112px] rounded-[14px] border border-[#d8e1ee] bg-white px-4 py-3 text-sm text-[#24365a] outline-none"
                  placeholder="Add operator note, preferred contact window, or rollout requirement"
                />
              </label>
            </div>

            <div className="rounded-[20px] border border-[#dce6f2] bg-[#fbfdff] p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8090a7]">Order Summary</div>
                  <div className="mt-2 text-[1.4rem] font-semibold text-[#223555]">{currentOffer?.alias ?? "Selected Plan"}</div>
                </div>
                <button
                  type="button"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#6b7f9f] shadow-sm transition hover:bg-[#f4f7fb]"
                  onClick={async () => {
                    if (!purchaseSummary || !currentOffer) {
                      return;
                    }
                    await navigator.clipboard.writeText(
                      `${currentOffer.alias} | ${selectedWorkspace?.name ?? "Workspace"} | Desktop: ${draft.desktopQuantity} (${getBillingTermLabel(draft.desktopBillingTerm)}) | Mobile: ${draft.mobileQuantity} (${getBillingTermLabel(draft.mobileBillingTerm)}) | ${purchaseSummary.totalLabel} payable`,
                    );
                    toast.success("Purchase summary copied");
                  }}
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-5 space-y-3 text-sm text-[#435770]">
                <div className="flex items-center justify-between">
                  <span>Workspace</span>
                  <span className="font-medium text-[#223555]">{selectedWorkspaceLabel}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Business Type</span>
                  <span className="font-medium text-[#223555]">{selectedTemplate?.businessType ?? "Not selected"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Category</span>
                  <span className="font-medium text-[#223555]">{selectedTemplate?.businessCategory ?? "Not selected"}</span>
                </div>
                <div className="rounded-[12px] border border-[#e2e8f0] bg-white p-3">
                  <div className="flex items-center justify-between font-medium text-[#223555]">
                    <span>Computers</span>
                    <span>{draft.desktopQuantity} × {getBillingTermLabel(draft.desktopBillingTerm)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span>{purchaseSummary?.desktopMonthlyPriceLabel ?? "-"}/month each</span>
                    <span>{purchaseSummary?.desktopTotalLabel ?? "-"}</span>
                  </div>
                </div>
                <div className="rounded-[12px] border border-[#e2e8f0] bg-white p-3">
                  <div className="flex items-center justify-between font-medium text-[#223555]">
                    <span>Mobiles</span>
                    <span>{draft.mobileQuantity} × {getBillingTermLabel(draft.mobileBillingTerm)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span>{purchaseSummary?.mobileMonthlyPriceLabel ?? "-"}/month each</span>
                    <span>{purchaseSummary?.mobileTotalLabel ?? "-"}</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-[16px] bg-white px-4 py-4 shadow-sm">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="text-sm text-[#60708a]">Payable Now</div>
                    <div className="mt-1 text-[1.9rem] font-semibold tracking-[-0.03em] text-[#223555]">{purchaseSummary?.totalLabel ?? "-"}</div>
                  </div>
                  <div className="rounded-full bg-[#eef5ff] px-3 py-1 text-xs font-semibold text-[#246ed1]">
                    Instant activation
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-full bg-[#f97316] px-5 text-sm font-semibold text-white transition hover:bg-[#ea580c] disabled:cursor-not-allowed disabled:bg-[#fdba74]"
                disabled={checkoutMutation.isPending || !currentOffer || workspaceBusy || draft.desktopQuantity + draft.mobileQuantity === 0}
                onClick={() => {
                  if (!currentOffer) {
                    return;
                  }
                  checkoutMutation.mutate(draft);
                }}
              >
                {checkoutMutation.isPending ? "Processing Checkout..." : `Buy ${currentOffer?.alias ?? ""} Plan`}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="w-[min(95vw,980px)] p-0">
          <div className="border-b border-[#e2e8f0] px-6 py-5">
            <DialogTitle className="text-[1.3rem] font-semibold text-[#203250]">Compare All Features</DialogTitle>
            <DialogDescription className="mt-1 text-sm text-[#60708a]">
              Full feature matrix for Gold and Platinum plans with real upgrade request mapping.
            </DialogDescription>
          </div>

          <div className="grid gap-3 px-6 pt-5 sm:grid-cols-2">
            {offers.map((offer) => {
              const offerMonthlyPrice = getOfferMonthlyPrice(offer, deviceType);
              const pricing = getDisplayPrice(offerMonthlyPrice, billingTerm);
              return (
                <div key={offer.alias} className="rounded-[16px] border border-[#dbe4ef] bg-[#fbfdff] px-4 py-3">
                  <div className="text-sm font-semibold text-[#24365a]">{offer.alias}</div>
                  <div className="mt-1 text-[1.35rem] font-semibold text-[#223555]">{formatMonthlyMoney(offerMonthlyPrice)}</div>
                  <div className="text-sm text-[#60708a]">per month</div>
                  <div className="mt-1 text-xs font-medium text-[#6c7a93]">
                    {pricing.discountedPriceLabel} for {getBillingTermLabel(billingTerm)}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="max-h-[58vh] overflow-auto px-6 py-5">
            <div className="overflow-hidden rounded-[18px] border border-[#dbe4ef]">
              <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr] bg-[#f8fbff] text-sm font-semibold text-[#49617d]">
                <div className="border-r border-[#dbe4ef] px-4 py-3">Feature</div>
                <div className="border-r border-[#dbe4ef] px-4 py-3 text-center">Gold</div>
                <div className="px-4 py-3 text-center">Platinum</div>
              </div>
              {FEATURE_ROWS.map((feature) => (
                <div key={feature.label} className="grid grid-cols-[1.4fr_0.8fr_0.8fr] border-t border-[#edf2f7] text-sm">
                  <div className="border-r border-[#edf2f7] px-4 py-3 text-[#304460]">{feature.label}</div>
                  <div className="flex items-center justify-center border-r border-[#edf2f7] px-4 py-3">{renderFeatureValue(feature.gold)}</div>
                  <div className="flex items-center justify-center px-4 py-3">{renderFeatureValue(feature.platinum)}</div>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
