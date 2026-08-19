"use client";

import { useParams } from "next/navigation";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { CmsWorkDetailView } from "@/components/projects/CmsWorkDetailView";

export default function ArchivedWorkDetailsPage() {
  const params = useParams<{ id: string }>();
  useSetBreadcrumb([
    { label: "CMS" },
    { label: "Archived Works", href: "/cms/archived-works" },
    { label: "View Details" },
  ]);

  return <CmsWorkDetailView workId={params.id} listHref="/cms/archived-works" />;
}
