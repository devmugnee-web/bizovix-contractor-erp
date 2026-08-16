import { notFound } from "next/navigation";
import { DocumentWorkspace } from "@/components/documents/DocumentWorkspace";
const sections = ["tenders", "projects", "company", "financial", "expiring", "archived"] as const;
export default async function DocumentsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!sections.includes(section as (typeof sections)[number])) notFound();
  return <DocumentWorkspace view={section as (typeof sections)[number]} />;
}
