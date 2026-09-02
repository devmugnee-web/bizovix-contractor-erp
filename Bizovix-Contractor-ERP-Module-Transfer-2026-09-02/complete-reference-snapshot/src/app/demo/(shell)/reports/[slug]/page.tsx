import { ModuleScreen } from "@/features/screens/module-screen";

export default async function DemoReportModulePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ModuleScreen section="reports" slug={slug} />;
}
