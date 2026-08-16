"use client";
import * as React from "react";
import { PrimaryButton, SecondaryButton, cn } from "@bizovix/ui";

export function useSettingsNotice() {
  const [notice, setNotice] = React.useState("");
  React.useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 3000);
    return () => clearTimeout(t);
  }, [notice]);
  const Notice = notice ? (
    <div className="fixed right-5 top-16 z-[60] rounded bg-biz-navy px-4 py-2 text-[12px] text-white">{notice}</div>
  ) : null;
  return { notify: setNotice, Notice };
}

export function SettingsSectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h1 className="text-page-title text-biz-text">{title}</h1>
      <p className="mt-1 text-[13px] text-biz-muted">{description}</p>
    </div>
  );
}

export function SettingsCard({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border border-biz-border bg-white shadow-card", className)}>
      <div className="border-b border-biz-border p-4">
        <h2 className="text-[14px] font-bold text-biz-text">{title}</h2>
        {description && <p className="mt-1 text-[11px] text-biz-muted">{description}</p>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Field({
  label,
  required = false,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-[11px] font-semibold text-biz-text">
      {label}
      {required && <span className="text-biz-danger"> *</span>}
      <div className="mt-1 font-normal">{children}</div>
      {hint && <p className="mt-1 text-[10px] font-normal text-biz-muted">{hint}</p>}
    </label>
  );
}

export function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded border border-biz-border px-3 py-2.5">
      <span>
        <span className="block text-[12px] font-semibold text-biz-text">{label}</span>
        {hint && <span className="block text-[10px] text-biz-muted">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          checked ? "bg-biz-blue" : "bg-biz-border",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </button>
    </label>
  );
}

export function SaveBar({
  dirty,
  saving,
  onSave,
  onReset,
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex justify-end gap-2">
      <SecondaryButton disabled={!dirty || saving} onClick={onReset}>
        Reset
      </SecondaryButton>
      <PrimaryButton disabled={!dirty || saving} onClick={onSave}>
        {saving ? "Saving..." : "Save Changes"}
      </PrimaryButton>
    </div>
  );
}

export function isDirty<T>(a: T, b: T) {
  return JSON.stringify(a) !== JSON.stringify(b);
}

/** Derives editable form state from query data exactly once per fetched value,
 * without the "setState-in-effect" cascading-render anti-pattern: the adjustment
 * happens during render (React's documented exception), guarded by identity
 * comparison against the last-applied source so it never loops. */
export function useSyncedForm<TData, TForm>(
  data: TData | null | undefined,
  toForm: (d: TData) => TForm,
): [TForm | null, React.Dispatch<React.SetStateAction<TForm | null>>] {
  const [form, setForm] = React.useState<TForm | null>(null);
  const [loadedFrom, setLoadedFrom] = React.useState<TData | null>(null);
  if (data && data !== loadedFrom) {
    setLoadedFrom(data);
    setForm(toForm(data));
  }
  return [form, setForm];
}
