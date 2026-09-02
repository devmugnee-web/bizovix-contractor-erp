"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import gsap from "gsap";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

import { ErrorPanel } from "@/components/shared/error-panel";
import { LoadingPanel } from "@/components/shared/loading-panel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { appConfig } from "@/config/app";
import {
  businessWorkspaceTemplates,
  getBusinessWorkspaceTemplate,
  type BusinessWorkspaceTemplateCode,
} from "@/config/business-workspaces";
import {
  buildWorkspaceRoute,
  isManufacturingWorkspacePath,
} from "@/config/routes";
import { CommandPalette } from "@/features/command-palette/command-palette";
import { ShellDialogs } from "@/features/shell/shell-dialogs";
import { ShortcutHelpDialog } from "@/features/shortcuts/shortcut-help-dialog";
import { useGlobalShortcuts } from "@/hooks/use-global-shortcuts";
import {
  useCurrentSessionQuery,
  useSubscriptionQuery,
} from "@/hooks/use-app-query";
import { useSessionContext } from "@/hooks/use-session-context";
import { MobileBottomNav } from "@/layouts/mobile-bottom-nav";
import { GlobalPrintPreview } from "@/layouts/global-print-preview";
import { SidebarNav } from "@/layouts/sidebar-nav";
import { TopHeader, UtilityBar } from "@/layouts/top-header";
import { routeTransitionVariants } from "@/lib/motion";
import { formatDate, setDateFormatPreference } from "@/lib/format";
import {
  getWorkspaceSubscriptionSnapshot,
  isWorkspaceBlocked,
} from "@/lib/workspace-subscription";
import { ApiError } from "@/services/api-client";
import { getCurrentSession } from "@/services/auth.service";
import { readDataset } from "@/services/browser-dataset";
import {
  COMPANY_PROFILE_UPDATED_EVENT,
  readCompanyProfile,
} from "@/services/company-profile";
import { getWorkspaceAutoBackupSettings } from "@/services/auto-backup-settings.service";
import {
  ensureWorkspaceForBusinessType,
  findTemplateWorkspace,
  inferWorkspaceTemplateCode,
} from "@/services/workspace-planning";
import { listWorkspaces, selectWorkspace } from "@/services/workspace.service";
import { useSessionStore } from "@/stores/session-store";
import { useUiStore } from "@/stores/ui-store";
import type { DataMode } from "@/types/domain";

const GLOBAL_WORKSPACE_MODAL_SEEN_KEY =
  "bizovix:workspace-onboarding-modal-seen:v2";

function getGlobalWorkspaceModalSeenKey(
  mode: DataMode,
  workspaceId: string | null | undefined,
) {
  return `${GLOBAL_WORKSPACE_MODAL_SEEN_KEY}:${mode}:${workspaceId ?? "default"}`;
}

