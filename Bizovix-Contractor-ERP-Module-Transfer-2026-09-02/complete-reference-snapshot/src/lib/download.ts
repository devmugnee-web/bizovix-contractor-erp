import { createElement } from "react";
import { createRoot } from "react-dom/client";
import html2canvas from "html2canvas";

import { InvoiceDocument } from "@/components/shared/invoice-document";
import { openPrintWindow, printWindowWhenReady } from "@/lib/print";

function escapeCell(value: string | number) {
  const rawValue = String(value);
  // Spreadsheet apps interpret these leading characters as formulas. Prefix
  // user-authored strings with an apostrophe so CSV exports remain data-only.
  const safeValue = typeof value === "string" && /^[=+\-@\t\r]/.test(rawValue) ? `'${rawValue}` : rawValue;

  if (safeValue.includes(",") || safeValue.includes('"') || safeValue.includes("\n") || safeValue.includes("\r")) {
    return `"${safeValue.replaceAll('"', '""')}"`;
  }

  return safeValue;
}

export function downloadCsv(filename: string, rows: Array<Record<string, string | number>>) {
  if (typeof window === "undefined" || rows.length === 0) {
    return;
  }

  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCell(row[header] ?? "")).join(",")),
  ].join("\r\n");

  // UTF-8 BOM keeps Bangla and other non-Latin text readable in desktop Excel.
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadBlob(filename: string, blob: Blob) {
  if (typeof window === "undefined") {
    return;
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export interface InvoiceExportItem {
  description: string;
  quantity: number;
  price: number;
  total: number;
}

export interface InvoiceExportPayload {
  invoiceNumber: string;
  companyName: string;
  fromLabel: string;
  fromAddressLines: string[];
  logoDataUrl?: string | null;
  invoicePadDataUrl?: string | null;
  billToName: string;
  billToAddressLines: string[];
  dateLabel: string;
  note: string;
  paymentMode: string;
  paymentTarget: string;
  buyerSignature: string;
  sellerSignature: string;
  items: InvoiceExportItem[];
  subTotal: number;
  discountLabel: string;
  discountAmount: number;
  total: number;
  documentTitle?: string;
  billToLabel?: string;
  detailsLabel?: string;
  shipToLabel?: string;
  priceColumnLabel?: string;
  noteLabel?: string;
}

function buildPdfFromJpegDataUrl(dataUrl: string, width: number, height: number) {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = atob(base64);
  const imageBytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    imageBytes[index] = binary.charCodeAt(index);
  }

  // Always emit a real A4 portrait page (210 × 297 mm). Fit and centre the
  // rendered document inside it so Open PDF and Download PDF are identical,
  // without stretching or cropping the source document.
  const a4WidthPt = 595.28;
  const a4HeightPt = 841.89;
  const pageWidth = a4WidthPt;
  const pageHeight = a4HeightPt;
  const sourceRatio = width / height;
  const pageRatio = pageWidth / pageHeight;
  const drawWidth = sourceRatio > pageRatio ? pageWidth : pageHeight * sourceRatio;
  const drawHeight = sourceRatio > pageRatio ? pageWidth / sourceRatio : pageHeight;
  const drawX = (pageWidth - drawWidth) / 2;
  const drawY = (pageHeight - drawHeight) / 2;
  const drawCommand = `q\n${drawWidth} 0 0 ${drawHeight} ${drawX} ${drawY} cm\n/Im0 Do\nQ\n`;

  const encoder = new TextEncoder();
  const objects = [
    encoder.encode("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"),
    encoder.encode("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"),
    encoder.encode(
      `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> /ProcSet [/PDF /ImageC] >> /Contents 5 0 R >>\nendobj\n`,
    ),
    new Uint8Array([
      ...encoder.encode(
        `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`,
      ),
      ...imageBytes,
      ...encoder.encode("\nendstream\nendobj\n"),
    ]),
    encoder.encode(`5 0 obj\n<< /Length ${drawCommand.length} >>\nstream\n${drawCommand}endstream\nendobj\n`),
  ];

  const header = encoder.encode("%PDF-1.4\n");
  let offset = header.length;
  const offsets = [0];
  for (const object of objects) {
    offsets.push(offset);
    offset += object.length;
  }

  const xrefStart = offset;
  const xrefLines = ["xref", `0 ${objects.length + 1}`, "0000000000 65535 f "];
  for (let index = 1; index < offsets.length; index += 1) {
    xrefLines.push(`${String(offsets[index]).padStart(10, "0")} 00000 n `);
  }
  const xref = encoder.encode(`${xrefLines.join("\n")}\n`);
  const trailer = encoder.encode(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  return new Blob([header, ...objects, xref, trailer], { type: "application/pdf" });
}

async function waitForImagesToLoad(container: HTMLElement) {
  const images = Array.from(container.querySelectorAll("img"));
  await Promise.all(
    images.map((image) =>
      image.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            image.onload = () => resolve();
            image.onerror = () => resolve();
          }),
    ),
  );
}

