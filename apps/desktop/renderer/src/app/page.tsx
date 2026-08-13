"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { tokenStorage } from "@bizovix/api-client";

export default function RootPage() {
  const router = useRouter();

  React.useEffect(() => {
    router.replace(tokenStorage.getAccessToken() ? "/dashboard" : "/login");
  }, [router]);

  return null;
}
