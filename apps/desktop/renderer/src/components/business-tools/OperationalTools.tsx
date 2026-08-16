"use client";
import * as React from "react";
import QRCode from "qrcode";
import Image from "next/image";
import { Copy, Download, Plus, Printer, QrCode, RotateCcw, Save, Upload } from "lucide-react";
import { PrimaryButton, SecondaryButton, SelectInput, TextInput } from "@bizovix/ui";
import { copyText } from "@/lib/business-tools";
import { Card, Field, Result, ToolLayout } from "./ToolLayout";
type Check = { name: string; group: string; required: boolean; status: string; remarks: string };
const names = [
  ["Tender Schedule", "Tender Documents"],
  ["Tender Security", "Bank Instruments"],
  ["Trade License", "Company Documents"],
  ["TIN Certificate", "Company Documents"],
  ["BIN/VAT Certificate", "Company Documents"],
  ["Company Registration", "Company Documents"],
  ["Bank Solvency", "Financial Documents"],
  ["Experience Certificate", "Technical Documents"],
  ["Work Completion Certificate", "Technical Documents"],
  ["Financial Statement", "Financial Documents"],
  ["Manufacturer Authorization", "Supporting Documents"],
  ["Technical Specification", "Technical Documents"],
  ["Price Schedule", "Tender Documents"],
  ["Power of Attorney", "Company Documents"],
  ["PG/BG Requirement", "Bank Instruments"],
  ["Other Required Documents", "Supporting Documents"],
];
const initialChecks = (): Check[] =>
  names.map(([name, group], i) => ({
    name: name!,
    group: group!,
    required: i < 14,
    status: "Pending",
    remarks: "",
  }));
