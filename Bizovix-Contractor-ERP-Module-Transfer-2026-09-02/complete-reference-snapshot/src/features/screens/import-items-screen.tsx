"use client";

import { CheckCircle2, Download, FileSpreadsheet, ListChecks, Loader2, UploadCloud, XCircle } from "lucide-react";
import { type DragEvent, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { formatAmount } from "@/lib/format";
import { useSessionContext } from "@/hooks/use-session-context";
import { cn } from "@/lib/utils";
import { readDataset, writeDataset } from "@/services/browser-dataset";
import type { StockItemRecord } from "@/types/domain";
import { createApiInventoryItem, loadInventoryItems } from "@/features/screens/inventory-screen";

const SAMPLE_HEADERS = [
  "Item Code",
  "Item Name",
  "Category",
  "Unit",
  "Sale Price",
  "Purchase Price",
  "Opening Stock Quantity",
  "Minimum Stock Quantity",
];

const SAMPLE_ROWS = [
  ["a101", "Item 1", "General Items", "pcs", "5", "4", "20", "5"],
  ["a102", "Item 2", "General Items", "pcs", "10", "8", "40", "10"],
  ["a103", "Item 3", "General Items", "pcs", "15", "12", "60", "15"],
];

const ACCEPTED_EXTENSIONS = [".xls", ".xlsx", ".csv"];

type ImportRow = Omit<StockItemRecord, "id" | "workspaceId">;

type ImportResult = {
  totalRows: number;
  importedCount: number;
  skipped: Array<{ row: number; itemName: string; reason: string }>;
};

function hasAcceptedExtension(fileName: string) {
  const normalized = fileName.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((extension) => normalized.endsWith(extension));
}

function downloadSampleFile() {
  const rows = [SAMPLE_HEADERS, ...SAMPLE_ROWS];
  const csv = rows
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "bizovix-item-import-sample.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function toNumber(value: unknown) {
  const normalized = String(value ?? "").replace(/,/g, "").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapRows(rows: unknown[][]): ImportRow[] {
  const [headers = [], ...bodyRows] = rows;
  const indexByHeader = new Map(headers.map((header, index) => [normalizeHeader(header), index]));

  const read = (row: unknown[], aliases: string[]) => {
    for (const alias of aliases) {
      const index = indexByHeader.get(alias);
      if (index !== undefined) {
        return String(row[index] ?? "").trim();
      }
    }
    return "";
  };

  return bodyRows
    .filter((row) => row.some((cell) => String(cell ?? "").trim()))
    .map((row) => {
      // Purchase Price seeds the moving-average inventory cost — it must never
      // fall back to Sale Price (a blank Purchase Price cell means $0 cost,
      // not "borrow the selling price"), or margin understates on every sale
      // drawn from that opening layer.
      const purchasePriceValue = read(row, ["purchaseprice", "openingrate", "rate"]);

      return {
        itemCode: read(row, ["itemcode", "code"]),
        itemName: read(row, ["itemname", "name"]),
        category: read(row, ["category"]) || "General Items",
        unit: read(row, ["unit"]) || "pcs",
        openingQty: toNumber(read(row, ["openingstockquantity", "openingqty", "quantity"])),
        openingRate: toNumber(purchasePriceValue),
        reorderLevel: toNumber(read(row, ["minimumstockquantity", "reorderlevel"])),
        status: read(row, ["status"]).toLowerCase() === "inactive" ? "inactive" : "active",
      };
    });
}

async function parseItemsFile(file: File): Promise<ImportRow[]> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) {
    throw new Error("No worksheet found in this file");
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  return mapRows(rows);
}

export function ImportItemsScreen() {
  const { mode, session } = useSessionContext();
  const workspaceId = session?.workspaceId ?? "";
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewRows, setPreviewRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  function handleSampleDownload() {
    downloadSampleFile();
    toast.success("Sample import file downloaded");
  }

  async function applyFile(file: File | null) {
    if (!file) {
      return;
    }

    if (!hasAcceptedExtension(file.name)) {
      toast.error("Please upload an .xls, .xlsx, or .csv file");
      return;
    }

    setSelectedFile(file);
    setImportResult(null);
    try {
      const rows = await parseItemsFile(file);
      const withNames = rows.filter((row) => row.itemName.trim());
      if (!withNames.length) {
        toast.error("No item rows found in this file");
        setPreviewRows([]);
        return;
      }

      setPreviewRows(withNames);
      toast.success(`${withNames.length} item rows are ready to import`);
    } catch (error) {
      setPreviewRows([]);
      toast.error(error instanceof Error ? error.message : "Could not read the import file");
    }
  }

  async function handleImport() {
    if (!previewRows.length || !workspaceId) {
      toast.error("Please choose a valid item import file first");
      return;
    }

    setImporting(true);
    try {
      const existingItems = await loadInventoryItems(mode, workspaceId);
      const existingCodes = new Set(existingItems.map((item) => item.itemCode.toLowerCase()));
      const skipped: ImportResult["skipped"] = [];
      const rowsToImport: Array<{ row: ImportRow; itemCode: string }> = [];

      previewRows.forEach((row, index) => {
        const itemCode = row.itemCode.trim() || `ITM-NEW-${index + 1}`;
        if (existingCodes.has(itemCode.toLowerCase())) {
          skipped.push({ row: index + 1, itemName: row.itemName, reason: "Item code already exists" });
          return;
        }

        existingCodes.add(itemCode.toLowerCase());
        rowsToImport.push({ row, itemCode });
      });

      if (mode === "api") {
        await Promise.all(
          rowsToImport.map(({ row, itemCode }) =>
            createApiInventoryItem(workspaceId, {
              itemCode,
              itemName: row.itemName,
              category: row.category,
              unit: row.unit,
              openingQty: row.openingQty,
              openingRate: row.openingRate,
              reorderLevel: row.reorderLevel,
              status: row.status,
            }),
          ),
        );
      } else {
        const dataset = readDataset(mode);
        const newItems: StockItemRecord[] = rowsToImport.map(({ row, itemCode }) => ({
          ...row,
          itemCode,
          id: `stock-${crypto.randomUUID()}`,
          workspaceId,
        }));

        writeDataset(mode, {
          ...dataset,
          stockItems: [...newItems, ...dataset.stockItems],
        });
      }

      setImportResult({ totalRows: previewRows.length, importedCount: rowsToImport.length, skipped });
      toast.success(`${rowsToImport.length} item(s) imported`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Item import failed");
    } finally {
      setImporting(false);
    }
  }

  function handleFileBrowse() {
    fileInputRef.current?.click();
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    void applyFile(event.dataTransfer.files?.[0] ?? null);
  }

  return (
    <div data-import-items-screen className="flex h-full min-h-0 flex-col overflow-hidden 2xl:min-h-[620px]">
      <div className="flex-none pb-2 2xl:pb-4">
        <div className="text-[18px] font-semibold text-[#1c2d4a] 2xl:text-[20px]">Import Items From Excel File</div>
        <div className="mt-0.5 text-xs text-muted 2xl:mt-1 2xl:text-[13px]">Bring your product catalogue into Bizovix in three quick steps.</div>
      </div>
      <div data-import-items-layout className="grid min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] xl:grid-cols-[0.82fr_1.18fr]">
        <div data-import-items-steps className="flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden border-b border-border bg-[#fafbfd] px-4 py-3 xl:border-b-0 xl:border-r 2xl:gap-5 2xl:px-6 2xl:py-6">
          <div className="flex items-center gap-2 text-[15px] font-semibold text-[#1c2d4a]">
            <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-primary-soft text-primary">
              <ListChecks className="h-4 w-4" />
            </span>
            Steps to Import
          </div>

          <div className="flex min-w-0 gap-3 2xl:gap-4">
            <div className="flex flex-none flex-col items-center">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[13px] font-bold text-white shadow-[0_4px_10px_rgba(230,120,23,0.28)]">
                1
              </span>
              <span className="mt-1 w-px flex-1 bg-border" />
            </div>
            <div className="min-w-0 flex-1 pb-1">
              <div className="text-[14px] font-semibold text-[#1c2d4a]">Prepare your Excel file</div>
              <div className="mt-1 text-xs leading-5 text-muted 2xl:text-[13px] 2xl:leading-6">Create a spreadsheet using the format below, or start from our template.</div>
              <Button
                type="button"
                variant="outline"
                className="mt-2 h-8 self-start rounded-full border-info/40 px-3 text-xs font-semibold hover:border-info/40 hover:bg-[#eef4ff] 2xl:mt-3 2xl:h-9 2xl:px-4 2xl:text-[13px]"
                style={{ color: "#2563eb" }}
                onClick={handleSampleDownload}
              >
                <Download className="h-4 w-4" />
                Download Sample
              </Button>
              <div className="mt-2 min-w-0 overflow-hidden rounded-[10px] border border-border 2xl:mt-3">
                <div data-import-items-sample-viewport className="min-w-0 overflow-hidden">
                  <table data-import-items-sample-table className="w-full table-fixed border-collapse text-[8px] text-[#19365b] 2xl:text-[9px]">
                    <colgroup>
                      <col className="w-[10%]" />
                      <col className="w-[11%]" />
                      <col className="w-[15%]" />
                      <col className="w-[8%]" />
                      <col className="w-[11%]" />
                      <col className="w-[13%]" />
                      <col className="w-[16%]" />
                      <col className="w-[16%]" />
                    </colgroup>
                    <thead>
                      <tr className="bg-[#1c2d4a] text-white">
                        {SAMPLE_HEADERS.map((header) => (
                          <th key={header} className="break-words px-1 py-1 text-left font-semibold leading-tight 2xl:px-2 2xl:py-1.5">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {SAMPLE_ROWS.map((row, rowIndex) => (
                        <tr key={`${row[0]}-${rowIndex}`} className="odd:bg-white even:bg-[#f7f9fc]">
                          {row.map((cell, cellIndex) => (
                            <td key={`${row[0]}-${rowIndex}-${cellIndex}`} className="truncate border-t border-border px-1 py-1 leading-tight 2xl:px-2">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          <div className="flex min-w-0 gap-3 2xl:gap-4">
            <div className="flex flex-none flex-col items-center">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[13px] font-bold text-white shadow-[0_4px_10px_rgba(230,120,23,0.28)]">
                2
              </span>
              <span className="mt-1 w-px flex-1 bg-border" />
            </div>
            <div className="flex-1 pb-1">
              <div className="text-[14px] font-semibold text-[#1c2d4a]">Upload the file</div>
              <div className="mt-1 flex items-start gap-2 text-xs leading-5 text-muted 2xl:text-[13px] 2xl:leading-6">
                <FileSpreadsheet className="mt-0.5 h-4 w-4 flex-none text-primary" />
                <div>
                  Upload the file <span className="font-semibold text-[#1c2d4a]">(.xlsx or .xls)</span> using the Upload File button on the right.
                </div>
              </div>
            </div>
          </div>

          <div className="flex min-w-0 gap-3 2xl:gap-4">
            <div className="flex flex-none flex-col items-center">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[13px] font-bold text-white shadow-[0_4px_10px_rgba(230,120,23,0.28)]">
                3
              </span>
            </div>
            <div className="flex-1">
              <div className="text-[14px] font-semibold text-[#1c2d4a]">Verify &amp; import</div>
              <div className="mt-1 text-xs leading-5 text-muted 2xl:text-[13px] 2xl:leading-6">Review the parsed items and confirm to complete the import.</div>
            </div>
          </div>
        </div>
        <div data-import-items-upload-panel className="flex min-h-0 min-w-0 flex-col px-4 py-3 2xl:px-8 2xl:py-5">
          <div className="flex-none text-center text-[14px] font-medium text-[#24375c] 2xl:text-[16px]">
            Upload your <span className="font-semibold">.xls / .xlsx (excel sheet)</span>
          </div>
          <div
            className={cn(
              "mt-3 flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto overflow-x-hidden rounded-2xl border-2 border-dashed bg-primary-soft/30 px-4 py-4 text-center transition-colors 2xl:mt-5 2xl:px-6 2xl:py-8",
              dragActive ? "border-primary bg-primary-soft/60" : "border-primary/30",
            )}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setDragActive(false);
            }}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xls,.xlsx,.csv"
              className="hidden"
              onChange={(event) => void applyFile(event.target.files?.[0] ?? null)}
            />
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary to-[#ffab5c] text-white shadow-[0_16px_32px_rgba(230,120,23,0.25)] 2xl:h-20 2xl:w-20">
              <UploadCloud className="h-7 w-7 2xl:h-9 2xl:w-9" />
            </div>
            <div className="mt-3 text-[17px] font-medium text-[#1c2d4a] 2xl:mt-5 2xl:text-[19px]">Drag &amp; Drop files here</div>
            <div className="mt-1 text-xs text-muted 2xl:mt-2 2xl:text-[14px]">or</div>
            <Button
              type="button"
              className="mt-3 h-9 rounded-full bg-primary px-5 text-[14px] font-semibold text-white shadow-[0_10px_22px_rgba(230,120,23,0.2)] hover:bg-[#cf670f] 2xl:mt-4 2xl:h-10 2xl:px-6 2xl:text-[15px]"
              onClick={handleFileBrowse}
            >
              <UploadCloud className="h-5 w-5" />
              Upload File
            </Button>
            <div className="mt-3 flex items-center justify-center gap-1.5 2xl:mt-4">
              {ACCEPTED_EXTENSIONS.map((extension) => (
                <span key={extension} className="rounded-full border border-border bg-white px-2.5 py-0.5 text-[11px] font-medium text-muted">
                  {extension}
                </span>
              ))}
            </div>
            {selectedFile ? (
              <div className="mx-auto mt-6 flex w-full max-w-[560px] items-center gap-3 rounded-[12px] border border-border bg-white px-4 py-3 text-left shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-primary-soft text-primary">
                  <FileSpreadsheet className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold text-[#1c2d4a]">{selectedFile.name}</div>
                  <div className="mt-0.5 text-[13px] text-muted">
                    Ready to verify and import • {(selectedFile.size / 1024).toFixed(1)} KB
                  </div>
                </div>
              </div>
            ) : null}
            {previewRows.length ? (
              <div className="mx-auto mt-4 w-full max-w-[720px] overflow-hidden rounded-[10px] border border-border bg-white text-left">
                <div className="flex items-center justify-between border-b border-border bg-[#fafbfd] px-3 py-2">
                  <div className="text-[13px] font-semibold text-[#1c2d4a]">{previewRows.length} rows found</div>
                  <Button type="button" size="sm" className="h-8" onClick={() => void handleImport()} disabled={importing}>
                    {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Import to DB
                  </Button>
                </div>
                <div className="max-h-[160px] overflow-auto">
                  <table className="min-w-full text-[12px] text-[#233a5f]">
                    <thead className="sticky top-0 bg-[#f6f9fe]">
                      <tr>
                        {["Item Code", "Item Name", "Category", "Opening Qty", "Rate"].map((header) => (
                          <th key={header} className="whitespace-nowrap border-b border-border px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.slice(0, 8).map((row, index) => (
                        <tr key={`${row.itemCode}-${index}`} className="odd:bg-white even:bg-[#fafbfd]">
                          <td className="whitespace-nowrap border-b border-border px-3 py-2">{row.itemCode || "Auto-generated"}</td>
                          <td className="whitespace-nowrap border-b border-border px-3 py-2">{row.itemName}</td>
                          <td className="whitespace-nowrap border-b border-border px-3 py-2">{row.category}</td>
                          <td className="whitespace-nowrap border-b border-border px-3 py-2">{row.openingQty}</td>
                          <td className="whitespace-nowrap border-b border-border px-3 py-2 tabular-nums">{formatAmount(row.openingRate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
            {importResult ? (
              <div className="mx-auto mt-4 max-h-[110px] w-full max-w-[720px] overflow-auto rounded-[10px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-left text-[12px] text-[#233a5f]">
                <div className="flex items-center gap-2 font-semibold text-emerald-700">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Imported {importResult.importedCount} of {importResult.totalRows} rows
                </div>
                {importResult.skipped.length ? (
                  <div className="mt-2 space-y-1">
                    {importResult.skipped.slice(0, 5).map((row) => (
                      <div key={`${row.row}-${row.itemName}-${row.reason}`} className="flex gap-2 text-[#7a3450]">
                        <XCircle className="mt-0.5 h-3.5 w-3.5 flex-none" />
                        Row {row.row}: {row.itemName || "Unnamed"} - {row.reason}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
