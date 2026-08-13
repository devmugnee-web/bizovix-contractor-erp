import * as React from "react";

export interface FormFieldProps {
  label: string;
  required?: boolean;
  htmlFor?: string;
  error?: string;
  helper?: string;
  children: React.ReactNode;
}

export function FormField({ label, required, htmlFor, error, helper, children }: FormFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[14px] font-semibold text-biz-text">
        {label} {required && <span className="text-biz-danger">*</span>}
      </label>
      {children}
      {error ? (
        <p className="text-[12px] text-biz-danger">{error}</p>
      ) : helper ? (
        <p className="text-[12px] text-biz-muted">{helper}</p>
      ) : null}
    </div>
  );
}
