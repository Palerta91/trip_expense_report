import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pg"],
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb"
    }
  }
};

export default nextConfig;
