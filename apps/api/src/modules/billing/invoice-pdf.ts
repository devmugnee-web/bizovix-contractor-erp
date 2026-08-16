import PDFDocument from "pdfkit";

export interface InvoicePdfData {
  invoiceNumber: string;
  issuedAt: Date;
  billingPeriodStart: Date;
  billingPeriodEnd: Date;
  planName: string;
  billingCycle: string;
  currency: string;
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  status: string;
  paidAt: Date | null;
  paymentMethod: string | null;
  items: Array<{ description: string; amount: string }>;
  billTo: {
    name: string;
    address?: string | null;
    email?: string | null;
    phone?: string | null;
    tin?: string | null;
    bin?: string | null;
  };
}

const fmtDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const money = (currency: string, value: string) => `${currency} ${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(22).fillColor("#0D1B3E").text("BIZOVIX", 50, 50);
    doc.fontSize(9).fillColor("#6B7280").text("Contractor ERP", 50, 76);

    doc.fontSize(16).fillColor("#0D1B3E").text("INVOICE", 350, 50, { width: 195, align: "right" });
    doc.fontSize(10).fillColor("#374151").text(data.invoiceNumber, 350, 72, { width: 195, align: "right" });
    doc.fontSize(9).fillColor("#6B7280").text(`Issued: ${fmtDate(data.issuedAt)}`, 350, 87, { width: 195, align: "right" });

    doc.moveTo(50, 115).lineTo(545, 115).strokeColor("#E5E7EB").stroke();

    doc.fontSize(9).fillColor("#6B7280").text("BILL TO", 50, 130);
    doc.fontSize(11).fillColor("#111827").text(data.billTo.name, 50, 144);
    let y = 160;
    if (data.billTo.address) {
      doc.fontSize(9).fillColor("#374151").text(data.billTo.address, 50, y, { width: 260 });
      y += 14;
    }
    if (data.billTo.email) {
      doc.fontSize(9).fillColor("#374151").text(data.billTo.email, 50, y);
      y += 14;
    }
    if (data.billTo.phone) {
      doc.fontSize(9).fillColor("#374151").text(data.billTo.phone, 50, y);
      y += 14;
    }
    if (data.billTo.tin) {
      doc.fontSize(9).fillColor("#374151").text(`TIN: ${data.billTo.tin}`, 50, y);
      y += 14;
    }
    if (data.billTo.bin) {
      doc.fontSize(9).fillColor("#374151").text(`BIN/VAT: ${data.billTo.bin}`, 50, y);
      y += 14;
    }

    doc.fontSize(9).fillColor("#6B7280").text("BILLING PERIOD", 350, 130, { width: 195, align: "right" });
    doc
      .fontSize(10)
      .fillColor("#111827")
      .text(`${fmtDate(data.billingPeriodStart)} - ${fmtDate(data.billingPeriodEnd)}`, 350, 144, {
        width: 195,
        align: "right",
      });
    doc.fontSize(9).fillColor("#6B7280").text("SUBSCRIPTION PLAN", 350, 168, { width: 195, align: "right" });
    doc
      .fontSize(10)
      .fillColor("#111827")
      .text(`${data.planName} (${data.billingCycle})`, 350, 182, { width: 195, align: "right" });

    let tableTop = Math.max(y, 210) + 20;
    doc.moveTo(50, tableTop).lineTo(545, tableTop).strokeColor("#E5E7EB").stroke();
    tableTop += 10;
    doc.fontSize(9).fillColor("#6B7280").text("DESCRIPTION", 50, tableTop).text("AMOUNT", 450, tableTop, { width: 95, align: "right" });
    tableTop += 18;
    doc.moveTo(50, tableTop).lineTo(545, tableTop).strokeColor("#E5E7EB").stroke();
    tableTop += 10;

    for (const item of data.items) {
      doc.fontSize(10).fillColor("#111827").text(item.description, 50, tableTop, { width: 380 });
      doc.text(money(data.currency, item.amount), 450, tableTop, { width: 95, align: "right" });
      tableTop += 20;
    }

    tableTop += 10;
    doc.moveTo(300, tableTop).lineTo(545, tableTop).strokeColor("#E5E7EB").stroke();
    tableTop += 10;

    const totalsRow = (label: string, value: string, bold = false) => {
      doc
        .fontSize(bold ? 11 : 10)
        .fillColor(bold ? "#0D1B3E" : "#374151")
        .text(label, 300, tableTop, { width: 150 });
      doc.text(money(data.currency, value), 450, tableTop, { width: 95, align: "right" });
      tableTop += bold ? 22 : 18;
    };
    totalsRow("Subtotal", data.subtotal);
    if (Number(data.discount) > 0) totalsRow("Discount", `-${data.discount}`);
    if (Number(data.tax) > 0) totalsRow("Tax / VAT", data.tax);
    totalsRow("Total", data.total, true);

    tableTop += 20;
    doc.moveTo(50, tableTop).lineTo(545, tableTop).strokeColor("#E5E7EB").stroke();
    tableTop += 15;
    doc.fontSize(9).fillColor("#6B7280").text("PAYMENT STATUS", 50, tableTop);
    doc.fontSize(10).fillColor("#111827").text(data.status, 50, tableTop + 14);
    doc.fontSize(9).fillColor("#6B7280").text("PAYMENT METHOD", 220, tableTop);
    doc.fontSize(10).fillColor("#111827").text(data.paymentMethod ?? "—", 220, tableTop + 14);
    doc.fontSize(9).fillColor("#6B7280").text("PAYMENT DATE", 390, tableTop);
    doc.fontSize(10).fillColor("#111827").text(data.paidAt ? fmtDate(data.paidAt) : "—", 390, tableTop + 14);

    doc.fontSize(8).fillColor("#9CA3AF").text("This invoice is for your BIZOVIX Contractor ERP subscription.", 50, 760, {
      width: 495,
      align: "center",
    });

    doc.end();
  });
}
