import { ProjectLifecycleReport } from "@/components/reports/ProjectLifecycleReport";

export default async function Page({ params }: { params: Promise<{ workId: string }> }) {
  const { workId } = await params;
  return <ProjectLifecycleReport workId={workId} />;
}
