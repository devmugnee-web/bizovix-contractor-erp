import { ModuleScreen } from "@/features/screens/module-screen";

export default async function DemoUtilityModulePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ModuleScreen section="utilities" slug={slug} />;
}
