"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Building2,
  ChevronsRight,
  CircleHelp,
  FileDown,
  Headset,
  Info,
  Keyboard,
  Menu,
  MessageCircle,
  Minus,
  MoreVertical,
  PencilLine,
  PlayCircle,
  Plus,
  Printer,
  RefreshCw,
  ScrollText,
  Search,
  ShieldCheck,
  Square,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { WhatsAppIcon } from "@/components/shared/brand-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildPurchaseStartRoute, buildSalesStartRoute, buildVoucherRoute, buildWorkspaceRoute } from "@/config/routes";
import { useWorkflowSettingsQuery } from "@/hooks/use-app-query";
import { useSessionContext } from "@/hooks/use-session-context";
import { usePostableLedgersQuery } from "@/hooks/use-accounts-query";
import { moduleRegistry } from "@/config/module-registry";
import { voucherShortcutOrder } from "@/config/navigation";
import { openSupportChat, openTutorialVideoSearch } from "@/lib/app-actions";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { printCurrentPage } from "@/lib/current-page-print";
import { listDayBook } from "@/services/voucher.service";
import { defaultWorkflowSettings } from "@/services/workflow-settings.service";
import { useUiStore } from "@/stores/ui-store";
import type { DataMode } from "@/types/domain";

type MenuKey = "more" | null;
type UtilityMenuKey = "Company" | "Help" | "Versions" | null;

const utilityLinks = ["Company", "Help", "Versions", "Shortcuts"] as const;

/** Leading icons make the desktop menu bar scannable instead of a row of plain words. */
const utilityLinkIcons: Record<(typeof utilityLinks)[number], typeof Building2> = {
  Company: Building2,
  Help: CircleHelp,
  Versions: Info,
  Shortcuts: Keyboard,
};
const startingVersion = "1.0.0";

const globalSearchPages = [
  {
    title: "User Activity",
    description: "View voucher creation, posting, editing, and other user audit activity.",
    path: "/reports/user-activity-log",
    keywords: "activity activ user activity log audit history voucher posted created edited",
  },
  {
    title: "Login History",
    description: "Review user sign-in and login history.",
    path: "/reports/login-history",
    keywords: "login sign in signin history audit activity user",
  },
  {
    title: "Deleted Records",
    description: "Review deleted transaction audit records.",
    path: "/reports/deleted-transactions",
    keywords: "deleted transactions recycle audit activity history",
  },
  {
    title: "Data Changes",
    description: "Review transaction edit history.",
    path: "/reports/edited-transactions",
    keywords: "edited changed transactions audit activity history",
  },
  {
    title: "Posting / Approval History",
    description: "Review voucher approval activity and history.",
    path: "/reports/approval-history",
    keywords: "approval approved pending audit activity history",
  },
] as const;

function globalSearchScore(query: string, title: string, keywords = "") {
  const normalizedTitle = title.toLowerCase();
  const normalizedKeywords = keywords.toLowerCase();
  if (normalizedTitle === query) return 100;
  if (normalizedTitle.startsWith(query)) return 80;
  if (normalizedTitle.split(/\s+/).some((word) => word.startsWith(query))) return 60;
  if (normalizedTitle.includes(query)) return 40;
  if (normalizedKeywords.split(/\s+/).some((word) => word.startsWith(query))) return 30;
  if (normalizedKeywords.includes(query)) return 20;
  return 0;
}

