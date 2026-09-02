"use client";

import { LcCostHeadManagerDialog } from "@/features/screens/lc-cost-head-manager-dialog";
import { useSessionContext } from "@/hooks/use-session-context";

export default function LcCostHeadsPage() {
  const { session } = useSessionContext();

  if (!session?.workspaceId) return null;

  return <LcCostHeadManagerDialog variant="page" workspaceId={session.workspaceId} />;
}
