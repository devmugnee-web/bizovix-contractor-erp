"use client";

import * as React from "react";
import { Download, FileText, Printer } from "lucide-react";
import { downloadChallanSubmissionPdf, downloadChallanSubmissionWord } from "@bizovix/api-client";
import { createPdfPrintJob, type PdfPrintJob } from "@/lib/print-pdf";

export function ChallanPdfActions({ challanId, disabled, preparePdf, prepareWord }: {
  challanId?: string;
  disabled: boolean;
  preparePdf?: () => ReturnType<typeof downloadChallanSubmissionPdf>;
  prepareWord?: () => ReturnType<typeof downloadChallanSubmissionWord>;
}) {
  const [busy, setBusy] = React.useState<"print" | "download" | "word" | null>(null);
  const [error, setError] = React.useState("");
  const locked = React.useRef(false);
  const mounted = React.useRef(false);
  const printJob = React.useRef<PdfPrintJob | null>(null);
  React.useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; printJob.current?.dispose(); };
  }, []);

  async function exportDocument(action: "print" | "download" | "word") {
    const prepare = action === "word" ? prepareWord : preparePdf;
    if ((!challanId && !prepare) || disabled || locked.current) return;
    locked.current = true;
    setBusy(action); setError("");
    try {
      const { blob, fileName } = await (prepare ? prepare() : action === "word" ? downloadChallanSubmissionWord(challanId!) : downloadChallanSubmissionPdf(challanId!));
      if (!mounted.current) return;
      if (action === "print") {
        printJob.current?.dispose();
        printJob.current = createPdfPrintJob(blob, "Challan print document");
        await printJob.current.ready;
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url; link.download = fileName || (action === "word" ? "challan.docx" : "challan.pdf");
        document.body.appendChild(link); link.click(); link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (caught) {
      if (mounted.current && !(caught instanceof DOMException && caught.name === "AbortError")) {
        setError(caught instanceof Error ? caught.message : "Could not prepare the Challan document. Please try again.");
      }
    } finally { locked.current = false; if (mounted.current) setBusy(null); }
  }

  return <div className="max-w-full">
    <div className="flex flex-wrap justify-end gap-2" title={!preparePdf && (disabled || !challanId) ? "Save the current challan with goods before exporting" : undefined}>
      <button type="button" disabled={disabled || (!challanId && !preparePdf) || !!busy} onClick={() => void exportDocument("print")} className="inline-flex items-center gap-2 rounded-md border border-biz-border bg-white px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"><Printer className="h-3.5 w-3.5" />{busy === "print" ? "Preparing Print…" : "Print"}</button>
      <button type="button" disabled={disabled || (!challanId && !preparePdf) || !!busy} onClick={() => void exportDocument("download")} className="inline-flex items-center gap-2 rounded-md bg-biz-blue px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"><Download className="h-3.5 w-3.5" />{busy === "download" ? "Downloading…" : "Download PDF"}</button>
      {(challanId || prepareWord) && <button type="button" disabled={disabled || !!busy} onClick={() => void exportDocument("word")} className="inline-flex items-center gap-2 rounded-md border border-biz-border bg-white px-3 py-2 text-xs font-semibold text-biz-blue disabled:cursor-not-allowed disabled:opacity-40"><FileText className="h-3.5 w-3.5" />{busy === "word" ? "Downloading…" : "Download Word"}</button>}
    </div>
    {error && <p role="alert" className="mt-2 text-xs text-biz-danger">{error}</p>}
  </div>;
}
