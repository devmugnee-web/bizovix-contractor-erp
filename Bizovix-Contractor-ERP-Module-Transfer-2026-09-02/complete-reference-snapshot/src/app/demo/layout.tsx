import { redirect } from "next/navigation";

import { buildWorkspaceRoute } from "@/config/routes";

export default function RetiredDemoLayout({ children }: { children: React.ReactNode }) {
  void children;
  redirect(buildWorkspaceRoute("api", "/dashboard"));
}
