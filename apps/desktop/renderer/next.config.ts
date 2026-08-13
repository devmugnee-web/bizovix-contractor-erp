import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  transpilePackages: ["@bizovix/api-client", "@bizovix/types", "@bizovix/ui", "@bizovix/utils", "@bizovix/validation"],
};

export default nextConfig;
