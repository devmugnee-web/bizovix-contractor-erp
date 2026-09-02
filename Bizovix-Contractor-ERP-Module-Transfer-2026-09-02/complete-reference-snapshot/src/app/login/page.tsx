import { redirect } from "next/navigation";

import { buildWorkspaceRoute } from "@/config/routes";

export default function LoginPage() {
  redirect(buildWorkspaceRoute("api", "/dashboard"));
}
