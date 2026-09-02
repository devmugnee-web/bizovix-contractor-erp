"use client";

import Image from "next/image";
import { useState } from "react";
import { CalendarDays, Clock3, Globe, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { AppDateInput } from "@/components/shared/app-date-input";
import { Button } from "@/components/ui/button";
import { appConfig } from "@/config/app";

const TIME_SLOTS = ["09:00 AM - 10:00 AM", "11:00 AM - 12:00 PM", "02:00 PM - 03:00 PM", "04:00 PM - 05:00 PM"];
const LANGUAGES = ["Bangla", "English"];
const DEMO_REQUEST_STORAGE_KEY = "bizovix:demo-request";

function defaultDemoDate() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().slice(0, 10);
}

export function BookDemoStep({ phoneNumber, onDone }: { phoneNumber: string; onDone: () => void }) {
  const [date, setDate] = useState(defaultDemoDate());
  const [timeSlot, setTimeSlot] = useState(TIME_SLOTS[0]);
  const [language, setLanguage] = useState(LANGUAGES[0]);
  const [submitting, setSubmitting] = useState(false);

  function handleBookDemo() {
    setSubmitting(true);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        DEMO_REQUEST_STORAGE_KEY,
        JSON.stringify({ phoneNumber, date, timeSlot, language, requestedAt: new Date().toISOString() }),
      );
    }

    toast.success("Demo request received. Our team will contact you shortly.");
    onDone();
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#eef6ff_0%,#f6f8f6_42%,#f6f8f6_100%)] px-4 py-10 sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-2xl items-center">
        <div className="w-full overflow-hidden rounded-[32px] border border-[#dbe5f0] bg-white p-7 shadow-[0_30px_80px_rgba(15,23,42,0.10)] sm:p-9">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-14 items-center">
              <Image src="/site-logo.png" alt={appConfig.appName} width={200} height={56} className="h-full w-auto object-contain" priority />
            </div>
            <h1 className="mt-6 text-[1.7rem] font-semibold tracking-tight text-[#14233b]">Book a Free Demo</h1>
            <p className="mt-2 max-w-md text-sm leading-6 text-[#5c6d86]">
              A team member will show you how to use {appConfig.appName} for your business and help with the initial setup.
            </p>
          </div>

          <div className="mt-7 space-y-4">
            <label className="grid gap-2">
              <span className="flex items-center gap-2 text-sm font-semibold text-[#24364f]">
                <CalendarDays className="h-4 w-4 text-[#2563eb]" />
                Select Date
              </span>
              <AppDateInput
                aria-label="Select Date"
                value={date}
                min={defaultDemoDate()}
                onChange={(value) => setDate(value)}
                inputClassName="h-12 rounded-2xl border-[#d8e1ee] bg-white px-4 text-sm text-[#24364f]"
              />
            </label>

            <label className="grid gap-2">
              <span className="flex items-center gap-2 text-sm font-semibold text-[#24364f]">
                <Clock3 className="h-4 w-4 text-[#2563eb]" />
                Select Time
              </span>
              <select
                value={timeSlot}
                onChange={(event) => setTimeSlot(event.target.value)}
                className="h-12 w-full appearance-none rounded-2xl border border-[#d8e1ee] bg-white px-4 text-sm text-[#24364f] outline-none"
              >
                {TIME_SLOTS.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2">
              <span className="flex items-center gap-2 text-sm font-semibold text-[#24364f]">
                <Globe className="h-4 w-4 text-[#2563eb]" />
                Select Language
              </span>
              <select
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                className="h-12 w-full appearance-none rounded-2xl border border-[#d8e1ee] bg-white px-4 text-sm text-[#24364f] outline-none"
              >
                {LANGUAGES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Button type="button" variant="outline" className="h-12 flex-1 rounded-2xl text-sm" onClick={onDone} disabled={submitting}>
              I&apos;ll Explore Myself
            </Button>
            <Button type="button" className="h-12 flex-1 rounded-2xl text-sm" onClick={handleBookDemo} disabled={submitting}>
              {submitting ? "Booking..." : "Book Free Demo"}
            </Button>
          </div>

          <div className="mt-6 flex items-center justify-center gap-2 text-xs font-semibold text-[#1c8a53]">
            <ShieldCheck className="h-4 w-4" />
            100% Safe &amp; Secure
          </div>
        </div>
      </div>
    </div>
  );
}
