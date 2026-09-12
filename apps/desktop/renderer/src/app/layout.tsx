import type { Metadata } from "next";
import { NumericInputBehavior } from "@/components/providers/NumericInputBehavior";
import { AppProviders } from "@/components/providers/AppProviders";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bizovix Contractor ERP",
  description: "Bizovix Contractor ERP - Desktop and SaaS ERP platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <NumericInputBehavior />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
