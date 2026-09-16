import { Suspense } from "react";
import { QuotationWorkspace } from "./quotation/page";

export default function QuotationSalesPage() {
  return <Suspense fallback={null}><QuotationWorkspace variant="dashboard" /></Suspense>;
}
