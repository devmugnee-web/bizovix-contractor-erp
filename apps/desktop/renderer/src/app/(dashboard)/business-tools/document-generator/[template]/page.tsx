import { DocumentEditor } from "@/components/business-tools/DocumentsAndWords";
export default async function DocumentTemplatePage({
  params,
}: {
  params: Promise<{ template: string }>;
}) {
  const { template } = await params;
  return <DocumentEditor template={template} />;
}
