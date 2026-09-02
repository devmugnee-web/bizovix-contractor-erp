"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { TablePagination } from "@/components/shared/table-pagination";
import { appConfig } from "@/config/app";
import { getModuleDefinition, type ModuleSection } from "@/config/module-registry";
import { useSessionContext } from "@/hooks/use-session-context";
import { buildWorkspaceRoute } from "@/config/routes";
import { useTransientScrollbar } from "@/hooks/use-transient-scrollbar";
import { downloadCsv } from "@/lib/download";
import { formatDateTime } from "@/lib/format";
import { readDataset } from "@/services/browser-dataset";
const PartiesScreen = dynamic(() => import("@/features/screens/parties-screen").then((module) => module.PartiesScreen));
const InventoryScreen = dynamic(() => import("@/features/screens/inventory-screen").then((module) => module.InventoryScreen));
const BankAccountsScreen = dynamic(() => import("@/features/screens/bank-accounts-screen").then((module) => module.BankAccountsScreen));
const MfsAccountsScreen = dynamic(() => import("@/features/screens/mfs-accounts-screen").then((module) => module.MfsAccountsScreen));
const BankTransfersScreen = dynamic(() => import("@/features/screens/bank-transfers-screen").then((module) => module.BankTransfersScreen));
const CashInHandScreen = dynamic(() => import("@/features/screens/cash-in-hand-screen").then((module) => module.CashInHandScreen));
const ChequesScreen = dynamic(() => import("@/features/screens/cheques-screen").then((module) => module.ChequesScreen));
const LoanAccountsScreen = dynamic(() => import("@/features/screens/loan-accounts-screen").then((module) => module.LoanAccountsScreen));
const ReportsWorkspaceScreen = dynamic(() => import("@/features/screens/reports-workspace-screen").then((module) => module.ReportsWorkspaceScreen));
const SyncShareScreen = dynamic(() => import("@/features/screens/sync-share-screen").then((module) => module.SyncShareScreen));
const AutoBackupScreen = dynamic(() => import("@/features/screens/auto-backup-screen").then((module) => module.AutoBackupScreen));
const BackupToComputerScreen = dynamic(() => import("@/features/screens/backup-to-computer-screen").then((module) => module.BackupToComputerScreen));
const BackupToDriveScreen = dynamic(() => import("@/features/screens/backup-to-drive-screen").then((module) => module.BackupToDriveScreen));
const CloseFinancialYearScreen = dynamic(() => import("@/features/screens/close-financial-year-screen").then((module) => module.CloseFinancialYearScreen));
const ExportItemsScreen = dynamic(() => import("@/features/screens/export-items-screen").then((module) => module.ExportItemsScreen));
const ExportToTallyScreen = dynamic(() => import("@/features/screens/export-to-tally-screen").then((module) => module.ExportToTallyScreen));
const ImportItemsScreen = dynamic(() => import("@/features/screens/import-items-screen").then((module) => module.ImportItemsScreen));
const ImportPartiesScreen = dynamic(() => import("@/features/screens/import-parties-screen").then((module) => module.ImportPartiesScreen));
const RecycleBinScreen = dynamic(() => import("@/features/screens/recycle-bin-screen").then((module) => module.RecycleBinScreen));
const RestoreBackupScreen = dynamic(() => import("@/features/screens/restore-backup-screen").then((module) => module.RestoreBackupScreen));
const UpdateItemsBulkScreen = dynamic(() => import("@/features/screens/update-items-bulk-screen").then((module) => module.UpdateItemsBulkScreen));
const VerifyMyDataScreen = dynamic(() => import("@/features/screens/verify-my-data-screen").then((module) => module.VerifyMyDataScreen));

function slugifyFileSegment(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "workspace";
}

