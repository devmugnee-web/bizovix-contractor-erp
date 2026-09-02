"use client";

import { useState } from "react";

import type { DataMode } from "@/types/domain";
import { BookDemoStep } from "./book-demo-step";
import { OtpVerificationStep } from "./otp-verification-step";
import { PhoneEntryGate } from "./phone-entry-gate";

type FirstRunStep = "phone" | "otp" | "demo";

function generateOtpCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/** Shown once, the very first time the app opens on this device — phone number,
 * then OTP, then an optional demo booking — before the real workspace ever mounts. */
export function FirstRunExperience({ mode, onComplete }: { mode: DataMode; onComplete: () => void }) {
  const [step, setStep] = useState<FirstRunStep>("phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otpCode, setOtpCode] = useState("");

  if (step === "phone") {
    return (
      <PhoneEntryGate
        mode={mode}
        onContinue={(nextPhoneNumber) => {
          setPhoneNumber(nextPhoneNumber);
          setOtpCode(generateOtpCode());
          setStep("otp");
        }}
      />
    );
  }

  if (step === "otp") {
    return (
      <OtpVerificationStep
        phoneNumber={phoneNumber}
        demoOtpCode={otpCode}
        onResendCode={() => setOtpCode(generateOtpCode())}
        onVerified={() => setStep("demo")}
        onSkip={() => setStep("demo")}
        onChangeNumber={() => setStep("phone")}
      />
    );
  }

  return <BookDemoStep phoneNumber={phoneNumber} onDone={onComplete} />;
}
