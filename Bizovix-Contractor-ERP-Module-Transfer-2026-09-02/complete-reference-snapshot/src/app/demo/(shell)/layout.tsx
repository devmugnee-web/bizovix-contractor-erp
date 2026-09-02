import { redirect } from "next/navigation";

import { appConfig } from "@/config/app";
import { buildWorkspaceRoute } from "@/config/routes";
import { AppShell } from "@/layouts/app-shell";

export default function DemoShellLayout({ children }: { children: React.ReactNode }) {
  if (!appConfig.demoModeFlag) {
    redirect(buildWorkspaceRoute("api", "/dashboard"));
  }

  return <AppShell mode="demo">{children}</AppShell>;
}
