"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  Factory,
  Gem,
  LayoutGrid,
  ShieldCheck,
  Sparkles,
  Store,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

import { ErrorPanel } from "@/components/shared/error-panel";
import { LoadingPanel } from "@/components/shared/loading-panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getOnboardingState, selectBusinessCategory } from "@/services/onboarding.service";
import { listWorkspaces, selectWorkspace } from "@/services/workspace.service";
import { useSessionContext } from "@/hooks/use-session-context";
import { useSessionStore } from "@/stores/session-store";

const categoryVisuals = {
  TRADING: {
    icon: Store,
    badge: "Fast-moving stock",
    glow: "from-[#ffd66b] via-[#ff8f45] to-[#ff5c7a]",
  },
  TENDER: {
    icon: BriefcaseBusiness,
    badge: "Tender workflow",
    glow: "from-[#8dd6ff] via-[#4c88ff] to-[#3154d6]",
  },
  RENTAL: {
    icon: Gem,
    badge: "Asset rental",
    glow: "from-[#9bf0d0] via-[#36c28e] to-[#138f72]",
  },
  SERVICE: {
    icon: Wrench,
    badge: "Service operations",
    glow: "from-[#f7b6ff] via-[#c377ff] to-[#7d4cff]",
  },
} as const;

function getCategoryVisual(code: string) {
  return (
    categoryVisuals[code as keyof typeof categoryVisuals] ?? {
      icon: Building2,
      badge: "Custom workspace",
      glow: "from-[#c9d5e6] via-[#90a6c4] to-[#5f7393]",
    }
  );
}