async function renderInvoiceDocumentToCanvas(payload: InvoiceExportPayload) {
  if (typeof window === "undefined") {
    throw new Error("Invoice rendering is only available in the browser");
  }

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.top = "0";
  container.style.left = "-10000px";
  container.style.zIndex = "-1";
  container.style.background = "#ffffff";
  document.body.appendChild(container);

  const root = createRoot(container);

  try {
    root.render(createElement(InvoiceDocument, { payload }));
    // requestAnimationFrame does not reliably fire in all embedding contexts
    // (e.g. non-composited/offscreen frames), so a fixed delay is used instead
    // to let the render commit before capturing.
    await new Promise<void>((resolve) => window.setTimeout(resolve, 50));

    await waitForImagesToLoad(container);

    const target = container.firstElementChild as HTMLElement | null;
    if (!target) {
      throw new Error("Invoice document could not be rendered");
    }

    return await html2canvas(target, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      onclone: (clonedDoc: Document, clonedElement: HTMLElement) => {
        // html2canvas's default renderer clones the *entire* document (to resolve
        // inherited/ancestor styles correctly), which means it ends up parsing every
        // color used elsewhere on the live page too - including Tailwind v4's
        // oklch()-based palette used throughout the rest of the app, which this
        // html2canvas version cannot parse and throws on. Since our target is fully
        // self-contained (plain hex colors only), it's safe to strip every other
        // top-level body element from the clone before rendering proceeds.
        let topLevel = clonedElement;
        while (topLevel.parentElement && topLevel.parentElement !== clonedDoc.body) {
          topLevel = topLevel.parentElement;
        }
        Array.from(clonedDoc.body.children).forEach((child) => {
          if (child !== topLevel) {
            child.remove();
          }
        });
      },
    });
  } finally {
    root.unmount();
    container.remove();
  }
}

async function renderInvoiceJpegDataUrl(payload: InvoiceExportPayload) {
  return (await renderInvoiceDocumentToCanvas(payload)).toDataURL("image/jpeg", 0.96);
}

export async function buildInvoicePreviewDataUrl(payload: InvoiceExportPayload) {
  return renderInvoiceJpegDataUrl(payload);
}

export async function downloadInvoiceJpg(filename: string, payload: InvoiceExportPayload) {
  const canvas = await renderInvoiceDocumentToCanvas(payload);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.94));
  if (!blob) {
    throw new Error("JPG export failed");
  }
  downloadBlob(filename, blob);
}

export async function buildInvoiceFile(filename: string, payload: InvoiceExportPayload) {
  const canvas = await renderInvoiceDocumentToCanvas(payload);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.94));
  if (!blob) {
    throw new Error("Invoice image export failed");
  }

  return new File([blob], filename, { type: "image/jpeg" });
}

export async function downloadInvoicePdf(filename: string, payload: InvoiceExportPayload) {
  const canvas = await renderInvoiceDocumentToCanvas(payload);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.96);
  const pdfBlob = buildPdfFromJpegDataUrl(dataUrl, canvas.width, canvas.height);
  downloadBlob(filename, pdfBlob);
}

export async function openInvoicePdf(payload: InvoiceExportPayload) {
  if (typeof window === "undefined") {
    return;
  }

  const canvas = await renderInvoiceDocumentToCanvas(payload);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.96);
  const pdfBlob = buildPdfFromJpegDataUrl(dataUrl, canvas.width, canvas.height);
  const url = URL.createObjectURL(pdfBlob);
  const pdfWindow = window.open("", "_blank");

  if (!pdfWindow) {
    downloadBlob(`${payload.invoiceNumber}.pdf`, pdfBlob);
    URL.revokeObjectURL(url);
    throw new Error("PDF window could not be opened");
  }

  pdfWindow.location.href = url;
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function printInvoice(payload: InvoiceExportPayload) {
  if (typeof window === "undefined") {
    return;
  }

  const dataUrl = await renderInvoiceJpegDataUrl(payload);
  const printWindow = openPrintWindow("width=980,height=1280");
  if (!printWindow) {
    throw new Error("Print window could not be opened");
  }

  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>${payload.invoiceNumber}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 0;
          }
          html, body {
            margin: 0;
            padding: 0;
            background: #ffffff;
          }
          body {
            display: flex;
            justify-content: center;
            align-items: flex-start;
          }
          img {
            display: block;
            width: 210mm;
            max-width: 100%;
            height: auto;
          }
        </style>
      </head>
      <body>
        <img src="${dataUrl}" alt="Invoice print preview" />
      </body>
    </html>
  `);
  printWindowWhenReady(printWindow, { delayMs: 240 });
}
