import { ChallanSubmissionWorkspace } from "@/components/projects/ChallanSubmissionWorkspace";

export default async function ChallanSubmissionPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[] }>;
}) {
  const query = await searchParams;
  const challanId = Array.isArray(query.id) ? query.id[0] : query.id;
  return <ChallanSubmissionWorkspace challanId={challanId} />;
}
