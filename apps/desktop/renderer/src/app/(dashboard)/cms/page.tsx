import { ComingSoonPage } from "@/components/layout/ComingSoonPage";

export default function CmsPage() {
  return (
    <ComingSoonPage
      title="Contract Management System"
      subtitle="Manage tenders, contracts, and work orders."
      breadcrumb={[{ label: "CMS" }]}
    />
  );
}
