import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Next dev only trusts requests whose Host looks like localhost by default;
  // behind the nginx reverse proxy the browser-facing host is this VPS's LAN IP.
  allowedDevOrigins: ["10.88.88.99"],
  transpilePackages: ["@oltflow/core", "@oltflow/adapters"],
  // Prisma's generated client ships a native query-engine binary that must stay
  // an external `require()` at runtime, not get traced/bundled by Turbopack/webpack.
  serverExternalPackages: ["@prisma/client", "@oltflow/db"],
  outputFileTracingRoot: path.join(__dirname, "../.."),
  turbopack: {
    // Turbopack only resolves modules within this root; without it, the
    // workspace packages under ../../packages are treated as outside the
    // project and fail to resolve ("Module not found").
    root: path.join(__dirname, "../.."),
  },
};

export default nextConfig;
