import { SettingsNav } from "@/components/settings/SettingsNav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-page-title text-biz-text">Settings</h1>
        <p className="mt-1 text-[13px] text-biz-muted">
          Manage company, finance, tender, notification and system configuration.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <SettingsNav />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
