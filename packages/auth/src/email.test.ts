import { afterEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = "postgres://localhost/test";
  process.env.BETTER_AUTH_SECRET = "test-secret-with-at-least-thirty-two-characters";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  process.env.UPSTASH_REDIS_REST_URL = "https://example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  process.env.CORS_ORIGIN = "http://localhost:3001";
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.RESEND_FROM_EMAIL = "Ayni <verified@example.test>";
});

import { env } from "@ayni/env/server";
import { sendAyniEmail } from "./email";

afterEach(() => vi.unstubAllGlobals());

describe("Resend account email delivery", () => {
  it("sends through the Resend API with the configured sender", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetch);

    await sendAyniEmail("person@example.test", "Subject", "<p>Message</p>");

    expect(fetch).toHaveBeenCalledWith("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer re_test_key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.RESEND_FROM_EMAIL,
        to: ["person@example.test"],
        subject: "Subject",
        html: "<p>Message</p>",
      }),
    });
  });

  it("reports provider failures without exposing credentials or response bodies", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response("private provider response", { status: 429 }));
    vi.stubGlobal("fetch", fetch);

    await expect(sendAyniEmail("person@example.test", "Subject", "<p>Message</p>")).rejects.toThrow(
      "Resend email request failed with status 429.",
    );
    await expect(
      sendAyniEmail("person@example.test", "Subject", "<p>Message</p>"),
    ).rejects.not.toThrow("private provider response");
  });
});
