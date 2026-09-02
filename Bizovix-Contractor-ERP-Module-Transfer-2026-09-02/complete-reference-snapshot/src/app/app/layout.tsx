import { AppShell } from "@/layouts/app-shell";

// /app is the real, authenticated product — it always runs on the live API,
// never on mock/preview data. The separate /demo route is the trial sandbox
// for prospects who haven't signed up; that one still uses mock data.
export default function AppModeLayout({ children }: { children: React.ReactNode }) {
  return <AppShell mode="api">{children}</AppShell>;
}
