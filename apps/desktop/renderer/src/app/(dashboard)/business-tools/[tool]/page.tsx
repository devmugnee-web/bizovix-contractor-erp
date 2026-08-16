import { notFound } from "next/navigation";
import { AmountWords, DocumentGenerator } from "@/components/business-tools/DocumentsAndWords";
import { DateCalculator, FinancialCalculator } from "@/components/business-tools/Calculators";
import {
  ImportExport,
  QrReferenceTools,
  TenderChecklist,
} from "@/components/business-tools/OperationalTools";
const tools = {
  "financial-calculator": FinancialCalculator,
  "date-maturity-calculator": DateCalculator,
  "amount-in-words": AmountWords,
  "document-generator": DocumentGenerator,
  "tender-checklist": TenderChecklist,
  "qr-reference-tools": QrReferenceTools,
  "import-export": ImportExport,
} as const;
export default async function ToolPage({ params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params,
    Component = tools[tool as keyof typeof tools];
  if (!Component) notFound();
  return <Component />;
}
