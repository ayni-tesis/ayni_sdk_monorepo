// @vitest-environment jsdom
import { env } from "@ayni/env/web";
import { afterEach, expect, it, vi } from "vitest";
import nextConfig from "../../next.config";
import { httpClient } from "./http-client";

afterEach(() => vi.unstubAllGlobals());

it("keeps browser auth and dashboard API requests on the web origin", async () => {
  expect(httpClient.defaults.baseURL).toBe(window.location.origin);

  const rewrites = await nextConfig.rewrites?.();
  if (!rewrites || Array.isArray(rewrites)) throw new Error("Expected beforeFiles rewrites");

  for (const prefix of [
    "/api/auth",
    "/applications",
    "/workspaces",
    "/organizations",
    "/invitations",
    "/invitation-links",
    "/privacy-requests",
  ]) {
    expect(rewrites.beforeFiles).toContainEqual({
      source: `${prefix}/:path*`,
      destination: `${env.NEXT_PUBLIC_SERVER_URL}${prefix}/:path*`,
    });
  }

  const fetchMock = vi.fn(async (_request: RequestInfo | URL) =>
    Response.json({ session: null, user: null }),
  );
  vi.stubGlobal("fetch", fetchMock);
  vi.resetModules();

  const { authClient } = await import("./auth-client");
  await authClient.getSession();

  const request = fetchMock.mock.calls[0]?.[0];
  if (!request) throw new Error("Expected Better Auth to request the session");
  const requestURL = new URL(request instanceof Request ? request.url : String(request));
  expect(requestURL.origin).toBe(window.location.origin);
  expect(requestURL.pathname).toBe("/api/auth/get-session");
});
