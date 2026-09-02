import { redirect } from "next/navigation";

import { appConfig } from "@/config/app";
import { buildWorkspaceRoute } from "@/config/routes";

export default function DemoLoginPage() {
  if (!appConfig.demoModeFlag) {
    redirect(buildWorkspaceRoute("api", "/dashboard"));
  }

  redirect("/demo/dashboard");
}
