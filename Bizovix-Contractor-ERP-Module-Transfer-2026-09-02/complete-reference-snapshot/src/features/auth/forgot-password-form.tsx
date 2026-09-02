"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const forgotPasswordSchema = z.object({
  email: z.string().email("Enter a valid email"),
});

type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

export function ForgotPasswordForm() {
  const router = useRouter();
  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "owner@bizovix.app",
    },
  });

  async function onSubmit(values: ForgotPasswordValues) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    toast.success(`Password reset link sent to ${values.email}`);
    router.push("/login");
  }

  return (
    <div className="w-full max-w-[420px] space-y-6">
      <div className="space-y-2">
        <h2 className="text-3xl font-semibold tracking-tight">Forgot password</h2>
        <p className="text-sm text-muted">Use the preview recovery flow to return to the ERP login screen.</p>
      </div>
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="space-y-2">
          <label className="text-sm font-medium">Email</label>
          <Input {...form.register("email")} />
          <p className="text-xs text-danger">{form.formState.errors.email?.message}</p>
        </div>
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          <Send className="h-5 w-5" />
          {form.formState.isSubmitting ? "Sending reset link..." : "Send Reset Link"}
        </Button>
      </form>
      <div className="text-sm text-muted">
        <Link href="/login" className="text-primary hover:underline">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}

