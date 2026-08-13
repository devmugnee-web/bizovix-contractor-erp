"use client";

import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Lock, Mail } from "lucide-react";
import { useLogin } from "@bizovix/api-client";
import { loginSchema, type LoginFormValues } from "@bizovix/validation";
import { PrimaryButton, TextInput } from "@bizovix/ui";
import { ApiError } from "@bizovix/api-client";

export default function LoginPage() {
  const router = useRouter();
  const login = useLogin();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  const onSubmit = (values: LoginFormValues) => {
    login.mutate(values, {
      onSuccess: () => router.push("/dashboard"),
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-biz-bg px-4">
      <div className="w-full max-w-[400px] rounded-lg border border-biz-border bg-biz-surface p-8 shadow-card">
        <div className="mb-6 flex flex-col items-center gap-1">
          <span className="text-page-title text-biz-navy">BIZOVIX</span>
          <span className="text-[12px] text-biz-muted">Contractor ERP</span>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[14px] font-semibold text-biz-text">Email</label>
            <TextInput
              icon={Mail}
              type="email"
              placeholder="admin@bizovix.com"
              hasError={!!errors.email}
              {...register("email")}
            />
            {errors.email && <p className="text-[12px] text-biz-danger">{errors.email.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[14px] font-semibold text-biz-text">Password</label>
            <TextInput
              icon={Lock}
              type="password"
              placeholder="Enter your password"
              hasError={!!errors.password}
              {...register("password")}
            />
            {errors.password && <p className="text-[12px] text-biz-danger">{errors.password.message}</p>}
          </div>

          {login.isError && (
            <p className="text-[13px] text-biz-danger">
              {login.error instanceof ApiError ? login.error.message : "Login failed"}
            </p>
          )}

          <PrimaryButton type="submit" disabled={login.isPending} className="mt-2 w-full">
            {login.isPending ? "Signing in..." : "Sign In"}
          </PrimaryButton>
        </form>
      </div>
    </div>
  );
}
