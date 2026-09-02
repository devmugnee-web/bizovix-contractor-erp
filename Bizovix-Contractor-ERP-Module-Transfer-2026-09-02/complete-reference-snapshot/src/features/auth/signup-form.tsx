"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signup } from "@/services/auth.service";
import { useAccountingPreferenceStore } from "@/stores/accounting-preference-store";
import { useSessionStore } from "@/stores/session-store";
import type { AccountingEntryMode } from "@/types/domain";

const signupSchema = z.object({
  companyName: z.string().min(2, "Company name is required"),
  name: z.string().min(2, "Your name is required"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  entryMode: z.enum(["simple", "double-entry"]),
});

type SignupValues = z.infer<typeof signupSchema>;

export function SignupForm() {
  const router = useRouter();
  const setSession = useSessionStore((state) => state.setSession);
  const entryMode = useAccountingPreferenceStore((state) => state.entryMode);
  const setEntryMode = useAccountingPreferenceStore((state) => state.setEntryMode);
  const form = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      companyName: "Bizovix Trading Limited",
      name: "Abu Kawser",
      email: "owner@bizovix.app",
      password: "password123",
      entryMode,
    },
  });

  async function onSubmit(values: SignupValues) {
    try {
      setEntryMode(values.entryMode as AccountingEntryMode);
      const authSession = await signup({
        companyName: values.companyName,
        name: values.name,
        email: values.email,
        password: values.password,
      });
      setSession("api", authSession.user, authSession.workspaceId ?? "");
      toast.success(`Account for ${values.companyName} verified successfully`);
      router.push("/onboarding");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create account");
    }
  }

  return (
    <div className="w-full max-w-[440px] space-y-6">
      <div className="space-y-2">
        <h2 className="text-3xl font-semibold tracking-tight">Create account</h2>
        <p className="text-sm text-muted">Create your tenant, company foundation, and continue straight into workspace onboarding.</p>
      </div>
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="space-y-2">
          <label className="text-sm font-medium">Company name</label>
          <Input {...form.register("companyName")} />
          <p className="text-xs text-danger">{form.formState.errors.companyName?.message}</p>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Full name</label>
          <Input {...form.register("name")} />
          <p className="text-xs text-danger">{form.formState.errors.name?.message}</p>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Email</label>
          <Input {...form.register("email")} />
          <p className="text-xs text-danger">{form.formState.errors.email?.message}</p>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Password</label>
          <Input type="password" {...form.register("password")} />
          <p className="text-xs text-danger">{form.formState.errors.password?.message}</p>
        </div>
        <div className="space-y-3 rounded-2xl border border-border bg-canvas p-4">
          <div>
            <div className="text-sm font-medium text-foreground">Voucher entry style</div>
            <p className="mt-1 text-xs text-muted">Choose whether this company starts with simple posting or full debit/credit entry.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              {
                value: "simple",
                title: "Simple Entry",
                description: "Users enter plain amounts, while the system keeps debit and credit logic in the background.",
              },
              {
                value: "double-entry",
                title: "Debit / Credit",
                description: "Users work directly with debit and credit columns from the start.",
              },
            ].map((option) => {
              const active = form.watch("entryMode") === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`rounded-2xl border p-4 text-left transition-colors ${active ? "border-primary bg-primary-soft" : "border-border bg-white hover:bg-canvas"}`}
                  onClick={() => form.setValue("entryMode", option.value as SignupValues["entryMode"], { shouldDirty: true })}
                >
                  <div className="font-medium text-foreground">{option.title}</div>
                  <div className="mt-1 text-sm text-muted">{option.description}</div>
                </button>
              );
            })}
          </div>
        </div>
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          <UserPlus className="h-5 w-5" />
          {form.formState.isSubmitting ? "Creating account..." : "Create Account"}
        </Button>
      </form>
      <div className="text-sm text-muted">
        Already have access?{" "}
        <Link href="/login" className="text-primary hover:underline">
          Go to sign in
        </Link>
      </div>
    </div>
  );
}

