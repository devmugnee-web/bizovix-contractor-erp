import { notFound } from "next/navigation";

import { isPurchaseWorkspaceSection } from "@/config/purchase";
import { PurchaseWorkspaceScreen } from "@/features/screens/purchase-workspace-screen";

export default async function DemoPurchaseWorkspacePage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;

  if (!isPurchaseWorkspaceSection(section)) {
    notFound();
  }

  return <PurchaseWorkspaceScreen section={section} />;
}