export function TenderChecklist() {
  const [items, setItems] = React.useState(initialChecks),
    [meta, setMeta] = React.useState({ work: "", organization: "", tenderId: "", submission: "" });
  const completed = items.filter((x) => x.status === "Ready" || x.status === "Not Required").length,
    missing = items.filter((x) => x.status === "Missing").length,
    progress = items.length ? Math.round((completed / items.length) * 100) : 0;
  return (
    <ToolLayout
      title="Tender Checklist"
      subtitle="Prepare and verify tender documents before submission."
    >
      <Card title="Tender Information">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Object.entries(meta).map(([k, v]) => (
            <Field
              key={k}
              label={
                (
                  {
                    work: "Tender / Work",
                    organization: "Organization",
                    tenderId: "Tender ID",
                    submission: "Submission Date",
                  } as Record<string, string>
                )[k]!
              }
            >
              <TextInput
                type={k === "submission" ? "date" : "text"}
                value={v}
                onChange={(e) => setMeta({ ...meta, [k]: e.target.value })}
              />
            </Field>
          ))}
        </div>
      </Card>
      <div className="grid gap-3 sm:grid-cols-4">
        <Result label="Total Items" value={String(items.length)} />
        <Result label="Completed" value={String(completed)} />
        <Result
          label="Pending"
          value={String(items.filter((x) => x.status === "Pending").length)}
        />
        <Result label="Missing" value={String(missing)} />
      </div>
      <Card title={`Checklist Progress — ${completed} / ${items.length} Completed (${progress}%)`}>
        <div className="mb-4 h-2 overflow-hidden rounded bg-slate-100">
          <div className="h-full bg-biz-blue transition-all" style={{ width: `${progress}%` }} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-[11px]">
            <thead className="bg-[#f4f7fb]">
              <tr>
                {["Done", "Group", "Checklist Item", "Requirement", "Status", "Remarks"].map(
                  (x) => (
                    <th key={x} className="px-3 py-3">
                      {x}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((x, i) => (
                <tr key={`${x.group}-${x.name}`} className="border-t border-biz-border">
                  <td className="px-3">
                    <input
                      aria-label={`Complete ${x.name}`}
                      type="checkbox"
                      checked={x.status === "Ready"}
                      onChange={(e) =>
                        setItems(
                          items.map((a, j) =>
                            j === i ? { ...a, status: e.target.checked ? "Ready" : "Pending" } : a,
                          ),
                        )
                      }
                    />
                  </td>
                  <td className="px-3 py-2">{x.group}</td>
                  <td className="px-3 font-semibold">{x.name}</td>
                  <td className="px-3">
                    <span className="rounded bg-slate-100 px-2 py-1">
                      {x.required ? "Required" : "Optional"}
                    </span>
                  </td>
                  <td className="px-3">
                    <select
                      className="h-8 rounded border border-biz-border bg-white px-2"
                      value={x.status}
                      onChange={(e) =>
                        setItems(
                          items.map((a, j) => (j === i ? { ...a, status: e.target.value } : a)),
                        )
                      }
                    >
                      {["Pending", "Ready", "Missing", "Not Required"].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3">
                    <input
                      className="h-8 w-full rounded border border-biz-border px-2"
                      value={x.remarks}
                      onChange={(e) =>
                        setItems(
                          items.map((a, j) => (j === i ? { ...a, remarks: e.target.value } : a)),
                        )
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <SecondaryButton
            onClick={() =>
              setItems([
                ...items,
                {
                  name: "New Checklist Item",
                  group: "Supporting Documents",
                  required: false,
                  status: "Pending",
                  remarks: "",
                },
              ])
            }
          >
            <Plus className="h-4 w-4" />
            Add Checklist Item
          </SecondaryButton>
          <SecondaryButton
            onClick={() => confirm("Reset checklist changes?") && setItems(initialChecks())}
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </SecondaryButton>
          <SecondaryButton onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Print Checklist
          </SecondaryButton>
          <PrimaryButton
            onClick={() =>
              localStorage.setItem("bizovix-tender-checklist", JSON.stringify({ meta, items }))
            }
          >
            <Save className="h-4 w-4" />
            Save Checklist
          </PrimaryButton>
        </div>
      </Card>
    </ToolLayout>
  );
}

export function QrReferenceTools() {
  const [type, setType] = React.useState("Text"),
    [value, setValue] = React.useState(""),
    [description, setDescription] = React.useState(""),
    [src, setSrc] = React.useState(""),
    [ref, setRef] = React.useState({
      prefix: "BIZ",
      module: "TND",
      year: String(new Date().getFullYear()),
      sequence: "1",
    });
  const generated = `${ref.prefix.toUpperCase()}/${ref.module}/${ref.year}/${String(Math.max(0, Number(ref.sequence) || 0)).padStart(4, "0")}`;
  async function generate() {
    if (value.trim())
      setSrc(
        await QRCode.toDataURL(JSON.stringify({ type, value, description }), {
          width: 240,
          margin: 2,
          color: { dark: "#12233f", light: "#ffffff" },
        }),
      );
  }
  return (
    <ToolLayout
      title="QR / Reference Tools"
      subtitle="Generate scannable QR codes and preview structured business references."
    >
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="QR Generator">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Reference Type">
              <SelectInput
                value={type}
                onChange={(e) => setType(e.target.value)}
                options={[
                  "Text",
                  "URL",
                  "Tender ID",
                  "Project Reference",
                  "Document Reference",
                  "Payment Reference",
                ].map((x) => ({ value: x, label: x }))}
              />
            </Field>
            <Field label="Reference Value" required>
              <TextInput value={value} onChange={(e) => setValue(e.target.value)} />
            </Field>
          </div>
          <div className="mt-3">
            <Field label="Optional Description">
              <TextInput value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
          </div>
          <div className="mt-4 flex min-h-64 items-center justify-center rounded-md border border-dashed border-biz-border bg-slate-50">
            {src ? (
              <Image
                unoptimized
                width={240}
                height={240}
                src={src}
                alt={`QR code for ${value}`}
                className="h-60 w-60"
              />
            ) : (
              <div className="text-center text-biz-muted">
                <QrCode className="mx-auto h-12 w-12" />
                <p className="mt-2 text-xs">Enter a value and generate a QR code.</p>
              </div>
            )}
          </div>
          <div className="mt-4 flex gap-2">
            <PrimaryButton disabled={!value.trim()} onClick={generate}>
              Generate QR
            </PrimaryButton>
            <SecondaryButton
              onClick={() => {
                setValue("");
                setDescription("");
                setSrc("");
              }}
            >
              Reset
            </SecondaryButton>
            <SecondaryButton disabled={!src} onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              Print
            </SecondaryButton>
          </div>
        </Card>
        <Card title="Reference Number Generator">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Company Prefix">
              <TextInput
                value={ref.prefix}
                onChange={(e) => setRef({ ...ref, prefix: e.target.value })}
              />
            </Field>
            <Field label="Module">
              <SelectInput
                value={ref.module}
                onChange={(e) => setRef({ ...ref, module: e.target.value })}
                options={["TND", "EXP", "REC", "PG", "BG", "PAY", "DOC"].map((x) => ({
                  value: x,
                  label: x,
                }))}
              />
            </Field>
            <Field label="Year">
              <TextInput
                type="number"
                value={ref.year}
                onChange={(e) => setRef({ ...ref, year: e.target.value })}
              />
            </Field>
            <Field label="Sequence Number">
              <TextInput
                type="number"
                min="1"
                value={ref.sequence}
                onChange={(e) => setRef({ ...ref, sequence: e.target.value })}
              />
            </Field>
          </div>
          <div className="mt-5">
            <Result label="Generated Reference Preview" value={generated} />
          </div>
          <p className="mt-3 rounded border border-orange-200 bg-orange-50 p-3 text-[11px] text-orange-800">
            Preview helper only. Frontend generation does not guarantee database uniqueness.
          </p>
          <PrimaryButton className="mt-4" onClick={() => copyText(generated)}>
            <Copy className="h-4 w-4" />
            Copy Reference
          </PrimaryButton>
        </Card>
      </div>
    </ToolLayout>
  );
}

const modules = [
  "Organizations",
  "Projects / Works",
  "Tender Purchases",
  "Expenses",
  "Receipts",
  "Bank Accounts",
  "Opening Balances",
  "Contacts",
];
export function ImportExport() {
  const [module, setModule] = React.useState("Organizations"),
    [file, setFile] = React.useState<File | null>(null),
    [validated, setValidated] = React.useState(false),
    [format, setFormat] = React.useState("Excel");
  const rows = file ? Math.max(1, Math.round(file.size / 120)) : 0;
  const downloadTemplate = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["name,reference,status\n"], { type: "text/csv" }));
    a.download = `${module.toLowerCase().replaceAll(/[^a-z]+/g, "-")}-template.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <ToolLayout
      title="Import / Export Tools"
      subtitle="Import and export ERP data using standardized templates."
    >
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Import Data">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="1. Select Module">
              <SelectInput
                value={module}
                onChange={(e) => setModule(e.target.value)}
                options={modules.map((x) => ({ value: x, label: x }))}
              />
            </Field>
            <div className="flex items-end">
              <SecondaryButton onClick={downloadTemplate}>
                <Download className="h-4 w-4" />
                2. Download Template
              </SecondaryButton>
            </div>
            <Field label="3. Upload .xlsx or .csv">
              <input
                className="block h-11 w-full rounded-sm border border-biz-border bg-white p-2 text-xs"
                type="file"
                accept=".xlsx,.csv"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setValidated(false);
                }}
              />
            </Field>
            <div className="flex items-end">
              <PrimaryButton disabled={!file} onClick={() => setValidated(true)}>
                <Upload className="h-4 w-4" />
                4. Validate Data
              </PrimaryButton>
            </div>
          </div>
          {validated && (
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <Result label="Total Rows" value={String(rows)} />
              <Result label="Valid Rows" value={String(rows)} />
              <Result label="Invalid Rows" value="0" />
              <Result label="Warnings" value="0" />
            </div>
          )}
          <p className="mt-4 rounded border border-blue-100 bg-blue-50 p-3 text-[11px] text-biz-text">
            Validation is safe demo processing. Import is disabled until a tenant-scoped backend
            API, validation and confirmation workflow are available.
          </p>
          <PrimaryButton className="mt-3" disabled>
            6. Import Valid Records
          </PrimaryButton>
        </Card>
        <Card title="Export Data">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Module">
              <SelectInput
                value={module}
                onChange={(e) => setModule(e.target.value)}
                options={modules.map((x) => ({ value: x, label: x }))}
              />
            </Field>
            <Field label="Format">
              <SelectInput
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                options={["Excel", "CSV"].map((x) => ({ value: x, label: x }))}
              />
            </Field>
            <Field label="From">
              <TextInput type="date" />
            </Field>
            <Field label="To">
              <TextInput type="date" />
            </Field>
          </div>
          <p className="mt-4 text-[11px] text-biz-muted">
            Export requires the future authenticated module export endpoint. No production data is
            read or modified by this frontend placeholder.
          </p>
          <PrimaryButton className="mt-3" disabled>
            <Download className="h-4 w-4" />
            Export Data
          </PrimaryButton>
        </Card>
      </div>
    </ToolLayout>
  );
}