export function UtilityBar({ mode }: { mode: DataMode }) {
  const router = useRouter();
  const setSupportOpen = useUiStore((state) => state.setSupportOpen);
  const setShortcutHelpOpen = useUiStore((state) => state.setShortcutHelpOpen);
  const setNotificationsOpen = useUiStore((state) => state.setNotificationsOpen);
  const [openUtilityMenu, setOpenUtilityMenu] = useState<UtilityMenuKey>(null);
  const [isDesktopApp, setIsDesktopApp] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const utilityBarRef = useRef<HTMLDivElement | null>(null);

  function openInstantSupport() {
    openSupportChat();
  }

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!utilityBarRef.current?.contains(event.target as Node)) {
        setOpenUtilityMenu(null);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenUtilityMenu(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    const desktopApp = window.desktopApp;
    if (!desktopApp?.isDesktop) {
      return;
    }

    setIsDesktopApp(true);
    void desktopApp.isMaximized().then(setIsMaximized);

    return desktopApp.onWindowStateChange((payload) => {
      setIsMaximized(payload.isMaximized);
    });
  }, []);

  function handleUtilityAction(label: (typeof utilityLinks)[number]) {
    switch (label) {
      case "Company":
        setOpenUtilityMenu((current) => (current === "Company" ? null : "Company"));
        break;
      case "Help":
        setOpenUtilityMenu((current) => (current === "Help" ? null : "Help"));
        break;
      case "Versions":
        setOpenUtilityMenu((current) => (current === "Versions" ? null : "Versions"));
        break;
      case "Shortcuts":
        setOpenUtilityMenu(null);
        setShortcutHelpOpen(true);
        break;
    }
  }

  function closeUtilityMenu() {
    setOpenUtilityMenu(null);
  }

  function handleChangeCompany() {
    router.push(buildWorkspaceRoute(mode, "/company-profile"));
    closeUtilityMenu();
  }

  function handleRenameCompanyName() {
    router.push(buildWorkspaceRoute(mode, "/company-profile"));
    toast.info("Rename Company Name option is available from Company Profile.");
    closeUtilityMenu();
  }

  function handleContactUs() {
    setSupportOpen(true);
    closeUtilityMenu();
  }

  function handleVideoTutorials() {
    openTutorialVideoSearch("Bizovix ERP workflow tutorial");
    closeUtilityMenu();
  }

  function handleReleaseNotes() {
    setNotificationsOpen(true);
    closeUtilityMenu();
  }

  function handlePrivacyPolicy() {
    setSupportOpen(true);
    toast.info("Privacy and policy guidance is available from Help & Support.");
    closeUtilityMenu();
  }

  function handleCheckForUpdate() {
    toast.success(`You are on the starting release ${startingVersion}.`);
    closeUtilityMenu();
  }

  function handleRefresh() {
    window.location.reload();
  }

  return (
    <div
      ref={utilityBarRef}
      data-shell-utility-bar
      className="relative hidden min-h-8 w-full max-w-full items-center gap-3 border-b border-[#e7edf5] bg-white px-2.5 text-[12px] text-[#31435f] lg:flex"
      data-shell-chrome
    >
      <div className={isDesktopApp ? "erp-desktop-drag flex min-w-0 flex-1 items-center gap-3" : "flex min-w-0 flex-1 items-center gap-3"}>
        {/* Mark and wordmark read as one brand lockup, so they get their own tight
          * gap instead of the wider one that separates the utility links. */}
        <div className="erp-desktop-no-drag flex shrink-0 items-center gap-1">
          <div data-shell-brand-mark className="flex h-9 w-9 items-center justify-center">
            <Image src="/site-logo.png" alt="Bizovix" width={36} height={36} className="h-full w-full object-contain" />
          </div>
          <span className="whitespace-nowrap text-[13px] font-semibold tracking-tight text-[#0f172a]">
            Bizovix
          </span>
        </div>
        <div className="erp-desktop-no-drag flex items-center gap-4 whitespace-nowrap">
          {utilityLinks.map((label) => {
            const isMenuButton = label !== "Shortcuts";
            const isOpen = openUtilityMenu === label;
            const LinkIcon = utilityLinkIcons[label];

            return (
              <div key={label} className="relative">
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 transition hover:bg-[#eef3fb] hover:text-[#0f172a]",
                    isOpen ? "bg-[#e6edf9] text-[#0f172a]" : "",
                  )}
                  onClick={() => handleUtilityAction(label)}
                  aria-expanded={isMenuButton ? isOpen : undefined}
                >
                  <LinkIcon className="h-3.5 w-3.5 shrink-0 text-[#64748b]" />
                  {label}
                </button>

                {label === "Company" && isOpen ? (
                  <div className="absolute left-0 top-[calc(100%+6px)] z-[90] min-w-[210px] border border-[#c9d1e6] bg-[#d7ddef] py-1.5 text-[12px] text-[#1d2d4f] shadow-[0_16px_30px_rgba(15,23,42,0.14)]">
                    <button type="button" className="flex w-full items-center gap-2.5 px-4 py-2 text-left transition hover:bg-white/40" onClick={handleChangeCompany}>
                      <Building2 className="h-3.5 w-3.5 shrink-0 text-[#4a5e7d]" />
                      Change Company
                    </button>
                    <button type="button" className="flex w-full items-center gap-2.5 px-4 py-2 text-left transition hover:bg-white/40" onClick={handleRenameCompanyName}>
                      <PencilLine className="h-3.5 w-3.5 shrink-0 text-[#4a5e7d]" />
                      Rename Company Name
                    </button>
                  </div>
                ) : null}

                {label === "Help" && isOpen ? (
                  <div className="absolute left-0 top-[calc(100%+6px)] z-[90] min-w-[240px] border border-[#c9d1e6] bg-[#d7ddef] py-1.5 text-[12px] text-[#1d2d4f] shadow-[0_16px_30px_rgba(15,23,42,0.14)]">
                    <button type="button" className="flex w-full items-center gap-2.5 px-4 py-2 text-left transition hover:bg-white/40" onClick={handleContactUs}>
                      <MessageCircle className="h-3.5 w-3.5 shrink-0 text-[#4a5e7d]" />
                      Contact Us
                    </button>
                    <button type="button" className="flex w-full items-center gap-2.5 px-4 py-2 text-left transition hover:bg-white/40" onClick={handleVideoTutorials}>
                      <PlayCircle className="h-3.5 w-3.5 shrink-0 text-[#4a5e7d]" />
                      Video Tutorials
                    </button>
                    <button type="button" className="flex w-full items-center gap-2.5 px-4 py-2 text-left transition hover:bg-white/40" onClick={handleReleaseNotes}>
                      <ScrollText className="h-3.5 w-3.5 shrink-0 text-[#4a5e7d]" />
                      View Release Notes
                    </button>
                    <button type="button" className="flex w-full items-center gap-2.5 px-4 py-2 text-left transition hover:bg-white/40" onClick={handlePrivacyPolicy}>
                      <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[#4a5e7d]" />
                      Privacy policy
                    </button>
                  </div>
                ) : null}

                {label === "Versions" && isOpen ? (
                  <div className="absolute left-0 top-[calc(100%+6px)] z-[90] min-w-[240px] border border-[#c9d1e6] bg-[#d7ddef] py-1.5 text-[12px] text-[#1d2d4f] shadow-[0_16px_30px_rgba(15,23,42,0.14)]">
                    <div className="flex items-center gap-2.5 px-4 py-2">
                      <Info className="h-3.5 w-3.5 shrink-0 text-[#4a5e7d]" />
                      Application : {startingVersion}
                    </div>
                    <div className="flex items-center gap-2.5 px-4 py-2">
                      <Info className="h-3.5 w-3.5 shrink-0 text-[#4a5e7d]" />
                      E.Version : {startingVersion}
                    </div>
                    <button type="button" className="flex w-full items-center gap-2.5 px-4 py-2 text-left transition hover:bg-white/40" onClick={handleCheckForUpdate}>
                      <RefreshCw className="h-3.5 w-3.5 shrink-0 text-[#4a5e7d]" />
                      Check For Update
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
          <button
            type="button"
            className="inline-flex items-center rounded-md p-1.5 transition hover:bg-[#eef3fb] hover:text-[#0f172a]"
            onClick={handleRefresh}
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="erp-desktop-no-drag absolute left-[max(50%,720px)] hidden -translate-x-1/2 items-center justify-center gap-2 whitespace-nowrap text-[#4a5e7d] xl:flex">
          <span className="font-medium text-[#34445f]">Need Help?</span>
          <button type="button" className="inline-flex items-center gap-1.5 text-[#12a150] transition hover:underline" onClick={openInstantSupport}>
            <WhatsAppIcon className="h-4 w-4 shrink-0" />
            WhatsApp
          </button>
          <span className="text-[#b5c0d1]">|</span>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-[#2563eb] underline-offset-2 hover:underline"
            onClick={openInstantSupport}
          >
            <Headset className="h-3.5 w-3.5 shrink-0" />
            Live Support
          </button>
        </div>
      </div>

      {isDesktopApp ? (
        <div className="erp-desktop-no-drag ml-auto flex items-stretch self-stretch">
          <button
            type="button"
            className="flex w-11 items-center justify-center text-[#56657f] transition hover:bg-[#eef3fb] hover:text-[#132238]"
            onClick={() => window.desktopApp?.minimize()}
            aria-label="Minimize window"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="flex w-11 items-center justify-center text-[#56657f] transition hover:bg-[#eef3fb] hover:text-[#132238]"
            onClick={() => {
              void window.desktopApp?.toggleMaximize();
            }}
            aria-label={isMaximized ? "Restore window" : "Maximize window"}
          >
            <Square className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="erp-desktop-close-button flex w-11 items-center justify-center transition-colors hover:bg-[#e81123] focus-visible:bg-[#e81123]"
            onClick={() => window.desktopApp?.close()}
            aria-label="Close window"
            title="Close"
          >
            <X className="h-4 w-4 stroke-[2.5]" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function TopHeader({ mode }: { mode: DataMode }) {
  const router = useRouter();
  const { session } = useSessionContext();
  const workflowSettingsQuery = useWorkflowSettingsQuery(
    mode,
    session?.workspaceId ?? (mode === "api" ? null : "workspace"),
  );
  const workflowSettings = workflowSettingsQuery.data ?? defaultWorkflowSettings;
  const setMobileNavOpen = useUiStore((state) => state.setMobileNavOpen);
  const setCommandPaletteOpen = useUiStore((state) => state.setCommandPaletteOpen);
  const [searchValue, setSearchValue] = useState("");
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [openMenu, setOpenMenu] = useState<MenuKey>(null);
  const searchHostRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const menuHostRef = useRef<HTMLDivElement | null>(null);
  const menuPortalRef = useRef<HTMLDivElement | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const searchNeedle = searchValue.trim().toLowerCase();
  const globalLedgerQuery = usePostableLedgersQuery(mode === "api" && searchExpanded && searchNeedle.length > 0);
  const globalVoucherQuery = useQuery({
    queryKey: [mode, "global-search-vouchers", session?.workspaceId],
    queryFn: () => listDayBook(mode, { workspaceId: session!.workspaceId }),
    enabled: searchExpanded && searchNeedle.length > 0 && Boolean(session?.workspaceId),
    staleTime: 30_000,
  });
  const instantSearchResults = useMemo(() => {
    const needle = searchNeedle;
    if (!needle) return [];

    const moduleMatches = Object.values(moduleRegistry)
      .map((entry) => ({ entry, score: globalSearchScore(needle, entry.title, entry.description) }))
      .filter(({ score }) => score > 0)
      .map((entry) => ({
        title: entry.entry.title,
        description: entry.entry.description,
        href: buildWorkspaceRoute(mode, `/${entry.entry.section}/${entry.entry.slug}`),
        score: entry.score,
      }));
    const voucherMatches = voucherShortcutOrder
      .map((entry) => ({ entry, score: globalSearchScore(needle, `${entry.label} Voucher`, `${entry.label} create transaction`) }))
      .filter(({ score }) => score > 0)
      .map((entry) => ({
        title: `${entry.entry.label} Voucher`,
        description: `Create a new ${entry.entry.label.toLowerCase()} voucher`,
        href: buildVoucherRoute(mode, entry.entry.type),
        score: entry.score,
      }));

    const pageMatches = globalSearchPages
      .map((entry) => ({ entry, score: globalSearchScore(needle, entry.title, entry.keywords) }))
      .filter(({ score }) => score > 0)
      .map(({ entry, score }) => ({
        title: entry.title,
        description: entry.description,
        href: buildWorkspaceRoute(mode, entry.path),
        score,
      }));

    const ledgerMatches = (globalLedgerQuery.data ?? [])
      .map((ledger) => {
        const searchable = `${ledger.name} ${ledger.path} ${ledger.bankDetails?.bankName ?? ""} ${ledger.bankDetails?.accountNumber ?? ""}`;
        const score = globalSearchScore(needle, ledger.name, searchable);
        const key = searchable.toLowerCase();
        const target = /mobile finance|\bmfs\b|bkash|nagad|rocket/.test(key)
          ? "/utilities/mfs"
          : /bank accounts|bank name/.test(key)
            ? "/utilities/bank-accounts"
            : `/reports/general-ledger?ledger=${encodeURIComponent(ledger.name)}`;
        return {
          title: ledger.name,
          description: `Ledger · ${ledger.path}`,
          href: buildWorkspaceRoute(mode, target),
          score,
        };
      })
      .filter((result) => result.score > 0);

    const voucherMatchesFromData = (globalVoucherQuery.data ?? [])
      .map((voucher) => {
        const lineLedgers = voucher.lines.map((line) => line.ledger).join(" ");
        const searchable = `${voucher.voucherNumber} ${voucher.partyName} ${voucher.particulars} ${voucher.narration ?? ""} ${lineLedgers}`;
        return {
          title: voucher.voucherNumber,
          description: `${voucher.partyName || voucher.particulars || "Transaction"} · ${formatDate(voucher.voucherDate)}`,
          href: `${buildWorkspaceRoute(mode, "/day-book")}?query=${encodeURIComponent(needle)}`,
          score: globalSearchScore(needle, voucher.voucherNumber, searchable),
        };
      })
      .filter((result) => result.score > 0);

    return [...ledgerMatches, ...voucherMatchesFromData, ...pageMatches, ...moduleMatches, ...voucherMatches]
      .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
      .filter((result, index, results) => results.findIndex((candidate) => candidate.href === result.href) === index)
      .slice(0, 8);
  }, [globalLedgerQuery.data, globalVoucherQuery.data, mode, searchNeedle]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!searchHostRef.current?.contains(target)) {
        setSearchExpanded(false);
      }
      if (menuHostRef.current?.contains(target) || menuPortalRef.current?.contains(target)) {
        return;
      }
      setOpenMenu(null);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenu(null);
        setSearchExpanded(false);
        searchInputRef.current?.blur();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useLayoutEffect(() => {
    if (openMenu !== "more") {
      return;
    }

    const updatePosition = () => {
      const button = moreButtonRef.current;
      if (!button) {
        return;
      }

      const rect = button.getBoundingClientRect();
      const menuWidth = 220;
      const viewportPadding = 12;
      const nextLeft = Math.min(Math.max(viewportPadding, rect.right - menuWidth), window.innerWidth - menuWidth - viewportPadding);

      setMenuPosition({
        top: rect.bottom + 10,
        left: nextLeft,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [openMenu]);

  function goToSearch() {
    const query = searchValue.trim();
    if (query) {
      router.push(buildWorkspaceRoute(mode, `/search?q=${encodeURIComponent(query)}`));
    } else {
      setCommandPaletteOpen(true);
    }
    setOpenMenu(null);
    setSearchExpanded(false);
  }

  function runPrint() {
    const printEvent = new CustomEvent("erp-print-request", { cancelable: true });
    window.dispatchEvent(printEvent);
    if (!printEvent.defaultPrevented) {
      printCurrentPage();
    }
    setOpenMenu(null);
  }

  function handleExport() {
    window.dispatchEvent(new CustomEvent("erp-export-request"));
    setOpenMenu(null);
  }

  function handleRefresh() {
    window.location.reload();
    setOpenMenu(null);
  }

  return (
    <header className="w-full max-w-full border-b border-[#e7edf5] bg-white px-2.5 py-1.5 sm:px-3" data-shell-chrome data-shell-topbar>
      <div className="flex w-full max-w-full items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-2xl xl:hidden" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation">
            <Menu className="h-4 w-4" />
          </Button>
          <div
            ref={searchHostRef}
            data-shell-search
            data-search-expanded={searchExpanded ? "true" : "false"}
            className={cn(
              "group/search relative h-9 min-w-9 shrink-0 transition-[width,box-shadow] duration-300 ease-out",
              searchExpanded
                ? "w-[min(420px,55vw)]"
                : "w-[58px] cursor-pointer rounded-full shadow-[0_4px_12px_rgba(37,99,235,0.28)] hover:shadow-[0_6px_16px_rgba(37,99,235,0.36)]",
            )}
            role={searchExpanded ? undefined : "button"}
            tabIndex={searchExpanded ? undefined : 0}
            aria-expanded={searchExpanded}
            title={searchExpanded ? undefined : "Search — opens a wider box"}
            onClick={() => {
              if (!searchExpanded) {
                setSearchExpanded(true);
                window.requestAnimationFrame(() => searchInputRef.current?.focus());
              }
            }}
            onKeyDown={(event) => {
              if (searchExpanded || (event.key !== "Enter" && event.key !== " ")) return;
              event.preventDefault();
              setSearchExpanded(true);
              window.requestAnimationFrame(() => searchInputRef.current?.focus());
            }}
          >
            {/* Collapsed, the control is a pill rather than a bare circle: the chevron
              * tells people it opens to the right instead of jumping to another page. */}
            <span
              className={cn(
                "pointer-events-none absolute inset-y-0 z-10 flex items-center gap-0.5 transition-all duration-300",
                searchExpanded ? "left-3 text-[#2563eb]" : "inset-x-0 justify-center text-white",
              )}
            >
              <Search className="h-4 w-4 shrink-0" />
              <ChevronsRight
                aria-hidden
                className={cn(
                  "h-3.5 shrink-0 transition-all duration-300",
                  searchExpanded ? "w-0 opacity-0" : "w-3.5 opacity-80 group-hover/search:translate-x-0.5 group-hover/search:opacity-100",
                )}
              />
            </span>
            <Input
              ref={searchInputRef}
              id="global-search"
              readOnly={!searchExpanded}
              aria-label="Global search"
              className={cn(
                "h-9 w-full rounded-full pl-10 pr-4 text-sm placeholder:text-[#94a3b8]",
                searchExpanded
                  ? "cursor-text border-[#b9d2f5] bg-[#f8fbff] shadow-sm focus-visible:bg-white"
                  : "cursor-pointer border-[#2563eb] bg-[#2563eb] caret-transparent placeholder:text-transparent hover:border-[#1d4ed8] hover:bg-[#1d4ed8]",
              )}
              placeholder="Search transactions, vouchers, reports..."
              value={searchValue}
              onFocus={() => setSearchExpanded(true)}
              onChange={(event) => setSearchValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  goToSearch();
                }
              }}
            />
            {searchExpanded && searchValue.trim() ? (
              <div className="absolute left-0 top-[calc(100%+8px)] z-[90] w-full overflow-hidden rounded-2xl border border-[#dce5f1] bg-white p-1.5 shadow-[0_18px_45px_rgba(15,23,42,0.18)]">
                {instantSearchResults.length ? instantSearchResults.map((result) => (
                  <button
                    key={result.href}
                    type="button"
                    className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-[#f2f7ff]"
                    onClick={(event) => {
                      event.stopPropagation();
                      router.push(result.href);
                      setSearchValue("");
                      setSearchExpanded(false);
                    }}
                  >
                    <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#eaf2ff] text-[#2563eb]">
                      <Search className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-[#243653]">{result.title}</span>
                      <span className="block truncate text-xs text-[#738198]">{result.description}</span>
                    </span>
                  </button>
                )) : (
                  <div className="px-3 py-4 text-center text-sm text-[#78869a]">No matching page found.</div>
                )}
              </div>
            ) : null}
          </div>
        </div>

        <div ref={menuHostRef} data-shell-toolbar className="flex flex-wrap items-center gap-1.5 xl:flex-nowrap">
          <Button
            type="button"
            className="h-9 rounded-full border-transparent bg-[#eb6b20] px-4 text-[13px] font-semibold text-white hover:bg-[#d85d15]"
            onClick={() => router.push(buildSalesStartRoute(mode, workflowSettings.salesWorkflow, Date.now()))}
          >
            <Plus className="h-4 w-4" />
            {workflowSettings.salesWorkflow === "ORDER_BASED" ? "Add Sales Order" : "Add Sale"}
          </Button>
          <Button
            type="button"
            className="h-9 rounded-full border-[#2563eb] bg-[#2563eb] px-4 text-[13px] font-semibold text-white hover:bg-[#1f57cf]"
            onClick={() => router.push(buildPurchaseStartRoute(mode, workflowSettings.purchaseWorkflow))}
          >
            <Plus className="h-4 w-4" />
            {workflowSettings.purchaseWorkflow === "ORDER_BASED" ? "Add Purchase Order" : "Add Purchase Bill"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-full border-[#d7dfeb] px-4 text-[13px] font-semibold text-[#334155] hover:border-[#c6d2e1] hover:bg-[#f8fafc]"
            onClick={runPrint}
          >
            <Printer className="h-4 w-4" />
            Print
          </Button>

          <div className="relative">
            <Button
              ref={moreButtonRef}
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full border border-[#e1e8f2] text-[#475569] hover:bg-[#f3f6fa] hover:text-foreground"
              onClick={() => setOpenMenu((current) => (current === "more" ? null : "more"))}
              aria-label="More actions"
              aria-expanded={openMenu === "more"}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {openMenu === "more" && menuPosition
        ? createPortal(
            <div
              ref={menuPortalRef}
              className="fixed z-[80] w-[220px] rounded-3xl border border-[#e7edf5] bg-white p-2 shadow-[0_20px_60px_rgba(15,23,42,0.14)]"
              style={{ top: menuPosition.top, left: menuPosition.left }}
            >
              <div className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#8b97ab]">More Actions</div>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-[#f8fafc]"
                onClick={goToSearch}
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-[#eef4ff] text-[#2563eb]">
                  <Search className="h-4 w-4" />
                </span>
                <span>Open Search</span>
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-[#f8fafc]"
                onClick={handleExport}
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-[#eefaf3] text-[#16824b]">
                  <FileDown className="h-4 w-4" />
                </span>
                <span>Export Current Page</span>
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-[#f8fafc]"
                onClick={handleRefresh}
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-[#fff3e6] text-primary">
                  <RefreshCw className="h-4 w-4" />
                </span>
                <span>Refresh Page</span>
              </button>
            </div>,
            document.body,
          )
        : null}
    </header>
  );
}
