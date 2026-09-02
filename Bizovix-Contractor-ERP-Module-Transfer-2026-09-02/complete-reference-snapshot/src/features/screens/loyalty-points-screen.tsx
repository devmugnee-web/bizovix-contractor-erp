"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Info, Pencil, ShieldCheck, Sparkles, ThumbsUp, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { Input } from "@/components/ui/input";
import { formatAmount, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { deleteLoyaltySettings, getLoyaltySettings, saveLoyaltySettings } from "@/services/loyalty.service";
import { useSessionStore } from "@/stores/session-store";
import type { DataMode } from "@/types/domain";

const introSlides = [
  {
    title: "Increase Repeat Users",
    description: "Make users come to your stores again and again",
    icon: "user",
  },
  {
    title: "Setup customer rewards",
    description: "Give points on purchases and bring back repeat sales",
    icon: "gift",
  },
  {
    title: "Encourage customer loyalty",
    description: "Prevents your customers from going to other business",
    icon: "trust",
  },
] as const;

type SetupForm = {
  pointAmount: string;
  minimumInvoiceAmount: string;
  expiryEnabled: boolean;
  expiryDays: string;
  redeemAmount: string;
  redeemPoints: string;
};

const initialForm: SetupForm = {
  pointAmount: "100",
  minimumInvoiceAmount: "100",
  expiryEnabled: false,
  expiryDays: "",
  redeemAmount: "10",
  redeemPoints: "10",
};

export function LoyaltyPointsScreen({ mode }: { mode: DataMode }) {
  const workspaceId = useSessionStore((state) => (mode === "demo" ? state.demoSession : state.appSession)?.workspaceId ?? "");
  const [introIndex, setIntroIndex] = useState(2);
  const [showSetup, setShowSetup] = useState(false);
  const [setupStep, setSetupStep] = useState<1 | 2>(1);
  const [form, setForm] = useState<SetupForm>(initialForm);
  const [saving, setSaving] = useState(false);
  const [programActive, setProgramActive] = useState(false);
  const [deleteProgramOpen, setDeleteProgramOpen] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;
    void getLoyaltySettings(mode, workspaceId).then((settings) => {
      if (!settings.enabled) return;
      setProgramActive(true);
      setForm({ pointAmount: String(settings.rewardAmount), minimumInvoiceAmount: String(settings.minimumInvoiceAmount || ""), expiryEnabled: settings.expiryDays > 0, expiryDays: String(settings.expiryDays || ""), redeemAmount: String(settings.redeemAmount), redeemPoints: String(settings.redeemPoints) });
    }).catch(() => undefined);
  }, [mode, workspaceId]);

  const currentSlide = introSlides[introIndex];

  const updateForm = <K extends keyof SetupForm>(key: K, value: SetupForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleProceed = async () => {
    if (setupStep === 1) {
      if (Number(form.pointAmount) <= 0 || Number(form.minimumInvoiceAmount || 0) < 0 || (form.expiryEnabled && Number(form.expiryDays) <= 0)) {
        toast.error("Enter a valid earning rule before proceeding.");
        return;
      }
      setSetupStep(2);
      return;
    }
    if (!workspaceId || Number(form.redeemPoints) <= 0 || Number(form.redeemAmount) <= 0) {
      toast.error("Enter a valid redeem conversion.");
      return;
    }
    setSaving(true);
    try {
      await saveLoyaltySettings(mode, workspaceId, { rewardAmount: Number(form.pointAmount), minimumInvoiceAmount: Number(form.minimumInvoiceAmount || 0), expiryDays: form.expiryEnabled ? Number(form.expiryDays) : 0, redeemPoints: Number(form.redeemPoints), redeemAmount: Number(form.redeemAmount) });
      setProgramActive(true);
      toast.success("Loyalty program is active.");
      setShowSetup(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Loyalty setup could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const disablePointExpiry = async () => {
    if (!workspaceId || saving) return;
    setSaving(true);
    try {
      await saveLoyaltySettings(mode, workspaceId, {
        rewardAmount: Number(form.pointAmount),
        minimumInvoiceAmount: Number(form.minimumInvoiceAmount || 0),
        expiryDays: 0,
        redeemPoints: Number(form.redeemPoints),
        redeemAmount: Number(form.redeemAmount),
      });
      setForm((current) => ({ ...current, expiryEnabled: false, expiryDays: "" }));
      toast.success("Point expiry removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Point expiry could not be removed.");
    } finally {
      setSaving(false);
    }
  };

  const deleteProgram = async () => {
    if (!workspaceId || saving) return;
    setSaving(true);
    try {
      await deleteLoyaltySettings(mode, workspaceId);
      setProgramActive(false);
      setForm(initialForm);
      setDeleteProgramOpen(false);
      toast.success("Loyalty program deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Loyalty program could not be deleted.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-[4px] border border-[#dbe4ef] bg-white shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
      {showSetup ? (
        <>
          <div className="flex items-center justify-between gap-3 border-b border-[#cfe0f2] px-5 py-4">
            <h1 className="text-[1.05rem] font-semibold text-[#233555]">Loyalty Points Setup</h1>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#d7e1ee] text-[#52647e] transition hover:bg-[#f4f8fc] hover:text-[#233555]"
              onClick={() => setShowSetup(false)}
              aria-label="Close loyalty points setup"
              title="Close"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>

          <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[390px_minmax(0,1fr)]">
            <aside className="relative hidden min-h-0 overflow-hidden bg-[linear-gradient(180deg,#fff9e9_0%,#fffef9_100%)] lg:block">
              <SetupIllustration />
            </aside>

            <section className="flex min-h-0 flex-col bg-white">
              <div className="overflow-x-auto border-b border-[#e6edf5] px-4 py-4 sm:px-7 sm:py-6">
                <div className="flex min-w-max items-center gap-0 text-sm">
                  <StepBadge active={setupStep === 1}>1</StepBadge>
                  <span className={cn("ml-3 font-medium", setupStep === 1 ? "text-[#213556]" : "text-[#c4cbd8]")}>Reward Setup</span>
                  <span className="mx-3 h-px w-12 bg-[#c7cdd8] sm:w-24" />
                  <StepBadge active={setupStep === 2}>2</StepBadge>
                  <span className={cn("ml-3 font-medium", setupStep === 2 ? "text-[#213556]" : "text-[#c4cbd8]")}>Redeem Setup</span>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {setupStep === 1 ? (
                  <div className="px-4 py-5 sm:px-7 sm:py-6">
                    <div className="border-b border-[#dce4ee] pb-6">
                      <div className="text-[1.1rem] font-semibold text-[#25385a]">Reward Setup</div>
                    </div>

                    <div className="max-w-[640px] space-y-7 pt-7">
                      <FieldSection
                        label={
                          <span className="inline-flex items-center gap-1">
                            Loyalty Point Conversion <span className="text-[#ff3a5c]">*</span>
                            <InfoTip text="Set how much a customer must spend to earn 1 loyalty point." />
                          </span>
                        }
                        hint="Award a loyalty point to your customers for all of their purchases at your store."
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="relative">
                            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base text-[#324664]">tk</span>
                            <Input
                              money
                              value={form.pointAmount}
                              onChange={(event) => updateForm("pointAmount", event.target.value)}
                              placeholder="Enter Amount"
                              className="h-10 w-[155px] rounded-[6px] border-[#bfcbe0] pl-10 text-[15px] shadow-none"
                            />
                          </div>
                          <span className="text-lg text-[#64748b]">=</span>
                          <div className="flex h-10 min-w-[150px] items-center rounded-[6px] bg-[#f6ede0] px-4 text-[15px] font-medium text-[#5c6e8c]">1 Point</div>
                        </div>
                        <RulePreview>
                          Every full ৳{formatAmount(form.pointAmount)} spent earns 1 point automatically after the Sales Invoice is posted.
                        </RulePreview>
                      </FieldSection>

                      <div className="border-t border-[#dce4ee] pt-7">
                        <FieldSection
                          label="Minimum Value of Invoice for Earning Points"
                          hint="Customers must spend above your specified amount to get Loyalty points in each transaction."
                        >
                          <Input
                            money
                            value={form.minimumInvoiceAmount}
                            onChange={(event) => updateForm("minimumInvoiceAmount", event.target.value)}
                            placeholder="Enter Amount"
                            className="h-10 max-w-[322px] rounded-[6px] border-[#bfcbe0] text-[15px] shadow-none"
                          />
                          <RulePreview>
                            Invoices below ৳{formatAmount(form.minimumInvoiceAmount)} earn no points. Eligible invoices earn points from their final payable amount.
                          </RulePreview>
                        </FieldSection>
                      </div>

                      <div className="pt-1">
                        <div className="inline-flex items-center gap-2">
                          <label className="inline-flex items-center gap-3 text-[1rem] text-[#27395a]">
                            <input
                              type="checkbox"
                              checked={form.expiryEnabled}
                              onChange={(event) => updateForm("expiryEnabled", event.target.checked)}
                              className="h-[19px] w-[19px] rounded border-[#909db4]"
                            />
                            <span>Set Point Expiry</span>
                          </label>
                          <InfoTip text="Enable this to make unused points expire after the number of days you enter." />
                        </div>

                        {form.expiryEnabled ? (
                          <div className="mt-4 max-w-[220px]">
                            <Input
                              value={form.expiryDays}
                              onChange={(event) => updateForm("expiryDays", event.target.value)}
                              placeholder="Expiry in days"
                              className="h-10 rounded-[6px] border-[#bfcbe0] text-[15px] shadow-none"
                            />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="px-4 py-5 sm:px-7 sm:py-6">
                    <div className="border-b border-[#dce4ee] pb-6">
                      <div className="text-[1.1rem] font-semibold text-[#25385a]">Redeem Setup</div>
                    </div>

                    <div className="max-w-[640px] space-y-7 pt-7">
                      <FieldSection
                        label={
                          <span className="inline-flex items-center gap-1">
                            Redeem Conversion <span className="text-[#ff3a5c]">*</span>
                            <InfoTip text="Choose how many points a customer exchanges for a specific discount amount." />
                          </span>
                        }
                        hint="Customers can redeem loyalty points and receive a BDT discount during billing."
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Input
                            value={form.redeemPoints}
                            onChange={(event) => updateForm("redeemPoints", event.target.value)}
                            placeholder="Points"
                            className="h-10 w-[150px] rounded-[6px] border-[#bfcbe0] text-[15px] shadow-none"
                          />
                          <span className="text-lg text-[#64748b]">=</span>
                          <div className="relative">
                            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base text-[#324664]">tk</span>
                            <Input
                              money
                              value={form.redeemAmount}
                              onChange={(event) => updateForm("redeemAmount", event.target.value)}
                              placeholder="Discount Amount"
                              className="h-10 w-[185px] rounded-[6px] border-[#bfcbe0] pl-10 text-[15px] shadow-none"
                            />
                          </div>
                        </div>
                        <RulePreview>
                          At the next sale, each block of {formatNumber(Number(form.redeemPoints || 0))} points gives a ৳{formatAmount(form.redeemAmount)} discount. The customer&apos;s available balance is checked automatically.
                        </RulePreview>
                      </FieldSection>

                      <div className="border-t border-[#dce4ee] pt-7 text-sm leading-7 text-[#65758f]">
                        Configure redeeming these points and reward customers with discounts during checkout.
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-[#e5ebf4] bg-[#fbfbfc] px-5 py-3">
                <div className="flex items-center justify-end">
                  <Button
                    type="button"
                    className="h-10 rounded-full px-8 text-[0.98rem] font-medium"
                    onClick={() => void handleProceed()}
                    disabled={saving}
                  >
                    <CheckCircle2 className="h-5 w-5" />
                    {setupStep === 1 ? "Proceed" : saving ? "Saving..." : "Save & Activate"}
                  </Button>
                </div>
              </div>
            </section>
          </div>
        </>
      ) : (
        <>
          <div className="border-b border-[#cfe0f2] px-4 py-4 sm:px-7 sm:py-5">
            <div className="flex items-center gap-3">
              <h1 className="text-[1.05rem] font-semibold text-[#233555]">Loyalty Points</h1>
              {programActive ? <span className="rounded-full bg-[#eaf8ef] px-2.5 py-1 text-xs font-semibold text-[#178243]">Active</span> : null}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-8">
            {programActive ? (
              <ProgramOverview
                form={form}
                saving={saving}
                onEdit={(step) => {
                  setSetupStep(step);
                  setShowSetup(true);
                }}
                onDisableExpiry={() => void disablePointExpiry()}
                onDeleteProgram={() => setDeleteProgramOpen(true)}
              />
            ) : (
            <div className="mx-auto flex min-h-full w-full max-w-[760px] flex-col justify-center text-center">
              <div className="relative mx-auto flex h-[120px] w-[120px] shrink-0 items-center justify-center rounded-full bg-[#cfe8ff] sm:h-[148px] sm:w-[148px] xl:h-[168px] xl:w-[168px]">
                <Sparkles className="absolute left-[8px] top-[32px] h-5 w-5 text-[#9bcbff]" />
                <Sparkles className="absolute right-[18px] top-[22px] h-5 w-5 text-white" />
                <Sparkles className="absolute bottom-[40px] left-[12px] h-4 w-4 text-white" />
                {currentSlide.icon === "trust" ? (
                  <>
                    <ThumbsUp className="absolute left-[28%] top-[35%] h-[38%] w-[38%] fill-[#2f84df] text-[#2f84df]" />
                    <ShieldCheck className="absolute right-[21%] top-[26%] h-[38%] w-[38%] fill-white text-[#7bb8f3]" />
                  </>
                ) : currentSlide.icon === "gift" ? (
                  <div className="flex h-[78px] w-[78px] items-center justify-center rounded-full bg-white text-[#2f84df] shadow-[0_10px_24px_rgba(47,132,223,0.18)]">
                    <Sparkles className="h-10 w-10" />
                  </div>
                ) : (
                  <div className="flex h-[78px] w-[78px] items-center justify-center rounded-full bg-white text-[#2f84df] shadow-[0_10px_24px_rgba(47,132,223,0.18)]">
                    <ShieldCheck className="h-10 w-10" />
                  </div>
                )}
              </div>

              <div className="mt-5 text-[1.05rem] font-semibold text-[#223555] sm:mt-7 sm:text-[1.12rem]">{currentSlide.title}</div>
              <div className="mt-2 text-[0.9rem] text-[#667892] sm:mt-3 sm:text-[0.98rem]">{currentSlide.description}</div>
              {programActive ? (
                <div className="mx-auto mt-4 inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-full border border-[#f3d2a7] bg-[#fff9f0] px-4 py-2 text-sm text-[#704317]">
                  <span>Spend ৳{formatAmount(form.pointAmount)} → earn 1 point</span>
                  <span className="text-[#d7aa74]">•</span>
                  <span>{formatNumber(Number(form.redeemPoints || 0))} points → ৳{formatAmount(form.redeemAmount)} off</span>
                </div>
              ) : null}

              {!programActive ? (
                <div className="mx-auto mt-5 grid w-full max-w-[620px] gap-2 rounded-xl border border-[#e4ebf4] bg-[#f8fbff] p-4 text-left sm:grid-cols-3">
                  <div className="rounded-lg bg-white p-3 shadow-sm"><div className="text-xs font-semibold uppercase tracking-wide text-[#71819a]">Earn automatically</div><div className="mt-1 text-sm font-medium text-[#243754]">৳100.00 final bill = 1 point</div></div>
                  <div className="rounded-lg bg-white p-3 shadow-sm"><div className="text-xs font-semibold uppercase tracking-wide text-[#71819a]">Stored by customer</div><div className="mt-1 text-sm font-medium text-[#243754]">Posted invoices build the balance</div></div>
                  <div className="rounded-lg bg-white p-3 shadow-sm"><div className="text-xs font-semibold uppercase tracking-wide text-[#71819a]">Redeem next time</div><div className="mt-1 text-sm font-medium text-[#243754]">10 points = ৳10.00 discount</div></div>
                </div>
              ) : null}

              <div className="mt-5 flex items-center justify-center gap-5 text-[#9fa9c0] sm:mt-7">
                <button type="button" className="rounded-full p-1.5 transition hover:bg-[#f5f8fc]" onClick={() => setIntroIndex((current) => (current - 1 + introSlides.length) % introSlides.length)} aria-label="Previous slide">
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <div className="flex items-center gap-6">
                  {introSlides.map((_, index) => (
                    <span key={index} className={cn("rounded-full", introIndex === index ? "h-[4px] w-[16px] bg-[#8f97b0]" : "h-[4px] w-[4px] bg-[#d6dceb]")} />
                  ))}
                </div>
                <button type="button" className="rounded-full p-1.5 transition hover:bg-[#f5f8fc]" onClick={() => setIntroIndex((current) => (current + 1) % introSlides.length)} aria-label="Next slide">
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>

              <div className="mx-auto mt-8 grid w-full max-w-[520px] grid-cols-1 gap-4 sm:mt-10 sm:grid-cols-3 sm:gap-3 xl:mt-12">
                <StepItem number={1} label="Post a customer Sales Invoice" />
                <StepItem number={2} label="Points are added automatically" />
                <StepItem number={3} label="Redeem on the next invoice" />
              </div>

              <div className="mt-8 flex justify-center pb-1 xl:mt-10">
                <Button
                  type="button"
                  className="h-11 rounded-full px-9 text-[0.98rem] font-medium sm:h-12"
                  onClick={() => {
                    setSetupStep(1);
                    setShowSetup(true);
                  }}
                >
                  {programActive ? "Manage Program" : "Setup Now"}
                </Button>
              </div>
            </div>
            )}
          </div>
        </>
      )}
      <ConfirmationDialog
        open={deleteProgramOpen}
        onOpenChange={setDeleteProgramOpen}
        title="Delete Loyalty Program"
        description="This removes the loyalty program configuration and stops future points from being earned or redeemed. Existing invoices and customer transaction history will not be deleted."
        confirmLabel={saving ? "Deleting..." : "Delete Program"}
        tone="danger"
        onConfirm={() => void deleteProgram()}
      />
    </div>
  );
}

function ProgramOverview({
  form,
  saving,
  onEdit,
  onDisableExpiry,
  onDeleteProgram,
}: {
  form: SetupForm;
  saving: boolean;
  onEdit: (step: 1 | 2) => void;
  onDisableExpiry: () => void;
  onDeleteProgram: () => void;
}) {
  const amount = (value: string) => formatAmount(value);
  const count = (value: string) => formatNumber(Number(value || 0));

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-[#233555]">Program Overview</h2>
          <p className="mt-1 text-sm text-[#71809a]">Current loyalty earning and redemption rules.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" className="rounded-full border-[#efcaca] px-5 text-[#c43f3f] hover:bg-[#fff3f3]" onClick={onDeleteProgram}>
            <Trash2 className="h-4 w-4" />
            Delete Program
          </Button>
          <Button type="button" className="rounded-full px-6" onClick={() => onEdit(1)}>Manage Program</Button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-[#dbe6f2] bg-[#f7fbff] p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[#71819a]">Earning Rate</div>
          <div className="mt-2 text-xl font-semibold text-[#203653]">BDT {amount(form.pointAmount)} = 1 point</div>
          <div className="mt-1 text-sm text-[#687995]">Added automatically after an eligible invoice is posted.</div>
        </div>
        <div className="rounded-xl border border-[#f0d8b7] bg-[#fffaf3] p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[#9a6b31]">Redemption Value</div>
          <div className="mt-2 text-xl font-semibold text-[#6f461e]">{count(form.redeemPoints)} points = BDT {amount(form.redeemAmount)} off</div>
          <div className="mt-1 text-sm text-[#896b4c]">Available for use on a customer&apos;s next invoice.</div>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-[#dbe3ee] bg-white">
        <div className="border-b border-[#dbe3ee] px-5 py-4 font-semibold text-[#263a5a]">Loyalty Program Rules</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead className="bg-[#f7f9fc] text-left text-xs uppercase tracking-[0.05em] text-[#71819a]">
              <tr>
                <th className="px-5 py-3 font-semibold">Setting</th>
                <th className="px-5 py-3 font-semibold">Current Rule</th>
                <th className="px-5 py-3 text-center font-semibold">Status</th>
                <th className="px-5 py-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e7edf4] text-[#334866]">
              <ProgramRuleRow label="Point earning" value={`Spend BDT ${amount(form.pointAmount)} to earn 1 point`} onEdit={() => onEdit(1)} />
              <ProgramRuleRow label="Minimum invoice" value={`BDT ${amount(form.minimumInvoiceAmount)}`} onEdit={() => onEdit(1)} />
              <ProgramRuleRow
                label="Point expiry"
                value={form.expiryEnabled ? `${count(form.expiryDays)} days` : "Points do not expire"}
                status={form.expiryEnabled ? "Enabled" : "Not set"}
                onEdit={() => onEdit(1)}
                onDelete={form.expiryEnabled ? onDisableExpiry : undefined}
                disabled={saving}
              />
              <ProgramRuleRow label="Point redemption" value={`${count(form.redeemPoints)} points gives BDT ${amount(form.redeemAmount)} discount`} onEdit={() => onEdit(2)} />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ProgramRuleRow({
  label,
  value,
  status = "Active",
  onEdit,
  onDelete,
  disabled = false,
}: {
  label: string;
  value: string;
  status?: string;
  onEdit: () => void;
  onDelete?: () => void;
  disabled?: boolean;
}) {
  const active = status === "Active" || status === "Enabled";
  return (
    <tr>
      <td className="px-5 py-4 font-medium text-[#263a5a]">{label}</td>
      <td className="px-5 py-4">{value}</td>
      <td className="px-5 py-4 text-center">
        <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", active ? "bg-[#eaf8ef] text-[#178243]" : "bg-[#f1f4f8] text-[#71809a]")}>{status}</span>
      </td>
      <td className="px-5 py-4">
        <div className="flex items-center justify-end gap-1.5">
          <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#d9e3ef] text-[#3978b8] transition hover:bg-[#eef5ff]" onClick={onEdit} aria-label={`Edit ${label}`} title="Edit">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {onDelete ? (
            <button type="button" disabled={disabled} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#f0d4d4] text-[#c74747] transition hover:bg-[#fff3f3] disabled:opacity-50" onClick={onDelete} aria-label={`Remove ${label}`} title="Remove">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function StepBadge({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-full text-[1.05rem] font-semibold",
        active ? "bg-[#1878df] text-white" : "bg-[#f1f2f6] text-[#9aa4ba]",
      )}
    >
      {children}
    </span>
  );
}

function StepItem({ number, label }: { number: number; label: string }) {
  return (
    <div className="relative px-2 text-center">
      {number < 3 ? <div className="pointer-events-none absolute left-[58%] top-[21px] hidden h-px w-[92px] border-t border-dashed border-[#c8d4ea] sm:block" /> : null}
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[#f4f6fb] text-[1.15rem] font-medium text-[#7283a7] sm:h-12 sm:w-12 sm:text-[1.35rem]">{number}</div>
      <div className="mt-2 text-[0.9rem] leading-5 text-[#223555] sm:mt-4 sm:text-[0.96rem] sm:leading-7">{label}</div>
    </div>
  );
}

function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);

  return (
    <span ref={containerRef} className="relative inline-flex">
      <button
        type="button"
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[#a4afc2] transition hover:bg-[#eef4fb] hover:text-[#3978b8]"
        aria-label="Show help"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <span
          role="status"
          className="absolute left-1/2 top-7 z-30 w-56 -translate-x-1/2 rounded-lg border border-[#d9e3ef] bg-white px-3 py-2 text-left text-xs font-normal leading-5 text-[#53647d] shadow-[0_8px_24px_rgba(31,50,83,0.14)]"
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}

function FieldSection({
  label,
  hint,
  children,
}: {
  label: ReactNode;
  hint: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="text-[0.98rem] font-medium text-[#53698d]">{label}</div>
      <div className="mt-3">{children}</div>
      <div className="mt-2 text-[0.88rem] text-[#65758f]">{hint}</div>
    </div>
  );
}

function RulePreview({ children }: { children: ReactNode }) {
  return <div className="mt-3 rounded-lg border border-[#d9e8f7] bg-[#f6faff] px-3 py-2.5 text-[0.84rem] leading-5 text-[#49617f]">{children}</div>;
}

function SetupIllustration() {
  return (
    <div className="relative flex h-full items-center justify-center overflow-hidden">
      <div className="absolute left-12 top-1/2 h-[290px] w-[154px] -translate-y-1/2 rounded-[12px] bg-[linear-gradient(180deg,#ffb21a_0%,#ff9e00_100%)] shadow-[0_16px_40px_rgba(255,165,0,0.2)]">
        <div className="absolute inset-x-[8px] top-[26px] bottom-[26px] rounded-[10px] border-[4px] border-white/70 bg-[#dfeeff]" />
        <div className="absolute left-1/2 top-[16px] h-[3px] w-[38px] -translate-x-1/2 rounded-full bg-[#45546d]" />
        <div className="absolute left-1/2 top-[48%] h-[138px] w-[52px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#88554d]" />
        <div className="absolute left-[66px] top-[46%] flex h-[36px] w-[92px] items-center rounded-r-[14px] bg-[#f2bb5e]">
          <div className="h-full w-[40px] rounded-r-[12px] bg-[#ffd48e]" />
        </div>
        <div className="absolute left-[108px] top-[50%] h-[28px] w-[64px] -translate-y-1/2 rounded-full bg-[#ffc989]" />
        <div className="absolute left-[132px] top-[51%] h-[10px] w-[74px] -translate-y-1/2 rounded-full bg-[#f6c289]" />
      </div>

      <div className="absolute bottom-[92px] left-[28px]">
        <div className="relative flex items-end gap-1">
          <CoinStack />
          <CoinStack offset />
        </div>
      </div>

      <FloatingCoin className="left-[16px] top-[63%] h-[68px] w-[68px]" />
      <FloatingCoin className="left-[240px] top-[30%] h-[68px] w-[68px]" />
      <FloatingCoin className="left-[324px] top-[38%] h-[58px] w-[58px]" />
      <FloatingCoin className="left-[228px] top-[58%] h-[36px] w-[36px]" />
      <FloatingCoin className="left-[340px] top-[46%] h-[42px] w-[42px]" />
      <FloatingCoin className="left-[356px] top-[65%] h-[30px] w-[30px]" />
    </div>
  );
}

function CoinStack({ offset = false }: { offset?: boolean }) {
  return (
    <div className={cn("space-y-1", offset ? "translate-y-2" : "")}>
      <div className="h-3 w-11 rounded-full bg-[#ffb04f]" />
      <div className="h-3 w-11 rounded-full bg-[#ffad49]" />
      <div className="h-3 w-11 rounded-full bg-[#ffb657]" />
      <div className="h-3 w-11 rounded-full bg-[#ffae4b]" />
    </div>
  );
}

function FloatingCoin({ className }: { className: string }) {
  return (
    <div className={cn("absolute rounded-full border-[5px] border-[#ffd169] bg-[#ffad49] shadow-[0_12px_28px_rgba(255,175,73,0.28)]", className)}>
      <div className="absolute left-[10%] top-[18%] h-2 w-2 rotate-45 bg-[#ffe5a8]" />
    </div>
  );
}
