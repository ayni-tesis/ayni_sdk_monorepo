import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@ayni/db", () => ({ db: {} }));
vi.hoisted(() => {
  process.env.DATABASE_URL = "postgres://localhost/test";
  process.env.BETTER_AUTH_SECRET = "test-secret-with-at-least-thirty-two-characters";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  process.env.UPSTASH_REDIS_REST_URL = "https://example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  process.env.CORS_ORIGIN = "http://localhost:3001";
});

import { auth } from "./index";

describe("account terms acceptance", () => {
  let response: Response;

  beforeAll(async () => {
    response = await auth.handler(
      new Request("http://localhost/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test User",
          email: "test@example.test",
          password: "password123",
          termsAcceptedVersion: "1.0.0",
        }),
      }),
    );
  });

  it("requires current terms acceptance after the Ayni notice is published", async () => {
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      message: "Debes aceptar los Términos y condiciones para crear tu cuenta.",
    });
  });
});
