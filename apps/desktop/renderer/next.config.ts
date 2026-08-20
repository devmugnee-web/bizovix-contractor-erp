import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  allowedDevOrigins: ["192.168.68.72"],
  transpilePackages: ["@bizovix/api-client", "@bizovix/types", "@bizovix/ui", "@bizovix/utils", "@bizovix/validation"],
};

export default nextConfig;
