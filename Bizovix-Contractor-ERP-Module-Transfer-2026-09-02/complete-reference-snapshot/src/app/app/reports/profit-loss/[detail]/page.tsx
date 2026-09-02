import { ReportsWorkspaceScreen } from "@/features/screens/reports-workspace-screen";

export default async function ProfitLossDetailPage({ params }: { params: Promise<{ detail: string }> }) {
  const { detail } = await params;
  return <ReportsWorkspaceScreen slug="profit-loss" profitLossDetail={detail} />;
}
