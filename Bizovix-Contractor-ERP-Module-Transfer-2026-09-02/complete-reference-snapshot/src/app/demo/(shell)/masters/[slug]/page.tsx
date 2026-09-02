import { ModuleScreen } from "@/features/screens/module-screen";

export default async function DemoMasterModulePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ModuleScreen section="masters" slug={slug} />;
}
