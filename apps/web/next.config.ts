import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "@ayni/env/web";
import type { NextConfig } from "next";

const appDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(appDir, "../..");
const turbopackRoot = existsSync(join(workspaceRoot, "packages")) ? workspaceRoot : appDir;

const nextConfig: NextConfig = {
  typedRoutes: true,
  reactCompiler: true,
  turbopack: {
    root: turbopackRoot,
  },
  // Keep Better Auth's cookies on the web origin for both auth and dashboard API calls.
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/api/auth/:path*",
          destination: `${env.NEXT_PUBLIC_SERVER_URL}/api/auth/:path*`,
        },
        {
          source: "/applications/:path*",
          destination: `${env.NEXT_PUBLIC_SERVER_URL}/applications/:path*`,
        },
        {
          source: "/workspaces/:path*",
          destination: `${env.NEXT_PUBLIC_SERVER_URL}/workspaces/:path*`,
        },
        {
          source: "/organizations/:path*",
          destination: `${env.NEXT_PUBLIC_SERVER_URL}/organizations/:path*`,
        },
        {
          source: "/invitations/:path*",
          destination: `${env.NEXT_PUBLIC_SERVER_URL}/invitations/:path*`,
        },
        {
          source: "/invitation-links/:path*",
          destination: `${env.NEXT_PUBLIC_SERVER_URL}/invitation-links/:path*`,
        },
        {
          source: "/privacy-requests/:path*",
          destination: `${env.NEXT_PUBLIC_SERVER_URL}/privacy-requests/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
