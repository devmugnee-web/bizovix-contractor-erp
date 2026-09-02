"use client";

import { CheckCircle2, Download, Loader2, UploadCloud, XCircle } from "lucide-react";
import { type DragEvent, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { formatAmount } from "@/lib/format";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/services/api-client";
import { useSessionStore } from "@/stores/session-store";

const ACCEPTED_EXTENSIONS = [".xls", ".xlsx", ".csv"];

const PARTY_TEMPLATE_HEADERS = [
  "Party Name",
  "Party Type",
  "Contact",
  "Email",
  "Address",
  "Opening Balance",
  "Credit Limit",
  "Status",
];

const PARTY_TEMPLATE_ROWS = [
  ["Rahim Traders", "Customer", "01711223344", "rahim@bizovix.app", "Motijheel, Dhaka", "0", "500000", "Active"],
  ["S. S. Corporation", "Supplier", "01844998877", "ss@bizovix.app", "Chattogram", "12000", "250000", "Active"],
  ["Masud Enterprise", "Customer", "01911664422", "masud@bizovix.app", "Narayanganj", "0", "300000", "Active"],
];

type PartyImportRow = {
  name: string;
  type: string;
  contact: string;
  email: string;
  address: string;
  openingBalance: number;
  creditLimit: number;
  status: string;
};

type ImportResult = {
  totalRows: number;
  importedCount: number;
  skippedCount: number;
  skipped: Array<{ row: number; name: string; reason: string }>;
};

function hasAcceptedExtension(fileName: string) {
  const normalized = fileName.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((extension) => normalized.endsWith(extension));
}

function downloadPartyTemplate() {
  const rows = [PARTY_TEMPLATE_HEADERS, ...PARTY_TEMPLATE_ROWS];
  const csv = rows
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "bizovix-party-import-template.csv";
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

function mapRows(rows: unknown[][]) {
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
    .map((row) => ({
      name: read(row, ["partyname", "name"]),
      type: read(row, ["partytype", "type"]) || "Customer",
      contact: read(row, ["contact", "phone", "mobile"]),
      email: read(row, ["email", "emailaddress"]),
      address: read(row, ["address"]),
      openingBalance: toNumber(read(row, ["openingbalance", "opening"])),
      creditLimit: toNumber(read(row, ["creditlimit", "limit"])),
      status: read(row, ["status"]) || "Active",
    }));
}

async function parsePartyFile(file: File) {
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

function XlsDocumentIcon({ large = false }: { large?: boolean }) {
  const size = large ? "h-[150px] w-[150px] 2xl:h-[170px] 2xl:w-[170px]" : "h-[92px] w-[92px] 2xl:h-[112px] 2xl:w-[112px]";
  const labelSize = large ? "text-[42px] 2xl:text-[48px]" : "text-[24px] 2xl:text-[28px]";

  return (
    <div className={cn("relative mx-auto", size)}>
      <div className="absolute bottom-0 left-[18px] right-0 top-[18px] rounded-[18px] bg-[#cdd4de]" />
      <div className="absolute inset-y-0 left-0 w-[78%] rounded-[20px] bg-[#2d86ed]" />
      <div className="absolute right-0 top-0 h-[42%] w-[34%] rounded-bl-[22px] bg-[#cde2fb]" />
      <div className="absolute bottom-[16%] left-0 right-[22%] text-center font-semibold uppercase tracking-[0.18em] text-white">
        <span className={labelSize}>xls</span>
      </div>
    </div>
  );
}

function UploadSheetIcon() {
  return (
    <div className="relative mx-auto h-[112px] w-[112px] 2xl:h-[168px] 2xl:w-[168px]">
      <div className="absolute bottom-0 left-[24px] right-0 top-[24px] rounded-[28px] bg-[#c9ced7]" />
      <div className="absolute inset-y-0 left-0 w-[74%] rounded-[34px] bg-[#2c85eb]" />
      <div className="absolute right-0 top-0 h-[42%] w-[34%] rounded-bl-[28px] bg-[#c9e1fb]" />
      <div className="absolute left-[33%] top-[31%] h-[36px] w-[36px] -translate-x-1/2 rotate-45 border-l-[8px] border-t-[8px] border-white 2xl:h-[54px] 2xl:w-[54px] 2xl:border-l-[10px] 2xl:border-t-[10px]" />
      <div className="absolute left-[33%] top-[48%] h-[38px] w-[14px] -translate-x-1/2 rounded-[5px] bg-white 2xl:h-[52px] 2xl:w-[18px]" />
      <div className="absolute left-[33%] top-[68%] h-[5px] w-[32px] -translate-x-1/2 rounded-full bg-white 2xl:h-[6px] 2xl:w-[46px]" />
      <div className="absolute left-[33%] top-[76%] h-[5px] w-[32px] -translate-x-1/2 rounded-full bg-white 2xl:h-[6px] 2xl:w-[46px]" />
      <div className="absolute left-[33%] top-[84%] h-[5px] w-[32px] -translate-x-1/2 rounded-full bg-white 2xl:h-[6px] 2xl:w-[46px]" />
    </div>
  );
}

export function ImportPartiesScreen() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const workspaceId = useSessionStore((state) => state.appSession?.workspaceId ?? "");
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewRows, setPreviewRows] = useState<PartyImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  function handleTemplateDownload() {
    downloadPartyTemplate();
    toast.success("Party import template downloaded");
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
      const rows = await parsePartyFile(file);
      if (!rows.length) {
        toast.error("No party rows found in this file");
        setPreviewRows([]);
        return;
      }

      setPreviewRows(rows);
      toast.success(`${rows.length} party rows are ready to import`);
    } catch (error) {
      setPreviewRows([]);
      toast.error(error instanceof Error ? error.message : "Could not read the import file");
    }
  }

  async function handleImport() {
    if (!previewRows.length) {
      toast.error("Please choose a valid party import file first");
      return;
    }

    setImporting(true);
    try {
      const result = await apiRequest<ImportResult>("/parties/import", {
        method: "POST",
        body: JSON.stringify({ workspaceId, parties: previewRows }),
      });
      setImportResult(result);
      toast.success(`${result.importedCount} parties imported to database`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Party import failed");
    } finally {
      setImporting(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    applyFile(event.dataTransfer.files?.[0] ?? null);
  }

  return (
    <div data-import-parties-screen className="flex h-full min-h-0 flex-col overflow-hidden rounded-[4px] border border-[#dde5ef] bg-white shadow-[0_18px_45px_rgba(15,23,42,0.05)] 2xl:min-h-[620px]">
      <div className="flex flex-none items-center justify-between px-5 py-2.5 sm:px-6">
        <div className="text-[18px] font-semibold text-[#1d3150]">Import Parties</div>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#d3d4da] text-white transition-colors hover:bg-[#b9bcc7]"
          onClick={() => window.history.back()}
        >
          ×
        </button>
      </div>

      <div data-import-parties-layout className="grid min-h-0 flex-1 overflow-hidden xl:grid-cols-[0.72fr_1.28fr]">
        <div data-import-parties-template-panel className="flex min-h-0 flex-col items-center justify-center gap-5 border-b border-[#e7edf4] px-4 py-4 xl:border-b-0 xl:border-r 2xl:gap-7 2xl:px-5 2xl:py-5">
          <div className="mx-auto max-w-[300px] text-center text-[15px] leading-6 text-[#172a47] lg:text-[16px]">
            Download .xls/.xlsx (excel sheet)
            <br />
            template file to enter Data
          </div>
          <XlsDocumentIcon />
          <div className="text-center">
            <Button
              type="button"
              className="h-9 min-w-[130px] rounded-[8px] bg-[#1f80f5] px-5 text-[14px] font-medium text-white shadow-[0_8px_18px_rgba(15,23,42,0.14)] hover:bg-[#176fd8]"
              onClick={handleTemplateDownload}
            >
              <Download className="h-4 w-4" />
              Download
            </Button>
          </div>
        </div>

        <div data-import-parties-upload-panel className="flex min-h-0 min-w-0 flex-col px-4 py-3 2xl:px-7 2xl:py-4">
          <div className="flex-none text-center text-[15px] font-medium text-[#162a46] lg:text-[16px]">
            Upload your .xls/ .xlsx (excel sheet)
          </div>
          <div
            className={cn(
              "mx-auto mt-3 flex min-h-0 w-full max-w-[980px] flex-1 flex-col justify-center overflow-x-hidden overflow-y-auto rounded-[8px] border-2 border-dashed px-4 py-3 text-center transition-colors 2xl:mt-6 2xl:px-6 2xl:py-6",
              dragActive ? "border-[#8fb8ef] bg-[#f5f9ff]" : "border-[#cacaca] bg-[#fcfcfc]",
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
            {!selectedFile ? (
              <>
                <UploadSheetIcon />
                <div className="mt-3 text-[14px] leading-5 text-[#192b47] 2xl:mt-4 2xl:text-[15px] 2xl:leading-6">
                  Drag and drop or{" "}
                  <button
                    type="button"
                    className="font-medium text-[#1d75eb] underline underline-offset-2"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Click here to Browse
                  </button>
                  <br />
                  formatted excel file to continue
                </div>
                <div className="mt-2 text-[12px] text-[#7788a4]">Supported formats: .xls, .xlsx, .csv</div>
              </>
            ) : null}
            {selectedFile ? (
              <div className="mx-auto mt-3 max-w-[520px] rounded-[10px] border border-[#d8e5f6] bg-white px-4 py-2.5 text-left shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
                <div className="truncate text-[13px] font-semibold text-[#193153]">{selectedFile.name}</div>
                <div className="mt-0.5 text-[12px] text-[#6f809b]">
                  Ready to verify and import • {(selectedFile.size / 1024).toFixed(1)} KB
                </div>
              </div>
            ) : null}
            {previewRows.length ? (
              <div className="mx-auto mt-3 max-h-[170px] w-full max-w-[720px] overflow-hidden rounded-[10px] border border-[#d8e5f6] bg-white text-left">
                <div className="flex items-center justify-between border-b border-[#e6edf7] px-3 py-2">
                  <div className="text-[13px] font-semibold text-[#183153]">{previewRows.length} rows found</div>
                  <Button type="button" size="sm" className="h-8 bg-[#1f80f5] hover:bg-[#176fd8]" onClick={handleImport} disabled={importing}>
                    {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Import to DB
                  </Button>
                </div>
                <div className="max-h-[120px] overflow-auto">
                  <table className="min-w-full text-[12px] text-[#233a5f]">
                    <thead className="sticky top-0 bg-[#f6f9fe]">
                      <tr>
                        {["Name", "Type", "Contact", "Opening", "Limit"].map((header) => (
                          <th key={header} className="border-b border-[#e6edf7] px-3 py-2 text-left font-semibold">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.slice(0, 8).map((row, index) => (
                        <tr key={`${row.name}-${index}`}>
                          <td className="border-b border-[#eef3fa] px-3 py-2">{row.name || "Missing name"}</td>
                          <td className="border-b border-[#eef3fa] px-3 py-2">{row.type}</td>
                          <td className="border-b border-[#eef3fa] px-3 py-2">{row.contact}</td>
                          <td className="border-b border-[#eef3fa] px-3 py-2 tabular-nums">{formatAmount(row.openingBalance)}</td>
                          <td className="border-b border-[#eef3fa] px-3 py-2 tabular-nums">{formatAmount(row.creditLimit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
            {importResult ? (
              <div className="mx-auto mt-3 max-h-[110px] w-full max-w-[720px] overflow-auto rounded-[10px] border border-[#d8e5f6] bg-white px-3 py-2 text-left text-[12px] text-[#233a5f]">
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Imported {importResult.importedCount} of {importResult.totalRows} rows
                </div>
                {importResult.skippedCount ? (
                  <div className="mt-2 space-y-1">
                    {importResult.skipped.slice(0, 5).map((row) => (
                      <div key={`${row.row}-${row.name}-${row.reason}`} className="flex gap-2 text-[#7a3450]">
                        <XCircle className="mt-0.5 h-3.5 w-3.5 flex-none" />
                        Row {row.row}: {row.name || "Unnamed"} - {row.reason}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="mt-3 flex justify-center">
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-full border-[#d6e0ef] px-5 text-[13px] font-medium"
                onClick={() => fileInputRef.current?.click()}
              >
                <UploadCloud className="h-4 w-4" />
                Upload File
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

