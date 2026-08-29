"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { tokenStorage } from "@bizovix/api-client";

export default function RootPage() {
  const router = useRouter();

  React.useEffect(() => {
    const devAuthBypass = process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === "true";
    router.replace(devAuthBypass || tokenStorage.getAccessToken() ? "/dashboard" : "/login");
  }, [router]);

  return null;
}