export function OnboardingScreen() {
  const router = useRouter();
  const { mode, session, hasHydrated } = useSessionContext();
  const setSession = useSessionStore((state) => state.setSession);
  const setWorkspace = useSessionStore((state) => state.setWorkspace);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [busyWorkspaceId, setBusyWorkspaceId] = useState<string | null>(null);
  const [creatingCategoryCode, setCreatingCategoryCode] = useState<string | null>(null);

  const onboardingQuery = useQuery({
    queryKey: ["api", "onboarding-state"],
    queryFn: getOnboardingState,
    enabled: hasHydrated && mode === "api" && Boolean(session),
  });

  const workspacesQuery = useQuery({
    queryKey: ["api", "workspace-picker"],
    queryFn: () => listWorkspaces("api"),
    enabled: hasHydrated && mode === "api" && Boolean(session),
  });

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    if (!session) {
      router.replace("/app/dashboard");
      return;
    }

    if (session.workspaceId) {
      router.replace("/app/dashboard");
    }
  }, [hasHydrated, router, session]);

  const categories = onboardingQuery.data?.categories ?? [];
  const workspaces = workspacesQuery.data ?? [];
  const selectedCategoryMeta = categories.find((category) => category.code === selectedCategory) ?? null;
  const existingWorkspaceForSelectedCategory = useMemo(() => {
    if (!selectedCategoryMeta) {
      return null;
    }

    return workspaces.find((workspace) => workspace.industry === selectedCategoryMeta.name) ?? null;
  }, [selectedCategoryMeta, workspaces]);

  if (!hasHydrated || !session || onboardingQuery.isLoading || workspacesQuery.isLoading) {
    return <LoadingPanel lines={6} />;
  }

  if (onboardingQuery.error || !onboardingQuery.data || workspacesQuery.error) {
    return (
      <ErrorPanel
        title="Workspace setup unavailable"
        description="The business type and workspace selector could not be loaded."
        onRetry={() => {
          void onboardingQuery.refetch();
          void workspacesQuery.refetch();
        }}
      />
    );
  }

  async function handleWorkspaceOpen(workspaceId: string) {
    try {
      setBusyWorkspaceId(workspaceId);
      await selectWorkspace("api", workspaceId);
      setWorkspace("api", workspaceId);
      toast.success("Workspace opened successfully");
      router.push("/app/dashboard");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to open workspace");
    } finally {
      setBusyWorkspaceId(null);
    }
  }

  async function handleCategoryProvision() {
    if (!selectedCategory) {
      return;
    }

    try {
      setCreatingCategoryCode(selectedCategory);
      const authSession = await selectBusinessCategory(selectedCategory);
      if (!authSession.workspaceId) {
        throw new Error("Workspace was not returned after provisioning");
      }

      setSession("api", authSession.user, authSession.workspaceId);
      toast.success(
        existingWorkspaceForSelectedCategory
          ? `${selectedCategoryMeta?.name ?? "Selected"} workspace opened`
          : `${selectedCategoryMeta?.name ?? "Selected"} workspace created successfully`,
      );
      router.push("/app/dashboard");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to prepare workspace");
    } finally {
      setCreatingCategoryCode(null);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0b1020] px-4 py-6 sm:px-6 lg:px-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(92,130,255,0.22),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(255,129,103,0.18),transparent_28%),linear-gradient(180deg,#0b1020_0%,#101733_54%,#0d1328_100%)]" />
      <div className="absolute left-[-120px] top-[90px] h-[300px] w-[300px] rounded-full bg-[#4567ff]/20 blur-3xl" />
      <div className="absolute bottom-[-80px] right-[-40px] h-[260px] w-[260px] rounded-full bg-[#ff7f58]/20 blur-3xl" />

      <div className="relative mx-auto flex min-h-[calc(100vh-48px)] max-w-[1260px] items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-[34px] border border-white/10 bg-white/[0.05] shadow-[0_28px_90px_rgba(4,10,24,0.55)] backdrop-blur-xl lg:grid-cols-[0.94fr_1.18fr]">
          <section className="relative overflow-hidden border-b border-white/10 bg-[#131a35] px-6 py-8 text-white sm:px-8 lg:border-b-0 lg:border-r">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(94,126,255,0.18),transparent_48%)]" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/75">
                <Sparkles className="h-3.5 w-3.5" />
                Workspace Launcher
              </div>

              <h1 className="mt-6 max-w-[420px] text-[2.2rem] font-semibold leading-tight tracking-[-0.05em] text-white">
                Pick your business type and let the right workspace open for you
              </h1>
              <p className="mt-4 max-w-[420px] text-sm leading-7 text-white/70">
                Trading, tender, rental, service, or any future pack can stay under the same SaaS account while opening as separate workspaces whenever needed.
              </p>

              <div className="mt-8 space-y-3">
                {[
                  "First-time users can create their first workspace directly from this centered setup window.",
                  "Existing users can switch into the correct workspace without leaving the flow.",
                  "Each business type can keep its own menus, dashboard, terminology, and operating structure.",
                ].map((point) => (
                  <div key={point} className="flex items-start gap-3 rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-3">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#9dc1ff]" />
                    <span className="text-sm leading-6 text-white/78">{point}</span>
                  </div>
                ))}
              </div>

              <div className="mt-8 rounded-[26px] border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-white">
                    <LayoutGrid className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">Current account flow</div>
                    <div className="text-xs text-white/65">Tenant-wide access with category-based workspace provisioning</div>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-white/[0.04] px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-white/45">Onboarding Step</div>
                    <div className="mt-1 text-sm font-semibold text-white">
                      {onboardingQuery.data.onboardingStep.replaceAll("_", " ")}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-white/[0.04] px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-white/45">Available Workspaces</div>
                    <div className="mt-1 text-sm font-semibold text-white">{workspaces.length}</div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-white px-5 py-6 sm:px-7 sm:py-7 lg:px-8">
            <div className="mx-auto max-w-[760px]">
              <div className="rounded-[28px] border border-[#d8e3f1] bg-white/80 p-5 shadow-[0_16px_38px_rgba(37,56,88,0.08)] sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-[0.78rem] font-semibold uppercase tracking-[0.2em] text-[#7084a4]">Setup Modal</div>
                    <h2 className="mt-2 text-[1.7rem] font-semibold tracking-[-0.04em] text-[#203250]">
                      Open an existing workspace or create one from business type
                    </h2>
                    <p className="mt-2 max-w-[560px] text-sm leading-6 text-[#60708a]">
                      Select the workspace you already have, or choose a business type to prepare a new workspace with the correct structure.
                    </p>
                  </div>
                  <div className="rounded-full bg-[#edf4ff] px-4 py-2 text-sm font-semibold text-[#2c5cc7]">
                    Same SaaS account
                  </div>
                </div>

                {workspaces.length ? (
                  <div className="mt-6">
                    <div className="mb-3 text-sm font-semibold text-[#24365a]">Existing Workspaces</div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {workspaces.map((workspace) => (
                        <button
                          key={workspace.id}
                          type="button"
                          className="group rounded-[22px] border border-[#dae5f2] bg-[#fbfdff] p-4 text-left transition hover:border-[#b8d0ec] hover:bg-white"
                          onClick={() => void handleWorkspaceOpen(workspace.id)}
                          disabled={busyWorkspaceId === workspace.id || Boolean(creatingCategoryCode)}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-base font-semibold text-[#223555]">{workspace.name}</div>
                              <div className="mt-1 text-sm text-[#61728f]">{workspace.industry}</div>
                            </div>
                            <span className="rounded-full bg-[#eef4ff] px-3 py-1 text-xs font-semibold text-[#2b5cc8]">
                              Open
                            </span>
                          </div>
                          <div className="mt-4 flex items-center justify-between text-xs text-[#7b8ba6]">
                            <span>{workspace.financialYear}</span>
                            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mt-6 rounded-[22px] border border-dashed border-[#cdd9ea] bg-[#f8fbff] px-4 py-4 text-sm text-[#678]">
                    No workspace is linked yet. Choose a business type below to create your first one.
                  </div>
                )}

                <div className="mt-7">
                  <div className="mb-3 text-sm font-semibold text-[#24365a]">Business Type Workspace Builder</div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {categories.map((category) => {
                      const active = selectedCategory === category.code;
                      const visual = getCategoryVisual(category.code);
                      const Icon = visual.icon;
                      const existingWorkspace = workspaces.find((workspace) => workspace.industry === category.name);

                      return (
                        <button
                          key={category.code}
                          type="button"
                          className={cn(
                            "relative overflow-hidden rounded-[24px] border p-4 text-left transition",
                            active
                              ? "border-[#2d5bca] bg-white shadow-[0_16px_32px_rgba(48,94,190,0.14)]"
                              : "border-[#dbe5f1] bg-white hover:border-[#bfd2ea] hover:shadow-[0_14px_26px_rgba(15,23,42,0.06)]",
                          )}
                          onClick={() => setSelectedCategory(category.code)}
                        >
                          <div className={cn("absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r", visual.glow)} />
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f1f6ff] text-[#3157b8]">
                              <Icon className="h-5 w-5" />
                            </div>
                            {active ? <CheckCircle2 className="h-5 w-5 text-[#2d5bca]" /> : null}
                          </div>
                          <div className="mt-4">
                            <div className="text-[1.02rem] font-semibold text-[#223555]">{category.name}</div>
                            <div className="mt-1 text-sm leading-6 text-[#60708a]">{category.description}</div>
                          </div>
                          <div className="mt-4 flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-[#f3f7fd] px-3 py-1 text-xs font-medium text-[#4f6785]">
                              {visual.badge}
                            </span>
                            <span
                              className={cn(
                                "rounded-full px-3 py-1 text-xs font-semibold",
                                existingWorkspace ? "bg-[#edf8f0] text-[#1c8a53]" : "bg-[#eef4ff] text-[#3157b8]",
                              )}
                            >
                              {existingWorkspace ? "Workspace already available" : "Create new workspace"}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-7 rounded-[24px] border border-[#dbe6f1] bg-[#f8fbff] p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-[#233659]">
                        {selectedCategoryMeta ? selectedCategoryMeta.name : "Select a business type to continue"}
                      </div>
                      <div className="mt-1 max-w-[520px] text-sm leading-6 text-[#5f728f]">
                        {selectedCategoryMeta
                          ? existingWorkspaceForSelectedCategory
                            ? `A ${selectedCategoryMeta.name} workspace already exists for this account. Continuing will open that workspace and keep the same data flow.`
                            : `A new ${selectedCategoryMeta.name} workspace will be provisioned with the matching menus, dashboard, and operational structure.`
                          : "This centered setup window is ready to launch the right workspace for the selected business type."}
                      </div>
                    </div>
                    <Button
                      className="h-11 rounded-full px-6 text-sm"
                      disabled={!selectedCategory || Boolean(busyWorkspaceId) || Boolean(creatingCategoryCode)}
                      onClick={() => void handleCategoryProvision()}
                    >
                      {creatingCategoryCode
                        ? "Preparing Workspace..."
                        : existingWorkspaceForSelectedCategory
                          ? "Open Matching Workspace"
                          : "Create Business Workspace"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
