import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Self-hosted in Docker on orchid: emit .next/standalone (server.js plus the
  // traced node_modules) so the image needs no install step.
  output: "standalone",
  // pnpm keeps dependencies in the workspace root's node_modules/.pnpm, so
  // tracing must start there or the standalone server ships without them.
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
};

export default nextConfig;
