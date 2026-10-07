import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = "postgres://localhost/test";
  process.env.BETTER_AUTH_SECRET = "test-secret-with-at-least-thirty-two-characters";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  process.env.UPSTASH_REDIS_REST_URL = "https://example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  process.env.CORS_ORIGIN = "http://localhost:3001";
});

import { CURRENT_TERMS_VERSION } from "@ayni/env/terms";
import { getGitHubUserInfo } from "./github";

describe("GitHub OAuth profile validation", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("requires accepted current terms before contacting GitHub", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    await expect(getGitHubUserInfo("token", "1.0.0")).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("omits an unverified GitHub email so Better Auth rejects account creation", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: 17, login: "test-user" }))
      .mockResolvedValueOnce(
        Response.json([{ email: "person@example.test", verified: false, primary: true }]),
      );
    vi.stubGlobal("fetch", fetch);

    const userInfo = await getGitHubUserInfo("token", CURRENT_TERMS_VERSION);
    expect(userInfo).toMatchObject({ user: { id: "17", name: "test-user" } });
    expect(userInfo?.user).not.toHaveProperty("email");
    expect(userInfo?.user.emailVerified).toBe(false);
    expect(JSON.stringify(userInfo)).not.toContain("person@example.test");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("omits email when GitHub cannot return its email list", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: 17, login: "test-user" }))
      .mockResolvedValueOnce(new Response(null, { status: 403 }));
    vi.stubGlobal("fetch", fetch);

    const userInfo = await getGitHubUserInfo("token", CURRENT_TERMS_VERSION);
    expect(userInfo?.user).not.toHaveProperty("email");
  });

  it("uses a verified primary email and marks it verified", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: 17, login: "test-user", name: "Test User" }))
      .mockResolvedValueOnce(
        Response.json([
          { email: "old@example.test", verified: true, primary: false },
          { email: "person@example.test", verified: true, primary: true },
        ]),
      );
    vi.stubGlobal("fetch", fetch);

    await expect(getGitHubUserInfo("token", CURRENT_TERMS_VERSION)).resolves.toMatchObject({
      user: {
        id: "17",
        name: "Test User",
        email: "person@example.test",
        emailVerified: true,
      },
    });
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "https://api.github.com/user",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer token" }),
      }),
    );
  });
});
