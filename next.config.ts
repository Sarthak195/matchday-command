import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output produces a self-contained server.js for the Cloud Run Dockerfile.
  output: "standalone",
};

export default nextConfig;
