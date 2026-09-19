import { ChallanSubmissionWorkspace } from "@/components/projects/ChallanSubmissionWorkspace";
import { TenderChallanWorkspace } from "@/components/projects/TenderChallanWorkspace";

export default async function ChallanSubmissionPage({
  searchParams,
}: {
  searchParams: Promise<{
    id?: string | string[];
    mode?: string | string[];
    cmsWorkId?: string | string[];
  }>;
}) {
  const query = await searchParams;
  const challanId = Array.isArray(query.id) ? query.id[0] : query.id;
  const initialWorkId = Array.isArray(query.cmsWorkId) ? query.cmsWorkId[0] : query.cmsWorkId;
  // Preserve saved-record links and the existing draft workflow.
  if (challanId || query.mode === "create")
    return <ChallanSubmissionWorkspace challanId={challanId} initialWorkId={initialWorkId} />;
  return <TenderChallanWorkspace />;
}
