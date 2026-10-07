import { describe, expect, it, vi } from "vitest";

vi.mock("@ayni/db", () => ({ db: {} }));
vi.hoisted(() => {
  process.env.DATABASE_URL = "postgres://localhost/test";
  process.env.BETTER_AUTH_SECRET = "test-secret-with-at-least-thirty-two-characters";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  process.env.UPSTASH_REDIS_REST_URL = "https://example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  process.env.CORS_ORIGIN = "http://localhost:3001";
  process.env.GITHUB_CLIENT_ID = "github-client-id";
  process.env.GITHUB_CLIENT_SECRET = "github-client-secret";
});

import { CURRENT_TERMS_VERSION } from "@ayni/env/terms";
import { auth } from "./index";

async function post(path: string, body: unknown) {
  return auth.handler(
    new Request(`http://localhost/api/auth${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("account authentication guards", () => {
  it("blocks email account creation while the Ayni privacy notice is a draft", async () => {
    const response = await post("/sign-up/email", {
      name: "Test User",
      email: "test@example.test",
      password: "password123",
      termsAcceptedVersion: CURRENT_TERMS_VERSION,
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      message:
        "El registro no está disponible mientras el aviso de privacidad de Ayni siga pendiente.",
    });
  });

  it.each([
    ["without", undefined],
    ["with an outdated", "1.0.0"],
    ["with an empty", ""],
  ])(
    "rejects an email sign-in %s current terms before checking credentials",
    async (_, version) => {
      const response = await post("/sign-in/email", {
        email: "test@example.test",
        password: "password123",
        termsAcceptedVersion: version,
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        message: "Debes aceptar los Términos y condiciones para iniciar sesión.",
      });
    },
  );

  it("requires current terms before starting GitHub OAuth", async () => {
    const response = await post("/sign-in/social", { provider: "github" });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      message: "Debes aceptar los Términos y condiciones para iniciar sesión.",
    });
  });

  it("rejects custom GitHub scopes that could request repository access", async () => {
    const response = await post("/sign-in/social", {
      provider: "github",
      scopes: ["repo"],
      additionalData: { termsAcceptedVersion: CURRENT_TERMS_VERSION },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      message: "GitHub solo solicita acceso al perfil y al correo electrónico.",
    });
  });

  it.each(["", " ", "a"])(
    "rejects a profile name outside the accepted range (%j)",
    async (name) => {
      const response = await post("/update-user", { name });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        message: "El nombre debe tener entre 2 y 100 caracteres.",
      });
    },
  );

  it("rejects a profile name longer than the signup limit", async () => {
    const response = await post("/update-user", { name: "a".repeat(101) });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      message: "El nombre debe tener entre 2 y 100 caracteres.",
    });
  });

  it("allows an account to sign in while email verification is pending", () => {
    expect(auth.options.emailAndPassword).toMatchObject({
      autoSignIn: true,
      requireEmailVerification: false,
    });
    expect(auth.options.emailVerification).toMatchObject({
      sendOnSignUp: true,
      autoSignInAfterVerification: false,
    });
  });

  it("does not let the profile update route change terms acceptance", async () => {
    const response = await post("/update-user", {
      name: "Updated Name",
      termsAcceptedVersion: CURRENT_TERMS_VERSION,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      message: "Solo puedes actualizar tu nombre desde este flujo.",
    });
  });
});
