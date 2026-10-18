import path from "node:path";
import type { NextConfig } from "next";

// The parent folder (~/Cobrai) has its own package-lock.json, so Next would
// otherwise treat it as the workspace root and watch everything in it.
const projectRoot = path.resolve(__dirname);

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
  outputFileTracingRoot: projectRoot,
};

export default nextConfig;
