import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

const lanDevOrigins = Object.values(networkInterfaces())
  .flatMap((addresses) => addresses ?? [])
  .filter((address) => address.family === "IPv4" && !address.internal)
  .map((address) => address.address);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  devIndicators: false,
  allowedDevOrigins: [
    ...new Set(["localhost", "127.0.0.1", ...lanDevOrigins, "103.166.39.76"]),
  ],
  async rewrites() {
    return [
      {
        source: "/api/backend/:path*",
        destination: "http://127.0.0.1:4000/api/v1/:path*",
      },
    ];
  },
  transpilePackages: ["@bizovix/api-client", "@bizovix/types", "@bizovix/ui", "@bizovix/utils", "@bizovix/validation"],
};

export default nextConfig;
