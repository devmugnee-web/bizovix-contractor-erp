import { redirect } from "next/navigation";

import { buildWorkspaceRoute } from "@/config/routes";

export default function HomePage() {
  redirect(buildWorkspaceRoute("mock", "/dashboard"));
}
