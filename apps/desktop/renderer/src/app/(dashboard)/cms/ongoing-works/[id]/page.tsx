"use client";

import { useParams } from "next/navigation";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { CmsWorkDetailView } from "@/components/projects/CmsWorkDetailView";

export default function OngoingWorkDetailsPage() {
  const params = useParams<{ id: string }>();
  useSetBreadcrumb([
    { label: "CMS" },
    { label: "Ongoing Works", href: "/cms/ongoing-works" },
    { label: "View Details" },
  ]);

  return <CmsWorkDetailView workId={params.id} listHref="/cms/ongoing-works" />;
}
