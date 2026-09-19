import { SavedBillHistoryWorkspace } from "@/components/projects/BillSubmissionWorkspace";

export default async function BillSubmissionPage({
  searchParams,
}: {
  searchParams: Promise<{ cmsWorkId?: string | string[] }>;
}) {
  const query = await searchParams;
  const workId = Array.isArray(query.cmsWorkId) ? query.cmsWorkId[0] : query.cmsWorkId;
  return <SavedBillHistoryWorkspace key={workId ?? "all"} initialWorkId={workId} />;
}
