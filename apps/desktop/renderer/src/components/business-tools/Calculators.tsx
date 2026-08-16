"use client";
import * as React from "react";
import { Copy, RotateCcw } from "lucide-react";
import { PrimaryButton, SecondaryButton, SelectInput, TextInput } from "@bizovix/ui";
import { addValidity, copyText, dateSummary, money, numberValue } from "@/lib/business-tools";
import { Card, Field, Result, ToolLayout } from "./ToolLayout";
const tabs = ["VAT", "Tax", "Percentage", "Margin", "Bank Charge", "Loan / EMI", "PG/BG"] as const;
export function FinancialCalculator() {
  const [tab, setTab] = React.useState<(typeof tabs)[number]>("VAT"),
    [v, setV] = React.useState({
      amount: "100000",
      rate: "15",
      extra: "0",
      months: "12",
      mode: "percentage",
    });
  const amount = numberValue(v.amount),
    rate = numberValue(v.rate),
    extra = numberValue(v.extra),
    months = Math.max(1, numberValue(v.months));
  let results: Array<[string, string]> = [];
  if (tab === "VAT")
    results = [
      ["VAT Amount", money((amount * rate) / 100)],
      ["Total Including VAT", money(amount * (1 + rate / 100))],
    ];
  if (tab === "Tax")
    results = [
      ["Tax Amount", money((amount * rate) / 100)],
      ["Net Amount", money(amount * (1 - rate / 100))],
    ];
  if (tab === "Percentage")
    results = [
      ["Percentage Value", money((amount * rate) / 100)],
      ["After Increase", money(amount * (1 + rate / 100))],
      ["After Decrease", money(amount * (1 - rate / 100))],
    ];
  if (tab === "Margin")
    results = [
      ["Margin Amount", money((amount * rate) / 100)],
      ["Finance Amount", money(amount * (1 - rate / 100))],
    ];
  if (tab === "Bank Charge") {
    const charge = v.mode === "fixed" ? rate : (amount * rate) / 100,
      vat = (charge * extra) / 100;
    results = [
      ["Charge", money(charge)],
      ["VAT on Charge", money(vat)],
      ["Total Bank Charge", money(charge + vat)],
    ];
  }
  if (tab === "Loan / EMI") {
    const monthly = rate / 1200,
      emi = monthly
        ? (amount * monthly * Math.pow(1 + monthly, months)) / (Math.pow(1 + monthly, months) - 1)
        : amount / months;
    results = [
      ["Monthly EMI", money(emi)],
      ["Total Interest", money(emi * months - amount)],
      ["Total Payment", money(emi * months)],
    ];
  }
  if (tab === "PG/BG") {
    const margin = (amount * rate) / 100,
      commission = ((amount * extra) / 100) * (months / 12);
    results = [
      ["Margin Amount", money(margin)],
      ["Bank Finance", money(amount - margin)],
      ["Estimated Commission", money(commission)],
      ["Estimated Total Cost", money(margin + commission)],
    ];
  }
  return (
    <ToolLayout
      title="Financial Calculator"
      subtitle="Quick financial calculations for tender and business operations."
    >
      <div className="flex flex-wrap gap-2">
        {tabs.map((x) => (
          <button
            key={x}
            onClick={() => setTab(x)}
            className={`h-9 rounded-sm border px-3 text-xs font-semibold ${tab === x ? "border-biz-blue bg-biz-blue text-white" : "border-biz-border bg-white text-biz-text"}`}
          >
            {x}
          </button>
        ))}
      </div>
      <Card title={`${tab} Calculator`}>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={
                tab === "Loan / EMI"
                  ? "Loan Amount"
                  : tab === "PG/BG"
                    ? "Guarantee Amount"
                    : "Base / Principal Amount"
              }
              required
            >
              <TextInput
                type="number"
                min="0"
                value={v.amount}
                onChange={(e) => setV({ ...v, amount: e.target.value })}
              />
            </Field>
            {tab === "Bank Charge" && (
              <Field label="Charge Type">
                <SelectInput
                  value={v.mode}
                  onChange={(e) => setV({ ...v, mode: e.target.value })}
                  options={[
                    { value: "percentage", label: "Percentage" },
                    { value: "fixed", label: "Fixed" },
                  ]}
                />
              </Field>
            )}
            <Field
              label={
                tab === "Loan / EMI"
                  ? "Annual Interest Rate %"
                  : tab === "Margin" || tab === "PG/BG"
                    ? "Margin %"
                    : "Rate % / Fixed Charge"
              }
            >
              <TextInput
                type="number"
                min="0"
                value={v.rate}
                onChange={(e) => setV({ ...v, rate: e.target.value })}
              />
            </Field>
            {["Bank Charge", "PG/BG"].includes(tab) && (
              <Field label={tab === "PG/BG" ? "Commission %" : "VAT on Charge %"}>
                <TextInput
                  type="number"
                  min="0"
                  value={v.extra}
                  onChange={(e) => setV({ ...v, extra: e.target.value })}
                />
              </Field>
            )}
            {["Loan / EMI", "PG/BG"].includes(tab) && (
              <Field label={tab === "Loan / EMI" ? "Tenure (Months)" : "Validity Months"}>
                <TextInput
                  type="number"
                  min="1"
                  value={v.months}
                  onChange={(e) => setV({ ...v, months: e.target.value })}
                />
              </Field>
            )}
            <div className="flex items-end">
              <SecondaryButton
                onClick={() =>
                  setV({ amount: "0", rate: "0", extra: "0", months: "12", mode: "percentage" })
                }
              >
                <RotateCcw className="h-4 w-4" />
                Reset
              </SecondaryButton>
            </div>
          </div>
          <div className="grid content-start gap-3 sm:grid-cols-2">
            {results.map(([label, value]) => (
              <Result key={label} label={label} value={value} />
            ))}
            <PrimaryButton
              className="sm:col-span-2"
              onClick={() => copyText(results.map((x) => x.join(": ")).join("\n"))}
            >
              <Copy className="h-4 w-4" />
              Copy Result
            </PrimaryButton>
          </div>
        </div>
      </Card>
    </ToolLayout>
  );
}

