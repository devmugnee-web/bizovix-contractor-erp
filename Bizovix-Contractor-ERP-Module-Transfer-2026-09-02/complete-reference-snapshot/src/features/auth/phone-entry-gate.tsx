"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { appConfig } from "@/config/app";
import type { DataMode } from "@/types/domain";

const PHONE_GATE_STORAGE_KEY = "bizovix:first-entry-phone";
const COUNTRY_CODE = "+880";

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "").trim();
}

export function PhoneEntryGate({
  mode,
  onContinue,
}: {
  mode: DataMode;
  onContinue: (phoneNumber: string) => Promise<void> | void;
}) {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const savedPhone = window.localStorage.getItem(`${PHONE_GATE_STORAGE_KEY}:${mode}`) ?? "";
    if (savedPhone) {
      setPhoneNumber(savedPhone.replace(COUNTRY_CODE, ""));
    }
  }, [mode]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const localDigits = normalizePhone(phoneNumber);

    if (localDigits.length < 7) {
      setError("Enter a valid phone number");
      return;
    }

    const fullPhoneNumber = `${COUNTRY_CODE}${localDigits}`;

    try {
      setSubmitting(true);
      setError("");
      if (typeof window !== "undefined") {
        window.localStorage.setItem(`${PHONE_GATE_STORAGE_KEY}:${mode}`, fullPhoneNumber);
      }
      await onContinue(fullPhoneNumber);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#eef4ff_0%,#f6f8fb_45%,#f6f8fb_100%)] px-4 py-10 sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md items-center">
        <div className="w-full overflow-hidden rounded-[32px] border border-[#dbe5f0] bg-white p-7 shadow-[0_30px_80px_rgba(15,23,42,0.10)] sm:p-9">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-14 items-center">
              <Image src="/site-logo.png" alt={appConfig.appName} width={200} height={56} className="h-full w-auto object-contain" priority />
            </div>
            <p className="mt-3 text-sm font-medium text-[#5c6d86]">Your Reliable Billing Software</p>
          </div>

          <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label htmlFor="phone-number" className="text-sm font-semibold text-[#24364f]">
                Phone Number
              </label>
              <div className="flex h-12 items-stretch overflow-hidden rounded-2xl border border-[#d8e1ee] bg-white focus-within:border-[#9db8dd]">
                <div className="flex items-center gap-1.5 border-r border-[#e5ecf5] bg-[#f7faff] px-3 text-sm font-semibold text-[#24364f]">
                  🇧🇩 {COUNTRY_CODE}
                </div>
                <Input
                  id="phone-number"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="1XXXXXXXXX"
                  value={phoneNumber}
                  onChange={(event) => {
                    setPhoneNumber(event.target.value.replace(/\D/g, ""));
                    if (error) {
                      setError("");
                    }
                  }}
                  className="h-full flex-1 rounded-none border-0 text-base"
                />
              </div>
              {error ? <p className="text-xs text-danger">{error}</p> : null}
            </div>

            <Button type="submit" className="h-12 w-full rounded-2xl text-base" disabled={submitting}>
              <ArrowRight className="h-5 w-5" />
              {submitting ? "Sending OTP..." : "Send OTP"}
            </Button>
          </form>

          <div className="mt-6 flex items-center justify-center gap-2 text-xs font-semibold text-[#1c8a53]">
            <ShieldCheck className="h-4 w-4" />
            100% Safe &amp; Secure
          </div>
        </div>
      </div>
    </div>
  );
}
