import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  devIndicators: false,
  allowedDevOrigins: ["localhost", "127.0.0.1", "192.168.68.84", "103.166.39.76"],
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