function formatBackupTimestampForFile(value: Date) {
  const pad = (input: number) => input.toString().padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}_${pad(value.getHours())}-${pad(value.getMinutes())}-${pad(value.getSeconds())}`;
}

function formatBackupTimestampForRow(value: Date) {
  return formatDateTime(value);
}

type ModuleScreenProps = { section: ModuleSection; slug: string };

export function ModuleScreen(props: ModuleScreenProps) {
  return <ModuleScreenContent key={`${props.section}:${props.slug}`} {...props} />;
}

function ModuleScreenContent({ section, slug }: ModuleScreenProps) {
  if (section === "masters" && slug === "parties") {
    return <PartiesScreen />;
  }

  if (section === "masters" && slug === "inventory") {
    return <InventoryScreen />;
  }

  if (section === "masters" && slug === "settings") {
    return <AutoBackupScreen />;
  }

  if (section === "utilities" && slug === "bank-accounts") {
    return <BankAccountsScreen />;
  }

  if (section === "utilities" && slug === "mfs-accounts") {
    return <MfsAccountsScreen />;
  }

  if (section === "utilities" && slug === "bank-transfers") {
    return <BankTransfersScreen />;
  }

  if (section === "utilities" && slug === "cash-in-hand") {
    return <CashInHandScreen />;
  }

  if (section === "utilities" && slug === "cheques") {
    return <ChequesScreen />;
  }

  if (section === "utilities" && slug === "loan-accounts") {
    return <LoanAccountsScreen />;
  }

  if (section === "utilities" && slug === "sync-share") {
    return <SyncShareScreen />;
  }

  if (section === "utilities" && slug === "auto-backup") {
    return <AutoBackupScreen />;
  }

  if (section === "utilities" && slug === "backup-to-computer") {
    return <BackupToComputerScreen />;
  }

  if (section === "utilities" && slug === "backup-to-drive") {
    return <BackupToDriveScreen />;
  }

  if (section === "utilities" && slug === "close-financial-year") {
    return <CloseFinancialYearScreen />;
  }

  if (section === "utilities" && slug === "restore-backup") {
    return <RestoreBackupScreen />;
  }

  if (section === "utilities" && slug === "import-items") {
    return <ImportItemsScreen />;
  }

  if (section === "utilities" && slug === "export-items") {
    return <ExportItemsScreen />;
  }

  if (section === "utilities" && slug === "update-items-bulk") {
    return <UpdateItemsBulkScreen />;
  }

  if (section === "utilities" && slug === "import-parties") {
    return <ImportPartiesScreen />;
  }

  if (section === "utilities" && slug === "recycle-bin") {
    return <RecycleBinScreen />;
  }

  if (section === "utilities" && slug === "verify-my-data") {
    return <VerifyMyDataScreen />;
  }

  if (section === "utilities" && slug === "export-to-tally") {
    return <ExportToTallyScreen />;
  }

  if (section === "reports") {
    return <ReportsWorkspaceScreen slug={slug} />;
  }

  const router = useRouter();
  const searchParams = useSearchParams();
  const { mode, session } = useSessionContext();
  const moduleDefinition = getModuleDefinition(section, slug);
  const tableScrollRef = useTransientScrollbar<HTMLDivElement>();
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [activeAction, setActiveAction] = useState("");
  const [draftRow, setDraftRow] = useState<Record<string, string>>({});
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const inventoryWorkspaceTabs = ["Products", "Services", "Category", "Units"];

  useEffect(() => {
    if (!moduleDefinition) {
      return;
    }

    setRows(moduleDefinition.rows);
  }, [moduleDefinition]);

  const focusColumn = searchParams.get("focusColumn");
  const focusValue = searchParams.get("focusValue");
  const visibleRows = useMemo(() => {
    if (!focusColumn || !focusValue) {
      return rows;
    }

    const needle = focusValue.toLowerCase();
    return rows.filter((row) => String(row[focusColumn] ?? "").toLowerCase().includes(needle));
  }, [focusColumn, focusValue, rows]);
  const pagedRows = useMemo(() => visibleRows.slice((page - 1) * pageSize, page * pageSize), [page, pageSize, visibleRows]);
  const totalPages = Math.max(1, Math.ceil(visibleRows.length / pageSize));

  useEffect(() => {
    setPage(1);
  }, [focusColumn, focusValue, pageSize, rows]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  function buildEmptyRow() {
    if (!moduleDefinition) {
      return {};
    }

    return Object.fromEntries(moduleDefinition.columns.map((column) => [column, ""])) as Record<string, string>;
  }

  function downloadJson(filename: string, payload: unknown) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const activeWorkspaceId = session?.workspaceId ?? "default";
  const activeWorkspaceName = useMemo(() => {
    if (!activeWorkspaceId) {
      return "Current Workspace";
    }

    if (mode === "api") {
      return activeWorkspaceId;
    }

    return readDataset(mode).workspaces.find((workspace) => workspace.id === activeWorkspaceId)?.name ?? activeWorkspaceId;
  }, [activeWorkspaceId, mode]);

  function buildWorkspaceBackupExport() {
    if (typeof window === "undefined") {
      return null;
    }

    const now = new Date();
    const scopedStorageEntries = Object.keys(window.localStorage)
      .sort()
      .reduce<Record<string, unknown>>((entries, key) => {
        if (!key.startsWith("bizovix:") || !key.includes(`:${mode}:${activeWorkspaceId}`)) {
          return entries;
        }

        const raw = window.localStorage.getItem(key);
        if (raw === null) {
          return entries;
        }

        try {
          entries[key] = JSON.parse(raw) as unknown;
        } catch {
          entries[key] = raw;
        }

        return entries;
      }, {});

    const datasetSlice =
      mode === "api"
        ? null
        : (() => {
            const dataset = readDataset(mode);
            return {
              workspace: dataset.workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null,
              parties: dataset.parties.filter((party) => party.workspaceId === activeWorkspaceId),
              stockItems: dataset.stockItems.filter((item) => item.workspaceId === activeWorkspaceId),
              vouchers: dataset.vouchers.filter((voucher) => voucher.workspaceId === activeWorkspaceId),
            };
          })();

    const filename = `${formatBackupTimestampForFile(now)}_${slugifyFileSegment(activeWorkspaceName)}_bizovix-workspace-backup.fyb`;
    const payload = {
      appName: appConfig.appName,
      exportType: "workspace-slice-backup",
      exportedAt: now.toISOString(),
      companyName: appConfig.companyName,
      mode,
      scope: {
        workspaceOnly: true,
        workspaceId: activeWorkspaceId,
        workspaceName: activeWorkspaceName,
        included: [
          "Active workspace metadata",
          "Workspace-specific parties",
          "Workspace-specific stock items",
          "Workspace-specific vouchers",
          "Workspace-scoped local module settings",
        ],
        excluded: [
          "Other workspaces",
          "Global session storage",
          "Full database dump",
          "Cross-workspace records",
        ],
      },
      data: {
        dataset: datasetSlice,
        localStorage: scopedStorageEntries,
      },
    };

    return {
      filename,
      payload,
      row: {
        Package: filename,
        Scope: `${activeWorkspaceName} Only`,
        "Saved Location": "Downloads",
        "Created On": formatBackupTimestampForRow(now),
        Status: "Ready",
      } satisfies Record<string, string>,
    };
  }

  function openActionDialog(action: string, preset: Record<string, string>, rowIndex: number | null = null) {
    setActiveAction(action);
    setDraftRow(preset);
    setEditingRowIndex(rowIndex);
    setActionDialogOpen(true);
  }

  function handleAction(action: string) {
    if (!moduleDefinition) {
      return;
    }

    if (moduleDefinition.slug === "backup-to-computer") {
      if (action === "Create Local Backup" || action === "Download Latest Backup") {
        if (!session?.workspaceId) {
          toast.error("Active workspace not found");
          return;
        }

        const backupExport = buildWorkspaceBackupExport();
        if (!backupExport) {
          toast.error("Backup export is unavailable right now");
          return;
        }

        downloadJson(backupExport.filename, backupExport.payload);
        setRows((current) => [backupExport.row, ...current.filter((row) => row.Package !== backupExport.row.Package)]);
        toast.success(`${activeWorkspaceName} backup downloaded. Only the active workspace was exported.`);
        return;
      }

      if (action === "Verify Backup File") {
        const scopedKeys = typeof window === "undefined"
          ? 0
          : Object.keys(window.localStorage).filter((key) => key.startsWith("bizovix:") && key.includes(`:${mode}:${activeWorkspaceId}`)).length;

        toast.success(`Backup package verified for ${activeWorkspaceName}. Scope is limited to this workspace across ${scopedKeys} local modules.`);
        return;
      }
    }

    if (action.includes("Export")) {
      downloadCsv(`${moduleDefinition.slug}.csv`, rows);
      toast.success(`${moduleDefinition.title} exported`);
      return;
    }

    if (action === "Download Config") {
      downloadJson(`${moduleDefinition.slug}-config.json`, rows);
      toast.success("Configuration downloaded");
      return;
    }

    if (moduleDefinition.slug === "settings" && action === "Edit Preferences") {
      router.push(buildWorkspaceRoute(mode, "/utilities/auto-backup"));
      return;
    }

    if (action.includes("Print")) {
      window.print();
      return;
    }

    if (action === "Switch Workspace") {
      router.push(buildWorkspaceRoute(mode, "/dashboard"));
      return;
    }

    if (action === "View Members") {
      router.push(buildWorkspaceRoute(mode, "/masters/customers"));
      return;
    }

    if (action === "Voucher Numbering") {
      const rowIndex = rows.findIndex((row) => String(row.Setting ?? "").includes("Prefix"));
      openActionDialog(action, rowIndex >= 0 ? { ...rows[rowIndex] } : buildEmptyRow(), rowIndex >= 0 ? rowIndex : null);
      return;
    }

    if (action.startsWith("Edit")) {
      openActionDialog(action, rows[0] ? { ...rows[0] } : buildEmptyRow(), rows[0] ? 0 : null);
      return;
    }

    openActionDialog(action, buildEmptyRow());
  }

  function handleSaveAction() {
    if (!moduleDefinition) {
      return;
    }

    const sanitized = Object.fromEntries(
      moduleDefinition.columns.map((column) => [column, String(draftRow[column] ?? "").trim() || "-"]),
    ) as Record<string, string>;

    setRows((current) => {
      if (editingRowIndex !== null && current[editingRowIndex]) {
        const next = [...current];
        next[editingRowIndex] = sanitized;
        return next;
      }

      return [sanitized, ...current];
    });

    toast.success(`${activeAction} completed`);
    setActionDialogOpen(false);
    setActiveAction("");
    setDraftRow({});
    setEditingRowIndex(null);
  }

  useEffect(() => {
    if (!moduleDefinition) {
      return;
    }

    const exportHandler = () => {
      downloadCsv(`${moduleDefinition.slug}.csv`, rows);
      toast.success(`${moduleDefinition.title} exported`);
    };

    window.addEventListener("erp-export-request", exportHandler as EventListener);
    return () => window.removeEventListener("erp-export-request", exportHandler as EventListener);
  }, [moduleDefinition, rows]);

  if (!moduleDefinition) {
    return (
      <div className="erp-card p-8">
        <h1 className="text-2xl font-semibold">Module not found</h1>
        <p className="mt-2 text-sm text-muted">This navigation surface has not been registered yet.</p>
      </div>
    );
  }

  const isManufacturing = moduleDefinition.slug === "manufacturing";

  return (
    <div className={isManufacturing ? "flex min-h-[calc(100dvh-11rem)] flex-col gap-4 xl:h-full xl:min-h-0" : "space-y-4"}>
      <PageHeader
        title={moduleDefinition.title}
        description={
          focusColumn && focusValue
            ? `${moduleDefinition.description} Focused on ${focusValue.toLowerCase()} ${focusColumn.toLowerCase()}.`
            : moduleDefinition.description
        }
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => {
                downloadCsv(`${moduleDefinition.slug}.csv`, rows);
                toast.success(`${moduleDefinition.title} exported`);
              }}
            >
              Export
            </Button>
            <Button onClick={() => handleAction(moduleDefinition.actions[0])}>{moduleDefinition.actions[0]}</Button>
          </>
        }
      />
      {moduleDefinition.slug === "inventory" ? (
        <div className="overflow-x-auto border-b border-border bg-white">
          <div className="flex min-w-[720px] items-center">
            {inventoryWorkspaceTabs.map((tab, index) => (
              <button
                key={tab}
                type="button"
                className={`relative flex-1 border-b-2 px-6 py-4 text-center text-sm font-semibold uppercase tracking-[0.08em] transition-colors ${
                  index === 0
                    ? "border-[#2196f3] text-foreground"
                    : "border-transparent text-muted hover:text-foreground"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {moduleDefinition.hierarchy?.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Master Structure</CardTitle>
            <CardDescription>Organized create, alter, and chart-of-accounts hierarchy for the selected module.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 xl:grid-cols-3">
              {moduleDefinition.hierarchy.map((section) => (
                <div key={section.title} className="rounded-3xl border border-border bg-canvas/60 p-4">
                  <div className="text-base font-semibold text-foreground">{section.title}</div>
                  <div className="mt-4 space-y-4">
                    {section.groups.map((group) => (
                      <div key={`${section.title}-${group.title}`} className="space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{group.title}</div>
                        <div className="flex flex-wrap gap-2">
                          {group.items.map((item) => (
                            <span
                              key={`${section.title}-${group.title}-${item}`}
                              className="rounded-full border border-border bg-white px-3 py-1.5 text-sm text-[#23344d]"
                            >
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
      <div className={`grid gap-4 xl:grid-cols-[1.15fr_0.85fr] ${isManufacturing ? "min-h-0 flex-1 items-stretch" : ""}`}>
        <Card className={isManufacturing ? "flex min-h-[520px] flex-col xl:min-h-0" : undefined}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-primary-soft p-3 text-primary">
                <moduleDefinition.icon className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>{moduleDefinition.title} Workspace</CardTitle>
                <CardDescription>{moduleDefinition.description}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className={`overflow-hidden px-0 sm:px-5 ${isManufacturing ? "flex flex-1 flex-col" : ""}`}>
            <div ref={tableScrollRef} className="transient-scrollbar overflow-x-auto px-4 sm:px-0">
              <table className="data-table min-w-[720px] text-sm sm:min-w-full">
                <thead className="bg-canvas">
                  <tr>
                    {moduleDefinition.columns.map((column) => (
                      <th key={column} className="text-left">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.length ? (
                    pagedRows.map((row, index) => (
                      <tr key={`${moduleDefinition.slug}-${index}`}>
                        {moduleDefinition.columns.map((column) => (
                          <td key={column}>{row[column] ?? "-"}</td>
                        ))}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={moduleDefinition.columns.length} className="py-6 text-center text-sm text-muted">
                        No matching records found for the selected focus.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <TablePagination
              className={isManufacturing ? "mt-auto px-4 pb-0 sm:px-0" : "mt-4 px-4 pb-0 sm:px-0"}
              page={page}
              pageSize={pageSize}
              totalItems={visibleRows.length}
              pageSizeOptions={[10, 25, 50, 100]}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </CardContent>
        </Card>
        <Card className={isManufacturing ? "flex min-h-[520px] flex-col xl:min-h-0" : undefined}>
          <CardHeader>
            <CardTitle>Working Actions</CardTitle>
            <CardDescription>Each action is wired for a realistic mock workflow.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {moduleDefinition.actions.map((action) => (
              <button
                key={action}
                className="flex w-full items-center justify-between rounded-2xl border border-border px-4 py-3 text-left transition-colors hover:bg-canvas"
                onClick={() => handleAction(action)}
              >
                <span className="font-medium">{action}</span>
                <span className="text-sm text-muted">Open</span>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>
      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent submitOnEnter>
          <DialogTitle className="text-lg font-semibold">{activeAction || "Working Action"}</DialogTitle>
          <DialogDescription className="text-sm text-muted">
            Update the relevant fields below and save to continue the workflow from this module screen.
          </DialogDescription>
          <form
            className="contents"
            onSubmit={(event) => {
              event.preventDefault();
              handleSaveAction();
            }}
          >
            <div className="grid gap-3 pt-4">
              {moduleDefinition.columns.map((column) => (
                <div key={column} className="space-y-2">
                  <label className="text-sm font-medium">{column}</label>
                  <Input
                    value={draftRow[column] ?? ""}
                    onChange={(event) =>
                      setDraftRow((current) => ({
                        ...current,
                        [column]: event.target.value,
                      }))
                    }
                  />
                </div>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button type="submit" data-enter-submit>
                <CheckCircle2 className="h-5 w-5" />
                {editingRowIndex !== null ? "Save Changes" : "Save Entry"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setActionDialogOpen(false);
                  setActiveAction("");
                  setDraftRow({});
                  setEditingRowIndex(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

