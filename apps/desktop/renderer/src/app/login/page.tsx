"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { tokenStorage, useDevLogin, useLogin } from "@bizovix/api-client";
import { loginSchema, type LoginFormValues } from "@bizovix/validation";
import { PrimaryButton, TextInput } from "@bizovix/ui";
import { ApiError } from "@bizovix/api-client";

export default function LoginPage() {
  const router = useRouter();
  const login = useLogin();
  const devLogin = useDevLogin();
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS !== "true") return;
    if (tokenStorage.getAccessToken()) {
      router.replace("/dashboard");
      return;
    }
    devLogin.mutate(undefined, { onSuccess: () => router.replace("/dashboard") });
  }, [devLogin, router]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  if (process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === "true") {
    return <div className="flex min-h-screen items-center justify-center bg-biz-bg text-[13px] text-biz-muted">Opening dashboard...</div>;
  }

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
            <div className="relative">
              <TextInput
                icon={Lock}
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                hasError={!!errors.password}
                className="pr-11"
                {...register("password")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-sm text-biz-muted transition-colors hover:text-biz-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-biz-blue/30"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
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
