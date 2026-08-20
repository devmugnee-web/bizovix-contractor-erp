"use client";

import { useParams } from "next/navigation";
import { ApprovedWorkDetails } from "../../ongoing-works/[id]/page";

export default function ArchivedWorkDetailsPage() {
  const { id } = useParams<{ id: string }>();
  return <ApprovedWorkDetails workId={id} mode="ARCHIVED" />;
}
