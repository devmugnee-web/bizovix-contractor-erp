export const money = (value: number) =>
  `BDT ${Number.isFinite(value) ? value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}`;
export const numberValue = (value: string) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
const ones = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
function underThousand(n: number) {
  let out = "";
  if (n >= 100) {
    out += `${ones[Math.floor(n / 100)]} Hundred `;
    n %= 100;
  }
  if (n >= 20) {
    out += `${tens[Math.floor(n / 10)]} ${ones[n % 10]}`;
  } else out += ones[n];
  return out.trim();
}
export function amountInWords(value: number) {
  if (!Number.isFinite(value) || value < 0) return "Enter a valid positive amount";
  const rounded = Math.round(value * 100),
    whole = Math.floor(rounded / 100),
    paisa = rounded % 100;
  if (whole === 0 && paisa === 0) return "Zero Taka Only";
  let n = whole;
  const parts: string[] = [];
  for (const [size, label] of [
    [10000000, "Crore"],
    [100000, "Lakh"],
    [1000, "Thousand"],
  ] as const) {
    if (n >= size) {
      parts.push(`${underThousand(Math.floor(n / size))} ${label}`);
      n %= size;
    }
  }
  if (n) parts.push(underThousand(n));
  return `${parts.join(" ") || "Zero"} Taka${paisa ? ` and ${underThousand(paisa)} Paisa` : ""} Only`;
}
export function addValidity(start: string, value: number, unit: "days" | "months" | "years") {
  const d = new Date(`${start}T00:00:00`);
  if (unit === "days") d.setDate(d.getDate() + value);
  if (unit === "months") d.setMonth(d.getMonth() + value);
  if (unit === "years") d.setFullYear(d.getFullYear() + value);
  return d;
}
export function dateSummary(start: string, end: string) {
  if (!start || !end) return null;
  const a = new Date(`${start}T00:00:00`),
    b = new Date(`${end}T00:00:00`),
    days = Math.round((b.getTime() - a.getTime()) / 864e5),
    abs = Math.abs(days);
  return {
    days,
    duration: {
      years: Math.floor(abs / 365),
      months: Math.floor((abs % 365) / 30),
      days: (abs % 365) % 30,
    },
  };
}
export const copyText = async (text: string) => navigator.clipboard.writeText(text);

export const TOOL_DEFS = [
  {
    slug: "financial-calculator",
    title: "Financial Calculator",
    description:
      "Calculate VAT, Tax, percentages, margins, bank charges, loan/EMI and PG/BG related amounts.",
  },
  {
    slug: "date-maturity-calculator",
    title: "Date & Maturity Calculator",
    description:
      "Calculate expiry, maturity, validity and remaining days for tenders and bank instruments.",
  },
  {
    slug: "amount-in-words",
    title: "Amount in Words",
    description:
      "Convert BDT amounts into words for cheques, vouchers, receipts and official documents.",
  },
  {
    slug: "document-generator",
    title: "Document Generator",
    description: "Create commonly used tender and business documents from reusable templates.",
  },
  {
    slug: "tender-checklist",
    title: "Tender Checklist",
    description: "Prepare and track document requirements before tender submission.",
  },
  {
    slug: "qr-reference-tools",
    title: "QR / Reference Tools",
    description: "Generate QR codes and structured business reference numbers.",
  },
  {
    slug: "import-export",
    title: "Import / Export Tools",
    description: "Import or export supported ERP data using standard templates.",
  },
] as const;
export const DOCUMENT_TEMPLATES = [
  "Tender Cover Letter",
  "Bank Request Letter",
  "PG/BG Request Letter",
  "Tender Security Request",
  "Authorization Letter",
  "Forwarding Letter",
  "Undertaking",
  "Payment Request",
  "Work Completion Letter",
  "Custom Letter",
] as const;
export const templateSlug = (name: string) =>
  name
    .toLowerCase()
    .replaceAll("/", "-")
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
