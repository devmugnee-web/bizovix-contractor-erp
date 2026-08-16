"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowRight, Copy, FileText, Printer, RotateCcw, Save } from "lucide-react";
import { PrimaryButton, SecondaryButton, TextInput } from "@bizovix/ui";
import {
  amountInWords,
  copyText,
  DOCUMENT_TEMPLATES,
  money,
  numberValue,
  templateSlug,
} from "@/lib/business-tools";
import { Card, Field, ToolLayout } from "./ToolLayout";
import { PrintableDocument } from "./PrintableDocument";
export function AmountWords() {
  const [value, setValue] = React.useState("1250000.50"),
    words = amountInWords(numberValue(value));
  return (
    <ToolLayout
      title="Amount in Words"
      subtitle="Convert numeric amounts into words for official documents."
    >
      <Card title="BDT Amount Conversion">
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <Field label="Currency">
              <TextInput value="BDT — Bangladeshi Taka" disabled />
            </Field>
            <div className="mt-3">
              <Field label="Amount" required>
                <TextInput
                  type="number"
                  min="0"
                  step="0.01"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              </Field>
            </div>
          </div>
          <div className="rounded-md border border-blue-100 bg-blue-50/60 p-4">
            <p className="text-[10px] font-semibold text-biz-muted">Numeric Format</p>
            <p className="mt-1 text-lg font-bold text-biz-blue">{money(numberValue(value))}</p>
            <p className="mt-4 text-[10px] font-semibold text-biz-muted">Words</p>
            <p className="mt-1 text-[14px] font-semibold leading-6 text-biz-text">{words}</p>
            <div className="mt-4 flex gap-2">
              <PrimaryButton onClick={() => copyText(words)}>
                <Copy className="h-4 w-4" />
                Copy Text
              </PrimaryButton>
              <SecondaryButton onClick={() => setValue("")}>
                <RotateCcw className="h-4 w-4" />
                Clear
              </SecondaryButton>
            </div>
          </div>
        </div>
      </Card>
    </ToolLayout>
  );
}
export function DocumentGenerator() {
  return (
    <ToolLayout
      title="Document Generator"
      subtitle="Generate commonly used tender and business documents."
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {DOCUMENT_TEMPLATES.map((name) => (
          <Link
            key={name}
            href={`/business-tools/document-generator/${templateSlug(name)}`}
            className="group flex min-h-28 flex-col rounded-lg border border-biz-border bg-white p-4 shadow-card transition hover:border-blue-300 hover:shadow-md"
          >
            <div className="flex justify-between">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-50 text-biz-blue">
                <FileText className="h-4 w-4" />
              </span>
              <ArrowRight className="h-4 w-4 text-biz-muted group-hover:text-biz-blue" />
            </div>
            <h2 className="mt-3 text-[13px] font-bold">{name}</h2>
            <p className="mt-1 text-[11px] text-biz-muted">
              Create, preview and print this reusable document.
            </p>
          </Link>
        ))}
      </div>
    </ToolLayout>
  );
}
const titleFromSlug = (slug: string) =>
  DOCUMENT_TEMPLATES.find((x) => templateSlug(x) === slug) ??
  slug
    .split("-")
    .map((x) => x[0]?.toUpperCase() + x.slice(1))
    .join(" ");
export function DocumentEditor({ template }: { template: string }) {
  const title = titleFromSlug(template),
    initial = {
      organization: "",
      tenderId: "",
      work: "",
      reference: "",
      date: new Date().toISOString().slice(0, 10),
      recipient: "",
      subject: title,
      body: `Dear Sir/Madam,\n\nPlease accept this ${title.toLowerCase()} regarding the referenced tender/work.\n\nThank you.`,
      signatory: "",
      designation: "",
    },
    [form, setForm] = React.useState(initial),
    [preview, setPreview] = React.useState(false);
  const printDocument = () => {
    document.body.classList.add("print-document-only");
    const cleanup = () => document.body.classList.remove("print-document-only");
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
  };
  const field = (key: keyof typeof form, label: string, type = "text") => (
    <Field label={label}>
      <TextInput
        type={type}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </Field>
  );
  return (
    <ToolLayout
      title={title}
      subtitle="Prepare a reusable business document draft. Drafts do not create ERP transactions."
    >
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Document Information">
          <div className="grid gap-3 sm:grid-cols-2">
            {field("organization", "Organization")}
            {field("tenderId", "Tender ID")}
            {field("work", "Tender / Work Name")}
            {field("reference", "Reference Number")}
            {field("date", "Date", "date")}
            {field("recipient", "Recipient")}
            {field("subject", "Subject")} {field("signatory", "Signatory")}
            {field("designation", "Designation")}
          </div>
          <Field label="Body">
            <textarea
              className="mt-1 min-h-40 w-full rounded-sm border border-biz-border p-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-biz-blue/30"
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
          </Field>
          <div className="mt-4 flex flex-wrap gap-2">
            <SecondaryButton onClick={() => setForm(initial)}>
              <RotateCcw className="h-4 w-4" />
              Reset
            </SecondaryButton>
            <SecondaryButton
              onClick={() =>
                localStorage.setItem(`bizovix-document-${template}`, JSON.stringify(form))
              }
            >
              <Save className="h-4 w-4" />
              Save Draft
            </SecondaryButton>
            <SecondaryButton disabled={!preview} onClick={printDocument}>
              <Printer className="h-4 w-4" />
              Print
            </SecondaryButton>
            <PrimaryButton onClick={() => setPreview(true)}>Generate / Preview</PrimaryButton>
          </div>
        </Card>
        <section className="document-preview-shell overflow-auto rounded-lg border border-biz-border bg-slate-100 p-3 shadow-card sm:p-5">
          <PrintableDocument
            previewReady={preview}
            data={{
              companyName: form.organization || "Company Name",
              reference: form.reference,
              date: form.date,
              recipient: form.recipient,
              subject: form.subject,
              body: form.body,
              tenderId: form.tenderId,
              work: form.work,
              signatory: form.signatory,
              designation: form.designation,
            }}
          />
          <div className="hidden">
            <p className="text-center text-lg font-bold">
              {form.organization || "Organization Name"}
            </p>
            <div className="mt-8 flex justify-between text-xs">
              <span>Ref: {form.reference || "—"}</span>
              <span>Date: {form.date}</span>
            </div>
            <p className="mt-6 text-sm">To: {form.recipient || "Recipient"}</p>
            <p className="mt-5 text-sm font-bold">Subject: {form.subject}</p>
            <p className="mt-5 whitespace-pre-wrap text-sm leading-7">{form.body}</p>
            {form.tenderId && (
              <p className="mt-4 text-sm">
                Tender ID: {form.tenderId}
                <br />
                Work: {form.work}
              </p>
            )}
            <div className="mt-16 text-sm">
              <p>{form.signatory || "Authorized Signatory"}</p>
              <p>{form.designation}</p>
            </div>
          </div>
        </section>
      </div>
    </ToolLayout>
  );
}
