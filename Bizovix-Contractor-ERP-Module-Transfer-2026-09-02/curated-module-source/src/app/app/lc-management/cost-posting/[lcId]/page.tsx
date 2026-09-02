import { LcCostPostingScreen } from "@/features/screens/lc-cost-posting-screen";

export default async function LcCostPostingPage({ params }: { params: Promise<{ lcId: string }> }) {
  const { lcId } = await params;
  return <LcCostPostingScreen lcId={lcId} />;
}