const iso = (d: Date) => (Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString("en-GB"));
export function DateCalculator() {
  const [start, setStart] = React.useState(""),
    [end, setEnd] = React.useState(""),
    [value, setValue] = React.useState("30"),
    [unit, setUnit] = React.useState<"days" | "months" | "years">("days"),
    [extra, setExtra] = React.useState("28");
  const expiry = start ? addValidity(start, numberValue(value), unit) : null,
    diff = dateSummary(start, end),
    remaining = end ? dateSummary(new Date().toISOString().slice(0, 10), end) : null,
    status = !remaining
      ? "-"
      : remaining.days < 0
        ? "Expired"
        : remaining.days <= 30
          ? "Due Soon"
          : "Active";
  return (
    <ToolLayout
      title="Date & Maturity Calculator"
      subtitle="Calculate expiry, maturity, validity and remaining days for tenders and bank instruments."
    >
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Validity & Bank Instrument Maturity">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Start / Issue Date">
              <TextInput type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="Validity">
              <TextInput
                type="number"
                min="0"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </Field>
            <Field label="Unit">
              <SelectInput
                value={unit}
                onChange={(e) => setUnit(e.target.value as typeof unit)}
                options={[
                  { value: "days", label: "Days" },
                  { value: "months", label: "Months" },
                  { value: "years", label: "Years" },
                ]}
              />
            </Field>
          </div>
          <div className="mt-4">
            <Result
              label="Expiry / Maturity Date"
              value={expiry ? iso(expiry) : "Select a start date"}
            />
          </div>
        </Card>
        <Card title="Remaining Days">
          <Field label="Target / Expiry Date">
            <TextInput type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Result label="Remaining Days" value={remaining ? String(remaining.days) : "-"} />
            <Result
              label="Months + Days"
              value={
                remaining
                  ? `${remaining.duration.months ?? 0} months ${remaining.duration.days ?? 0} days`
                  : "-"
              }
            />
            <Result label="Status" value={status} />
          </div>
        </Card>
        <Card title="Date Difference">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Start Date">
              <TextInput type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="End Date">
              <TextInput type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </Field>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Result label="Total Days" value={diff ? String(diff.days) : "-"} />
            <Result
              label="Years + Months + Days"
              value={
                diff
                  ? `${diff.duration.years ?? 0} years ${diff.duration.months ?? 0} months ${diff.duration.days ?? 0} days`
                  : "-"
              }
            />
          </div>
        </Card>
        <Card title="Tender Date Calculator">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Submission Date">
              <TextInput type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="Validity Days">
              <TextInput
                type="number"
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setUnit("days");
                }}
              />
            </Field>
            <Field label="Security Extra Days">
              <TextInput type="number" value={extra} onChange={(e) => setExtra(e.target.value)} />
            </Field>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Result label="Tender Validity Date" value={expiry ? iso(expiry) : "-"} />
            <Result
              label="Required Security Validity"
              value={
                expiry
                  ? iso(addValidity(expiry.toISOString().slice(0, 10), numberValue(extra), "days"))
                  : "-"
              }
            />
          </div>
        </Card>
      </div>
    </ToolLayout>
  );
}
