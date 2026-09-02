"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { appConfig } from "@/config/app";

const RESEND_COOLDOWN_SECONDS = 30;

export function OtpVerificationStep({
  phoneNumber,
  demoOtpCode,
  onResendCode,
  onVerified,
  onSkip,
  onChangeNumber,
}: {
  phoneNumber: string;
  demoOtpCode: string;
  onResendCode: () => void;
  onVerified: () => void;
  onSkip: () => void;
  onChangeNumber: () => void;
}) {
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setCooldown((current) => (current > 0 ? current - 1 : 0));
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [demoOtpCode]);

  function handleResend() {
    setCooldown(RESEND_COOLDOWN_SECONDS);
    onResendCode();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // No SMS gateway is wired up yet, so the code is shown right on this screen
    // (see the "Demo Mode" note below) instead of being texted to the phone —
    // swap this exact-match check for a real backend call once that's ready.
    if (otp !== demoOtpCode) {
      setError("The OTP code does not match. Please check and try again.");
      return;
    }

    setVerifying(true);
    setError("");
    await new Promise((resolve) => setTimeout(resolve, 400));
    setVerifying(false);
    onVerified();
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#eef4ff_0%,#f6f8fb_45%,#f6f8fb_100%)] px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-md">
        <div className="flex justify-end pb-3">
          <button
            type="button"
            onClick={onSkip}
            className="text-sm font-semibold text-[#5c6d86] underline-offset-4 hover:text-[#24364f] hover:underline"
          >
            Skip for Now
          </button>
        </div>

        <div className="flex min-h-[calc(100vh-9rem)] items-center">
          <div className="w-full overflow-hidden rounded-[32px] border border-[#dbe5f0] bg-white p-7 shadow-[0_30px_80px_rgba(15,23,42,0.10)] sm:p-9">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-14 items-center">
                <Image src="/site-logo.png" alt={appConfig.appName} width={200} height={56} className="h-full w-auto object-contain" priority />
              </div>
              <p className="mt-3 text-sm font-medium text-[#5c6d86]">Your Reliable Billing Software</p>
            </div>

            <div className="mt-7 text-center text-sm text-[#5c6d86]">
              OTP sent to <span className="font-semibold text-[#24364f]">{phoneNumber}</span>{" "}
              <button type="button" onClick={onChangeNumber} className="font-semibold text-[#2563eb] hover:underline">
                Change?
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-dashed border-[#9db8dd] bg-[#f0f6ff] px-4 py-3 text-center text-sm text-[#24364f]">
              Demo mode — SMS delivery is not enabled yet. Use this OTP code:{" "}
              <span className="font-mono text-base font-bold tracking-[0.2em] text-[#2563eb]">{demoOtpCode}</span>
            </div>

            <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label htmlFor="otp-code" className="text-sm font-semibold text-[#24364f]">
                  OTP Code
                </label>
                <Input
                  id="otp-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={demoOtpCode.length}
                  placeholder="Enter OTP Code"
                  value={otp}
                  onChange={(event) => {
                    setOtp(event.target.value.replace(/\D/g, ""));
                    if (error) {
                      setError("");
                    }
                  }}
                  className="h-12 rounded-2xl border-[#d8e1ee] bg-white text-center text-lg tracking-[0.4em]"
                />
                {error ? <p className="text-xs text-danger">{error}</p> : null}
                <div className="text-right text-xs text-[#7b8ba6]">
                  {cooldown > 0 ? (
                    <span>Resend OTP in {String(Math.floor(cooldown / 60)).padStart(2, "0")}:{String(cooldown % 60).padStart(2, "0")}</span>
                  ) : (
                    <button type="button" onClick={handleResend} className="font-semibold text-[#2563eb] hover:underline">
                      Resend OTP
                    </button>
                  )}
                </div>
              </div>

              <Button type="submit" className="h-12 w-full rounded-2xl text-base" disabled={verifying}>
                <ArrowRight className="h-5 w-5" />
                {verifying ? "Verifying..." : "Complete Login"}
              </Button>
            </form>

            <div className="mt-6 flex items-center justify-center gap-2 text-xs font-semibold text-[#1c8a53]">
              <ShieldCheck className="h-4 w-4" />
              100% Safe &amp; Secure
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
