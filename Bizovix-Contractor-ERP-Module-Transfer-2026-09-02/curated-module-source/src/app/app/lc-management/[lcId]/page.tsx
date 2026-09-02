import { LcDetailPage } from "@/features/screens/lc-detail-page";

export default async function LcDetailsPage({ params }: { params: Promise<{ lcId: string }> }) {
  const { lcId } = await params;
  return <LcDetailPage lcId={lcId} />;
}