export function AppShell({
  mode,
  children,
}: {
  mode: DataMode;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const { session, hasHydrated } = useSessionContext();
  const setSession = useSessionStore((state) => state.setSession);
  const setWorkspace = useSessionStore((state) => state.setWorkspace);
  const mobileNavOpen = useUiStore((state) => state.mobileNavOpen);
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const setMobileNavOpen = useUiStore((state) => state.setMobileNavOpen);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const mainFrameRef = useRef<HTMLDivElement | null>(null);
  const mainScrollRef = useRef<HTMLElement | null>(null);
  const [workspaceSetupOpen, setWorkspaceSetupOpen] = useState(false);
  const [workspaceSetupBusy, setWorkspaceSetupBusy] = useState(false);
  const [selectedTemplateCode, setSelectedTemplateCode] =
    useState<BusinessWorkspaceTemplateCode | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
    null,
  );
  const [autoSessionFailed, setAutoSessionFailed] = useState(false);
  useGlobalShortcuts(mode);

  useEffect(() => {
    const workspaceId = session?.workspaceId;
    if (!workspaceId || typeof window === "undefined") return;

    const storageKey = `bizovix:auto-backup:${mode}:${workspaceId}`;
    const applyLocalPreference = () => {
      try {
        const stored = JSON.parse(
          window.localStorage.getItem(storageKey) ?? "null",
        ) as { dateFormat?: unknown } | null;
        if (stored?.dateFormat) setDateFormatPreference(stored.dateFormat);
      } catch {
        // A malformed local settings snapshot should not prevent the app shell loading.
      }
    };

    applyLocalPreference();
    if (mode === "api") {
      void getWorkspaceAutoBackupSettings(workspaceId)
        .then((record) => {
          const dateFormat = record.settings?.dateFormat;
          if (dateFormat) setDateFormatPreference(dateFormat);
        })
        .catch(applyLocalPreference);
    }
  }, [mode, session?.workspaceId]);

  const currentSessionQuery = useCurrentSessionQuery(
    mode,
    hasHydrated && Boolean(session?.workspaceId),
  );

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    if (!session) {
      if (mode === "api") {
        // Reuse the current cookie session when possible; otherwise request the
        // machine workspace session so the app never needs a sign-in screen.
        let cancelled = false;

        void (async () => {
          try {
            // apiRequest already performs one refresh/local-session recovery.
            // If the authenticated retry still fails, stop here instead of
            // repeatedly creating sessions while cookies cannot be retained.
            const snapshot = await getCurrentSession();
            if (!cancelled) {
              setSession("api", snapshot.user, snapshot.workspaceId ?? "");
            }
          } catch {
            if (!cancelled) {
              // Desktop installs never fall back to a sign-in route. If the
              // background machine-session cannot be created, keep the user in
              // the workspace and show the local-service retry state instead.
              setAutoSessionFailed(true);
            }
          }
        })();

        return () => {
          cancelled = true;
        };
      }

      const dataset = readDataset(mode === "demo" ? "demo" : "mock");
      const previewUser = dataset.users[0];
      const defaultWorkspaceId = dataset.workspaces[0]?.id ?? "ws-trading";

      if (!previewUser) {
        return;
      }

      setSession(mode, previewUser, defaultWorkspaceId);
      return;
    }

    if (mode === "api" && !session.workspaceId && !appConfig.desktopMode) {
      router.replace("/onboarding");
    }
  }, [hasHydrated, mode, router, session, setSession]);

  useEffect(() => {
    if (mode !== "api" || !currentSessionQuery.data) {
      return;
    }

    const current = currentSessionQuery.data;
    if (
      session?.user.email === current.user.email &&
      session?.user.name === current.user.name &&
      session?.user.role === current.user.role &&
      JSON.stringify(session?.user.permissions ?? []) ===
        JSON.stringify(current.user.permissions ?? []) &&
      session?.workspaceId === (current.workspaceId ?? "")
    ) {
      return;
    }

    setSession("api", current.user, current.workspaceId ?? "");
  }, [
    currentSessionQuery.data,
    mode,
    session?.user.email,
    session?.user.name,
    session?.user.permissions,
    session?.user.role,
    session?.workspaceId,
    setSession,
  ]);

  const workspacesQuery = useQuery({
    queryKey: [mode, "workspaces"],
    queryFn: () => listWorkspaces(mode),
    enabled: hasHydrated && Boolean(session),
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status === 401) && failureCount < 2,
  });
  const subscriptionQuery = useSubscriptionQuery(
    mode,
    session?.workspaceId ?? null,
    hasHydrated && Boolean(session),
  );
  const workspaces = workspacesQuery.data ?? [];
  const currentWorkspaceId = session?.workspaceId ?? null;
  const workspace =
    workspaces.find((entry) => entry.id === currentWorkspaceId) ??
    workspaces[0] ??
    null;
  const fallbackWorkspaceId = workspaces[0]?.id ?? null;
  const [companyDisplayName, setCompanyDisplayName] = useState(
    appConfig.companyName,
  );

  useEffect(() => {
    if (
      mode !== "api" ||
      !session ||
      session.workspaceId ||
      !fallbackWorkspaceId
    ) {
      return;
    }

    let cancelled = false;
    void selectWorkspace(mode, fallbackWorkspaceId)
      .then(() => {
        if (!cancelled) {
          setWorkspace(mode, fallbackWorkspaceId);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAutoSessionFailed(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fallbackWorkspaceId, mode, session, setWorkspace]);

  useEffect(() => {
    if (!workspace?.id) {
      setCompanyDisplayName(appConfig.companyName);
      return;
    }

    const syncCompanyName = () => {
      const savedName = readCompanyProfile(
        mode,
        workspace.id,
      ).companyName.trim();
      setCompanyDisplayName(
        savedName || workspace.name || appConfig.companyName,
      );
    };

    syncCompanyName();
    window.addEventListener(COMPANY_PROFILE_UPDATED_EVENT, syncCompanyName);
    return () =>
      window.removeEventListener(
        COMPANY_PROFILE_UPDATED_EVENT,
        syncCompanyName,
      );
  }, [mode, workspace?.id, workspace?.name]);
  const activeWorkspaceId = currentWorkspaceId ?? workspace?.id ?? null;
  const activeWorkspaceTemplateCode = useMemo(
    () => inferWorkspaceTemplateCode(workspaces, activeWorkspaceId),
    [activeWorkspaceId, workspaces],
  );
  const selectedTemplate = selectedTemplateCode
    ? getBusinessWorkspaceTemplate(selectedTemplateCode)
    : null;
  const selectedWorkspace = useMemo(
    () => workspaces.find((entry) => entry.id === selectedWorkspaceId) ?? null,
    [selectedWorkspaceId, workspaces],
  );
  const fallbackSubscription = getWorkspaceSubscriptionSnapshot(
    readDataset(mode === "demo" ? "demo" : "mock"),
    activeWorkspaceId,
  );
  const workspaceSubscription = subscriptionQuery.data ?? fallbackSubscription;
  const subscriptionPagePath = buildWorkspaceRoute(mode, "/subscription");
  const subscriptionBlocked =
    pathname !== subscriptionPagePath &&
    isWorkspaceBlocked(workspaceSubscription);
  const hideGlobalWorkspaceToolbar = isManufacturingWorkspacePath(
    mode,
    pathname,
  );

  useEffect(() => {
    if (reduceMotion || !shellRef.current) {
      return;
    }

    const context = gsap.context(() => {
      gsap.fromTo(
        "[data-shell-chrome]",
        { opacity: 0, y: 14 },
        {
          opacity: 1,
          y: 0,
          duration: 0.55,
          stagger: 0.08,
          ease: "power2.out",
          clearProps: "opacity,transform",
        },
      );
    }, shellRef);

    return () => context.revert();
  }, [reduceMotion]);

  useEffect(() => {
    if (!mainScrollRef.current) {
      return;
    }

    mainScrollRef.current.scrollTo({ top: 0, behavior: "auto" });
  }, [pathname]);

  useEffect(() => {
    setSelectedTemplateCode(
      activeWorkspaceTemplateCode ??
        businessWorkspaceTemplates[0]?.code ??
        null,
    );
    setSelectedWorkspaceId(activeWorkspaceId);
  }, [activeWorkspaceId, activeWorkspaceTemplateCode]);

  useEffect(() => {
    if (
      !hasHydrated ||
      !session ||
      subscriptionBlocked ||
      typeof window === "undefined"
    ) {
      return;
    }

    if (activeWorkspaceId && activeWorkspaceTemplateCode) {
      markWorkspaceSetupSeen(activeWorkspaceId);
      setWorkspaceSetupOpen(false);
      return;
    }

    const seenKey = getGlobalWorkspaceModalSeenKey(mode, activeWorkspaceId);
    if (window.localStorage.getItem(seenKey) !== "true") {
      setWorkspaceSetupOpen(true);
    }
  }, [
    activeWorkspaceId,
    activeWorkspaceTemplateCode,
    hasHydrated,
    mode,
    session,
    subscriptionBlocked,
  ]);

  if (!hasHydrated) {
    return (
      <div className="min-h-screen p-6">
        <LoadingPanel lines={8} />
      </div>
    );
  }

  if (!session) {
    if (mode === "api" && autoSessionFailed) {
      return (
        <div className="min-h-screen p-6">
          <ErrorPanel
            title="Local workspace unavailable"
            description="The Bizovix service on this computer did not respond. Make sure it is running, then retry."
            onRetry={() => window.location.reload()}
          />
        </div>
      );
    }

    return (
      <div className="min-h-screen p-6">
        <LoadingPanel lines={8} />
      </div>
    );
  }

  if (mode === "api" && !session.workspaceId && fallbackWorkspaceId) {
    if (autoSessionFailed) {
      return (
        <div className="min-h-screen p-6">
          <ErrorPanel
            title="Workspace selection unavailable"
            description="The local workspace could not be selected. Retry after confirming the service is running."
            onRetry={() => window.location.reload()}
          />
        </div>
      );
    }

    return (
      <div className="min-h-screen p-6">
        <LoadingPanel lines={8} />
      </div>
    );
  }

  if (workspacesQuery.isLoading) {
    return (
      <div className="min-h-screen p-6">
        <LoadingPanel lines={8} />
      </div>
    );
  }

  if (workspacesQuery.error || !workspacesQuery.data) {
    return (
      <div className="min-h-screen p-6">
        <ErrorPanel
          title="Workspace shell unavailable"
          description="The app shell could not load its workspace context. Retry or switch modes."
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  function markWorkspaceSetupSeen(workspaceId: string | null | undefined) {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      getGlobalWorkspaceModalSeenKey(mode, workspaceId),
      "true",
    );
  }

  function handleWorkspaceSetupOpenChange(open: boolean) {
    if (!open) {
      markWorkspaceSetupSeen(activeWorkspaceId ?? selectedWorkspaceId);
    }

    setWorkspaceSetupOpen(open);
  }

  function handleWorkspaceTypeChange(
    templateCode: BusinessWorkspaceTemplateCode,
  ) {
    const nextWorkspace = findTemplateWorkspace(
      workspacesQuery.data ?? [],
      templateCode,
    );
    setSelectedTemplateCode(templateCode);
    setSelectedWorkspaceId(nextWorkspace?.id ?? null);
  }

  function handleWorkspaceCategoryChange(category: string) {
    const nextTemplate = businessWorkspaceTemplates.find(
      (template) => template.businessCategory === category,
    );
    if (!nextTemplate) {
      return;
    }

    handleWorkspaceTypeChange(nextTemplate.code);
  }

  async function handleWorkspaceSetupApply() {
    if (!selectedTemplate) {
      return;
    }

    try {
      setWorkspaceSetupBusy(true);

      if (selectedWorkspaceId) {
        await selectWorkspace(mode, selectedWorkspaceId);
        setWorkspace(mode, selectedWorkspaceId);
        markWorkspaceSetupSeen(selectedWorkspaceId);
        setWorkspaceSetupOpen(false);
        router.push(buildWorkspaceRoute(mode, "/dashboard"));
        router.refresh();
        return;
      }

      const result = await ensureWorkspaceForBusinessType(
        mode,
        selectedTemplate.code,
      );
      setWorkspace(mode, result.workspace.id);
      markWorkspaceSetupSeen(result.workspace.id);
      setWorkspaceSetupOpen(false);
      await queryClient.invalidateQueries({ queryKey: [mode, "workspaces"] });
      router.push(buildWorkspaceRoute(mode, "/dashboard"));
      router.refresh();
    } finally {
      setWorkspaceSetupBusy(false);
    }
  }

  return (
    <div
      ref={shellRef}
      className="flex h-screen flex-col overflow-hidden bg-canvas"
    >
      <UtilityBar mode={mode} />
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div className="relative hidden xl:block" data-shell-chrome>
          <SidebarNav mode={mode} companyName={companyDisplayName} />
          <div className="absolute right-0 top-[calc(50%-40px)] z-40 -translate-y-1/2 translate-x-1/2">
            <button
              type="button"
              className="button-effect-off flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-[#11162b]/95 p-0 text-white shadow-[0_6px_16px_rgba(7,12,30,0.24)] transition hover:scale-105 hover:bg-[#11162b]"
              onClick={toggleSidebar}
              aria-label={
                sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
              }
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? (
                <ChevronRight className="h-6 w-6 stroke-[3]" />
              ) : (
                <ChevronLeft className="h-6 w-6 stroke-[3]" />
              )}
            </button>
          </div>
        </div>
        {mobileNavOpen ? (
          <m.div
            className="fixed inset-0 z-40 bg-[#0f172a]/20 xl:hidden"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={reduceMotion ? undefined : { opacity: 1 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            onClick={() => setMobileNavOpen(false)}
          >
            <m.div
              className="h-full w-[286px]"
              initial={reduceMotion ? false : { x: -28, opacity: 0.92 }}
              animate={reduceMotion ? undefined : { x: 0, opacity: 1 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              onClick={(event) => event.stopPropagation()}
            >
              <SidebarNav mode={mode} mobile companyName={companyDisplayName} />
            </m.div>
          </m.div>
        ) : null}
        <div
          ref={mainFrameRef}
          className="flex min-h-0 min-w-0 flex-1 flex-col pb-20 xl:pb-0"
          data-shell-chrome
        >
          {hideGlobalWorkspaceToolbar ? null : <TopHeader mode={mode} />}
          <main
            id="report-print-area"
            ref={mainScrollRef}
            data-shell-scroll-root
            className="relative min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-3"
          >
            <AnimatePresence mode="wait" initial={false}>
              <m.div
                key={pathname}
                className="motion-page h-full min-w-0 max-w-full overflow-x-hidden"
                style={{ contain: "none" }}
                initial={reduceMotion ? false : "initial"}
                animate={reduceMotion ? undefined : "enter"}
                exit={reduceMotion ? undefined : "exit"}
                variants={routeTransitionVariants}
              >
                {children}
              </m.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
      <MobileBottomNav mode={mode} />
      <GlobalPrintPreview contentRootRef={mainScrollRef} pathname={pathname} />
      <CommandPalette mode={mode} />
      <ShellDialogs mode={mode} />
      <ShortcutHelpDialog />
      <Dialog
        open={workspaceSetupOpen && !subscriptionBlocked}
        onOpenChange={handleWorkspaceSetupOpenChange}
      >
        <DialogContent className="w-[min(92vw,620px)] max-w-none overflow-hidden p-0">
          <div className="bg-white px-6 py-5">
            <div className="text-[0.76rem] font-semibold uppercase tracking-[0.2em] text-[#7a8ca7]">
              Workspace Setup
            </div>
            <DialogTitle className="mt-2 text-[1.45rem] font-semibold tracking-[-0.03em] text-[#223555]">
              Choose business type first
            </DialogTitle>
            <DialogDescription className="mt-2 max-w-[500px] text-sm leading-6 text-[#60708a]">
              This setup appears the first time you open a workspace. Select the
              business type that best matches your operations.
            </DialogDescription>
          </div>

          <div className="px-6 py-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-[#304460]">
                  Business Type
                </span>
                <div className="relative">
                  <select
                    value={selectedTemplateCode ?? ""}
                    onChange={(event) =>
                      handleWorkspaceTypeChange(
                        event.target.value as BusinessWorkspaceTemplateCode,
                      )
                    }
                    className="h-11 w-full appearance-none rounded-[12px] border border-[#d8e1ee] bg-white px-4 pr-10 text-sm text-[#24365a] outline-none"
                  >
                    <option value="" disabled>
                      Select business type
                    </option>
                    {businessWorkspaceTemplates.map((template) => (
                      <option key={template.code} value={template.code}>
                        {template.businessType}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6f83a2]" />
                </div>
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-[#304460]">
                  Business Category
                </span>
                <div className="relative">
                  <select
                    value={selectedTemplate?.businessCategory ?? ""}
                    onChange={(event) =>
                      handleWorkspaceCategoryChange(event.target.value)
                    }
                    className="h-11 w-full appearance-none rounded-[12px] border border-[#d8e1ee] bg-white px-4 pr-10 text-sm text-[#24365a] outline-none"
                  >
                    <option value="" disabled>
                      Select business category
                    </option>
                    {businessWorkspaceTemplates.map((template) => (
                      <option
                        key={template.businessCategory}
                        value={template.businessCategory}
                      >
                        {template.businessCategory}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6f83a2]" />
                </div>
              </label>
            </div>

            <div className="mt-4 rounded-[16px] border border-[#e1e8f2] bg-[#fbfdff] px-4 py-3 text-sm text-[#5f728f]">
              {selectedTemplate
                ? selectedWorkspaceId
                  ? `${selectedWorkspace?.name ?? "Selected workspace"} will open for ${selectedTemplate.businessType}.`
                  : `${selectedTemplate.workspaceName} will be created and opened for ${selectedTemplate.businessType}.`
                : "Select a business type and category, then apply the workspace."}
            </div>

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-full border border-[#d8e1ee] bg-white px-5 text-sm font-semibold text-[#4b607d] transition hover:bg-[#f7faff]"
                onClick={() => {
                  markWorkspaceSetupSeen(
                    session.workspaceId ?? workspace?.id ?? null,
                  );
                  setWorkspaceSetupOpen(false);
                }}
              >
                Later
              </button>
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-full bg-[#f7193e] px-6 text-sm font-semibold text-white transition hover:bg-[#df0f33] disabled:cursor-not-allowed disabled:bg-[#f3a7b3]"
                disabled={!selectedTemplate || workspaceSetupBusy}
                onClick={() => void handleWorkspaceSetupApply()}
              >
                {workspaceSetupBusy ? "Applying..." : "Apply Workspace"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={subscriptionBlocked}>
        <DialogContent
          className="w-[min(92vw,520px)] p-0"
          hideClose
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <div className="border-b border-[#e2e8f0] px-6 py-5">
            <DialogTitle className="text-[1.35rem] font-semibold text-[#223555]">
              Workspace Subscription Required
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm leading-6 text-[#60708a]">
              {workspace?.name ?? "This workspace"} free trial ended on{" "}
              {formatDate(workspaceSubscription.renewalDate)}. Subscribe now to keep using
              this workspace and its saved data.
            </DialogDescription>
          </div>

          <div className="px-6 py-6">
            <div className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] px-4 py-4 text-sm text-[#425873]">
              Business workspace:{" "}
              <span className="font-semibold text-[#223555]">
                {workspace?.name ?? "Workspace"}
              </span>
            </div>

            <Button
              className="mt-5 h-11 w-full rounded-full bg-[#f7193e] text-sm font-semibold text-white hover:bg-[#df0f33]"
              onClick={() => router.push(subscriptionPagePath)}
            >
              Go To Subscription
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
