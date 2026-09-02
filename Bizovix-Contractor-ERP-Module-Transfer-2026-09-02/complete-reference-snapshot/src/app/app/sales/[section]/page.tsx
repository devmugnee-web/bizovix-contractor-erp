import { notFound } from "next/navigation";

import { SalesWorkspaceScreen } from "@/features/screens/sales-workspace-screen";
import { PosComingSoonScreen } from "@/features/screens/pos-coming-soon-screen";
import { isSalesWorkspaceSection } from "@/config/sales";

export default async function AppSalesWorkspacePage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;

  if (!isSalesWorkspaceSection(section)) {
    notFound();
  }

  if (section === "pos") {
    return <PosComingSoonScreen />;
  }

  return <SalesWorkspaceScreen section={section} />;
}
