import { notFound } from "next/navigation";

import { isSalesWorkspaceSection } from "@/config/sales";
import { SalesWorkspaceScreen } from "@/features/screens/sales-workspace-screen";
import { PosComingSoonScreen } from "@/features/screens/pos-coming-soon-screen";

export default async function DemoSalesWorkspacePage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;

  if (!isSalesWorkspaceSection(section)) {
    notFound();
  }

  if (section === "pos") {
    return <PosComingSoonScreen />;
  }

  return <SalesWorkspaceScreen section={section} />;
}
