import { EditLcPageScreen } from "@/features/screens/edit-lc-page-screen";

export default async function LcEditPage({ params }: { params: Promise<{ lcId: string }> }) {
  const { lcId } = await params;
  return <EditLcPageScreen lcId={lcId} />;
}
