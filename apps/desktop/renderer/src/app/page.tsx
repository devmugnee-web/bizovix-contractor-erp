import { redirect } from "next/navigation";

export default function RootPage() {
  redirect(process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === "true" ? "/dashboard" : "/login");
}
