import { LcCostPostingEditScreen } from "@/features/screens/lc-cost-posting-edit-screen";

export default async function LcCostPostingEditPage({ params }: { params: Promise<{ lcId: string; costEntryId: string }> }) {
  const { lcId, costEntryId } = await params;
  return <LcCostPostingEditScreen lcId={lcId} costEntryId={costEntryId} />;
}
