import type { ReactNode } from "react";
import { Building2, ShieldCheck, Users2 } from "lucide-react";

const bullets = [
  { icon: Building2, text: "One secure workspace for your company records" },
  { icon: Users2, text: "Role-based access for every team member" },
  { icon: ShieldCheck, text: "Controlled posting and approval for sensitive work" },
];

export function AuthShell({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-screen bg-[#f7f9fc] lg:grid-cols-[minmax(0,0.92fr)_minmax(520px,1.08fr)]">
      <section className="flex items-center border-b border-[#dfe6ef] bg-[#f3f7fb] px-6 py-12 lg:border-b-0 lg:border-r lg:px-[clamp(48px,6vw,112px)]">
        <div className="w-full max-w-[580px] space-y-8">
          <div className="inline-flex rounded-full border border-[#d8eadf] bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            {eyebrow}
          </div>
          <div className="space-y-4">
            <h1 className="max-w-[540px] text-4xl font-semibold leading-[1.08] tracking-tight text-[#122642] sm:text-5xl">{title}</h1>
            <p className="max-w-[520px] text-base leading-7 text-[#60708a]">
              Secure company access with clear roles, controlled actions, and dependable accounting records.
            </p>
          </div>
          <div className="grid gap-4">
            {bullets.map((bullet) => (
              <div key={bullet.text} className="flex items-center gap-3 text-sm font-medium text-[#334866]">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#d9e6f4] bg-white text-[#2563eb]">
                  <bullet.icon className="h-4 w-4" />
                </span>
                <span>{bullet.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="flex items-center justify-center bg-white px-6 py-12 lg:px-[clamp(56px,8vw,140px)]">{children}</section>
    </div>
  );
}
