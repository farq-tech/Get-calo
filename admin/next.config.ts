import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@calorie-scanner/shared"],
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
