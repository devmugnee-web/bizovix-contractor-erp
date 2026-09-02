import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

const lanDevOrigins = Object.values(networkInterfaces())
  .flatMap((addresses) => addresses ?? [])
  .filter((address) => address.family === "IPv4" && !address.internal)
  .map((address) => address.address);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // "standalone" is for self-hosting (desktop app / LAN server). Vercel builds
  // its own serverless functions and can't detect them correctly when the
  // build instead emits a standalone server, so skip it there (Vercel always
  // sets VERCEL=1 during builds).
  output: process.env.VERCEL ? undefined : "standalone",
  // The LAN development server is opened from other office PCs through this
  // machine's private address. Next blocks cross-origin dev assets/HMR unless
  // that origin is explicitly trusted, which otherwise leaves the app shell
  // stuck on its loading skeleton even though the page HTML and API respond.
  allowedDevOrigins: lanDevOrigins,
  images: {
    unoptimized: true,
  },
  // Dev-only: this app has ~60 routes whose screens are 6k-12k line files, so a
  // cold on-demand compile is expensive. Next disposes a compiled route after a
  // few seconds of inactivity by default, which makes returning to a page you
  // just visited recompile it from scratch. Keep routes hot for the whole dev
  // session so tab-hopping never pays the compile cost twice.
  onDemandEntries: {
    maxInactiveAge: 1000 * 60 * 60,
    pagesBufferLength: 50,
  },
  experimental: {
    // Rewrite barrel imports (`import { X } from "lucide-react"`) into direct
    // deep imports. 113 files pull icons from that barrel; without this the dev
    // bundler walks the whole icon set for every route it compiles.
    optimizePackageImports: ["lucide-react", "recharts", "date-fns", "framer-motion"],
  },
};

export default nextConfig;
